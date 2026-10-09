-- Incremental access management; attendance_module is already applied.
-- No Auth tokens, action links, passwords, or OTPs are persisted here.
BEGIN;

-- Only email delivery outcome needs operational persistence. Account activation
-- is derived from Auth; historical employees keep every existing field intact.
ALTER TABLE public.employees
 ADD COLUMN invitation_email_status text NOT NULL DEFAULT 'not_sent'
 CONSTRAINT employees_invitation_email_status_check
 CHECK (invitation_email_status IN ('not_sent','sent','rate_limited','error'));

-- PostgreSQL requires the complete function body for CREATE OR REPLACE.
-- Existing employee/schedule/import/close/correct behavior is unchanged.
CREATE OR REPLACE FUNCTION attendance_private.admin_command(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.employees; old_e public.employees; s public.attendance_schedules; old_s public.attendance_schedules;
 r public.attendance_records; old_r public.attendance_records; cfg public.attendance_settings;
 reason text:=btrim(coalesce(p_data->>'reason','')); user_id uuid:=auth.uid();
 imp public.attendance_imports; entry jsonb; target uuid; stamp timestamptz; mins integer; tolerance integer; target_date date; n integer:=0; skipped integer:=0;
BEGIN
 IF user_id IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo administradores pueden administrar asistencia'; END IF;
 IF length(reason)<3 OR length(reason)>2000 THEN RAISE EXCEPTION 'Indica un motivo de 3 a 2000 caracteres'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('city-attendance-admin'));
 IF p_action='lookup_account' THEN
  RETURN (SELECT jsonb_build_object('id',u.id,'role',p.role,'activated',u.email_confirmed_at IS NOT NULL AND coalesce(u.encrypted_password,'')<>'','email_confirmed',u.email_confirmed_at IS NOT NULL) FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE lower(u.email)=lower(p_data->>'email'));
 ELSIF p_action='access_statuses' THEN
  RETURN (SELECT coalesce(jsonb_object_agg(access_employee.id,CASE WHEN access_employee.profile_id IS NULL THEN 'no_access' WHEN access_user.email_confirmed_at IS NOT NULL AND coalesce(access_user.encrypted_password,'')<>'' THEN 'activated' ELSE 'pending' END),'{}'::jsonb) FROM public.employees access_employee LEFT JOIN auth.users access_user ON access_user.id=access_employee.profile_id);
 ELSIF p_action='invitation_email' THEN
  SELECT * INTO old_e FROM public.employees WHERE id=(p_data->>'id')::uuid FOR UPDATE;
  IF old_e.id IS NULL OR old_e.profile_id IS NULL THEN RAISE EXCEPTION 'Empleado sin acceso vinculado'; END IF;
  UPDATE public.employees SET invitation_email_status=p_data->>'status' WHERE id=old_e.id RETURNING * INTO e;
  INSERT INTO public.attendance_audit_log(employee_id,action,before_data,after_data,performed_by,reason) VALUES(e.id,'invitation_email',jsonb_build_object('email_status',old_e.invitation_email_status),jsonb_build_object('email_status',e.invitation_email_status),user_id,reason);
  RETURN jsonb_build_object('success',true);
 ELSIF p_action='employee' THEN
  IF nullif(p_data->>'id','') IS NOT NULL THEN
   SELECT * INTO old_e FROM public.employees WHERE id=(p_data->>'id')::uuid FOR UPDATE;
   IF old_e.id IS NULL THEN RAISE EXCEPTION 'Empleado no encontrado'; END IF;
   IF old_e.profile_id IS NOT NULL AND lower(coalesce(p_data->>'email',''))<>coalesce(old_e.email,'') THEN RAISE EXCEPTION 'El correo de una cuenta vinculada se cambia desde Auth, no desde personal'; END IF;
   UPDATE public.employees SET full_name=btrim(p_data->>'full_name'),position=left(coalesce(p_data->>'position',''),200),email=nullif(p_data->>'email',''),phone=left(p_data->>'phone',40),active=coalesce((p_data->>'active')::boolean,old_e.active),late_tolerance_minutes=coalesce((p_data->>'late_tolerance_minutes')::integer,old_e.late_tolerance_minutes) WHERE id=old_e.id RETURNING * INTO e;
  ELSE
   INSERT INTO public.employees(full_name,normalized_name,position,email,phone,active,late_tolerance_minutes) VALUES(btrim(p_data->>'full_name'),'',left(coalesce(p_data->>'position',''),200),nullif(p_data->>'email',''),left(p_data->>'phone',40),coalesce((p_data->>'active')::boolean,true),coalesce((p_data->>'late_tolerance_minutes')::integer,5)) RETURNING * INTO e;
  END IF;
  INSERT INTO public.attendance_audit_log(employee_id,action,before_data,after_data,performed_by,reason) VALUES(e.id,'employee',CASE WHEN old_e.id IS NULL THEN NULL ELSE to_jsonb(old_e) END,to_jsonb(e),user_id,reason);
  IF old_e.id IS NOT NULL AND old_e.late_tolerance_minutes IS DISTINCT FROM e.late_tolerance_minutes THEN
   INSERT INTO public.attendance_audit_log(employee_id,action,before_data,after_data,performed_by,reason) VALUES(e.id,'employee_tolerance_changed',to_jsonb(old_e),to_jsonb(e),user_id,reason);
  END IF;
  RETURN to_jsonb(e);
 ELSIF p_action='link' THEN
  SELECT * INTO old_e FROM public.employees WHERE id=(p_data->>'id')::uuid FOR UPDATE;
  IF old_e.id IS NULL OR NOT old_e.active THEN RAISE EXCEPTION 'Empleado no encontrado o inactivo'; END IF;
  target:=(p_data->>'profile_id')::uuid;
  IF old_e.profile_id IS NOT NULL AND old_e.profile_id<>target THEN RAISE EXCEPTION 'Empleado ya vinculado a otra cuenta'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE u.id=target AND lower(u.email)=lower(old_e.email) AND p.role='employee') THEN RAISE EXCEPTION 'La cuenta debe tener rol employee y el mismo correo. No se convierte una cuenta admin/warehouse automáticamente'; END IF;
  UPDATE public.employees SET profile_id=target WHERE id=old_e.id RETURNING * INTO e;
  INSERT INTO public.attendance_audit_log(employee_id,action,before_data,after_data,performed_by,reason) VALUES(e.id,'account_link',to_jsonb(old_e),to_jsonb(e),user_id,reason);
  RETURN to_jsonb(e);
 ELSIF p_action='settings' THEN
  SELECT * INTO cfg FROM public.attendance_settings WHERE id=1 FOR UPDATE;
  UPDATE public.attendance_settings SET absence_cutoff_minutes=(p_data->>'absence_cutoff_minutes')::integer WHERE id=1;
  INSERT INTO public.attendance_audit_log(action,before_data,after_data,performed_by,reason) VALUES('settings',to_jsonb(cfg),(SELECT to_jsonb(c) FROM public.attendance_settings c WHERE id=1),user_id,reason);
  RETURN jsonb_build_object('success',true);
 ELSIF p_action='schedule' THEN
  entry:=p_data;
 ELSIF p_action='import' THEN
  IF jsonb_typeof(p_data->'rows')<>'array' OR jsonb_array_length(p_data->'rows') NOT BETWEEN 1 AND 20000 THEN RAISE EXCEPTION 'Importación vacía o demasiado grande'; END IF;
  target_date:=nullif(p_data->>'target_date','')::date;
  IF target_date IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_data->'rows') x WHERE (x->>'work_date')::date IS DISTINCT FROM target_date) THEN RAISE EXCEPTION 'Selecciona una fecha objetivo; todas las filas deben pertenecer a esa fecha'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_data->'rows') x GROUP BY x->>'employee_id',coalesce(x->>'shift','day') HAVING count(*)>1) THEN RAISE EXCEPTION 'Empleado y turno duplicados en la fecha objetivo'; END IF;
  SELECT * INTO imp FROM public.attendance_imports WHERE request_id=(p_data->>'request_id')::uuid;
  IF imp.id IS NOT NULL THEN
   IF imp.payload<>p_data THEN RAISE EXCEPTION 'Este intento ya fue usado para otra importación'; END IF;
   RETURN jsonb_build_object('id',imp.id,'reused',true);
  END IF;
  INSERT INTO public.attendance_imports(source_file_name,file_hash,period_start,period_end,imported_by,warnings,request_id,payload)
  SELECT left(p_data->>'file_name',200),p_data->>'file_hash',min((x->>'work_date')::date),max((x->>'work_date')::date),user_id,coalesce(p_data->'warnings','[]'),(p_data->>'request_id')::uuid,p_data FROM jsonb_array_elements(p_data->'rows') x RETURNING * INTO imp;
 ELSE
  entry:=NULL;
 END IF;
 IF p_action IN ('schedule','import') THEN
  FOR entry IN SELECT value FROM jsonb_array_elements(CASE WHEN p_action='schedule' THEN jsonb_build_array(p_data) ELSE p_data->'rows' END) LOOP
   SELECT * INTO e FROM public.employees WHERE id=(entry->>'employee_id')::uuid AND active FOR NO KEY UPDATE;
   IF e.id IS NULL THEN RAISE EXCEPTION 'Selecciona un empleado activo para cada horario'; END IF;
   SELECT * INTO old_s FROM public.attendance_schedules WHERE employee_id=e.id AND work_date=(entry->>'work_date')::date AND shift=coalesce(entry->>'shift','day') FOR UPDATE;
   -- Optimistic conflict check: confirmation describes the exact previous schedule.
   IF p_action='import' AND nullif(entry->>'previous_version','')::timestamptz IS DISTINCT FROM old_s.updated_at THEN RAISE EXCEPTION 'Un horario cambió después de la vista previa; vuelve a revisar el Excel'; END IF;
   IF old_s.id IS NOT NULL AND old_s.scheduled_time IS NOT DISTINCT FROM nullif(entry->>'scheduled_time','')::time AND old_s.is_day_off IS NOT DISTINCT FROM (entry->>'is_day_off')::boolean THEN skipped:=skipped+1; CONTINUE; END IF;
   IF EXISTS(SELECT 1 FROM public.attendance_records WHERE schedule_id=old_s.id) THEN RAISE EXCEPTION 'El día ya tiene una marcación o cierre. Corrige desde historial con motivo'; END IF;
   INSERT INTO public.attendance_schedules(employee_id,work_date,shift,scheduled_time,is_day_off,source_import_id)
   VALUES(e.id,(entry->>'work_date')::date,coalesce(entry->>'shift','day'),nullif(entry->>'scheduled_time','')::time,(entry->>'is_day_off')::boolean,imp.id)
   ON CONFLICT(employee_id,work_date,shift) DO UPDATE SET scheduled_time=EXCLUDED.scheduled_time,is_day_off=EXCLUDED.is_day_off,source_import_id=EXCLUDED.source_import_id RETURNING * INTO s;
   INSERT INTO public.attendance_audit_log(employee_id,action,before_data,after_data,performed_by,reason) VALUES(e.id,'schedule',CASE WHEN old_s.id IS NULL THEN NULL ELSE to_jsonb(old_s) END,to_jsonb(s),user_id,reason);
   n:=n+1;
  END LOOP;
  IF p_action='import' THEN INSERT INTO public.attendance_audit_log(action,after_data,performed_by,reason) VALUES('schedule_import',jsonb_build_object('import_id',imp.id,'target_date',target_date,'changed',n,'unchanged',skipped),user_id,reason); END IF;
  RETURN jsonb_build_object('success',true,'id',imp.id,'count',n,'unchanged',skipped);
 ELSIF p_action='close' THEN
  IF (p_data->>'work_date')::date>(now() AT TIME ZONE 'America/Lima')::date THEN RAISE EXCEPTION 'No se puede cerrar un día futuro'; END IF;
  FOR s IN SELECT * FROM public.attendance_schedules WHERE work_date=(p_data->>'work_date')::date AND shift='day' ORDER BY employee_id FOR UPDATE LOOP
   SELECT * INTO old_r FROM public.attendance_records WHERE schedule_id=s.id FOR UPDATE;
   IF old_r.id IS NULL OR (old_r.status='pending' AND old_r.check_in_at IS NULL) THEN
    INSERT INTO public.attendance_records(employee_id,schedule_id,work_date,scheduled_time,status,registered_by,notes,tolerance_minutes_applied) VALUES(s.employee_id,s.id,s.work_date,s.scheduled_time,CASE WHEN s.is_day_off THEN 'day_off' ELSE 'absent' END,user_id,reason,coalesce(old_r.tolerance_minutes_applied,(SELECT late_tolerance_minutes FROM public.employees WHERE id=s.employee_id)))
    ON CONFLICT(schedule_id) DO UPDATE SET status=EXCLUDED.status,notes=EXCLUDED.notes,registered_by=EXCLUDED.registered_by RETURNING * INTO r;
    INSERT INTO public.attendance_audit_log(attendance_record_id,employee_id,action,before_data,after_data,performed_by,reason) VALUES(r.id,r.employee_id,'close_day',CASE WHEN old_r.id IS NULL THEN NULL ELSE to_jsonb(old_r) END,to_jsonb(r),user_id,reason); n:=n+1;
   END IF;
  END LOOP;
  RETURN jsonb_build_object('success',true,'count',n);
 ELSIF p_action='correct' THEN
  SELECT * INTO s FROM public.attendance_schedules WHERE id=(p_data->>'schedule_id')::uuid FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Horario no encontrado'; END IF;
  IF s.shift='night' THEN RAISE EXCEPTION 'El turno noche no requiere marcación de asistencia.'; END IF;
  SELECT * INTO old_r FROM public.attendance_records WHERE schedule_id=s.id FOR UPDATE;
  old_s:=s;
  IF p_data ? 'scheduled_time' THEN
   UPDATE public.attendance_schedules SET scheduled_time=nullif(p_data->>'scheduled_time','')::time,is_day_off=(p_data->>'is_day_off')::boolean WHERE id=s.id RETURNING * INTO s;
   INSERT INTO public.attendance_audit_log(employee_id,action,before_data,after_data,performed_by,reason) VALUES(s.employee_id,'schedule_correction',to_jsonb(old_s),to_jsonb(s),user_id,reason);
  END IF;
  stamp:=CASE WHEN p_data ? 'check_in_at' THEN nullif(p_data->>'check_in_at','')::timestamptz ELSE old_r.check_in_at END;
  IF stamp IS NOT NULL AND ((stamp AT TIME ZONE 'America/Lima')::date<>s.work_date OR stamp>clock_timestamp()) THEN RAISE EXCEPTION 'La hora corregida debe pertenecer al día de trabajo y no estar en el futuro'; END IF;
  SELECT * INTO e FROM public.employees WHERE id=s.employee_id;
  tolerance:=coalesce(old_r.tolerance_minutes_applied,e.late_tolerance_minutes);
  IF p_data->>'status' IN ('on_time','late') THEN
   IF stamp IS NULL OR s.is_day_off THEN RAISE EXCEPTION 'Para asistencia se requiere hora y un día laborable'; END IF;
   mins:=attendance_private.late_minutes((s.work_date+s.scheduled_time) AT TIME ZONE 'America/Lima',stamp,tolerance);
  ELSE mins:=0; END IF;
  IF p_data->>'status'='day_off' AND NOT s.is_day_off THEN RAISE EXCEPTION 'Primero indica descanso en el horario'; END IF;
  IF p_data->>'status'='pending' AND stamp IS NOT NULL THEN RAISE EXCEPTION 'Pendiente no puede conservar una entrada'; END IF;
  INSERT INTO public.attendance_records(employee_id,schedule_id,work_date,scheduled_time,check_in_at,status,minutes_late,photo_storage_path,notes,registered_by,tolerance_minutes_applied)
  VALUES(s.employee_id,s.id,s.work_date,s.scheduled_time,stamp,CASE WHEN p_data->>'status' IN ('on_time','late') THEN CASE WHEN mins=0 THEN 'on_time' ELSE 'late' END ELSE p_data->>'status' END,mins,old_r.photo_storage_path,left(p_data->>'notes',2000),user_id,tolerance)
  ON CONFLICT(schedule_id) DO UPDATE SET scheduled_time=EXCLUDED.scheduled_time,check_in_at=EXCLUDED.check_in_at,status=EXCLUDED.status,minutes_late=EXCLUDED.minutes_late,notes=EXCLUDED.notes RETURNING * INTO r;
  INSERT INTO public.attendance_audit_log(attendance_record_id,employee_id,action,before_data,after_data,performed_by,reason) VALUES(r.id,r.employee_id,'correction',CASE WHEN old_r.id IS NULL THEN NULL ELSE to_jsonb(old_r) END,to_jsonb(r),user_id,reason);
  RETURN to_jsonb(r);
 END IF;
 RAISE EXCEPTION 'Acción no permitida';
END $$;
CREATE OR REPLACE FUNCTION public.attendance_admin_command(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT attendance_private.admin_command(p_action,p_data) $$;

-- Preserve the existing admin guard, SECURITY DEFINER private implementation,
-- SECURITY INVOKER public wrapper, empty search_path and restricted execution.
-- CREATE OR REPLACE preserves ownership and existing explicit ACLs.
REVOKE ALL ON FUNCTION attendance_private.admin_command(text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION attendance_private.admin_command(text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.attendance_admin_command(text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attendance_admin_command(text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
