-- CITY OFERTAS: isolated attendance module. Review and run manually; no remote reset.
BEGIN;
CREATE SCHEMA IF NOT EXISTS attendance_private;
REVOKE ALL ON SCHEMA attendance_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA attendance_private TO authenticated;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin','warehouse','employee'));

CREATE SEQUENCE public.attendance_employee_code_seq;
CREATE TABLE public.employees (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 profile_id uuid UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
 employee_code text UNIQUE NOT NULL,
 full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 2 AND 200),
 normalized_name text NOT NULL, position text NOT NULL DEFAULT '',
 email text, phone text, active boolean NOT NULL DEFAULT true,
 late_tolerance_minutes integer NOT NULL DEFAULT 5 CHECK (late_tolerance_minutes BETWEEN 0 AND 120),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX employees_email_unique ON public.employees(lower(email)) WHERE email IS NOT NULL;
CREATE INDEX employees_normalized_name ON public.employees(normalized_name);
CREATE TABLE public.attendance_settings (
 id integer PRIMARY KEY DEFAULT 1 CHECK (id=1),
 absence_cutoff_minutes integer NOT NULL DEFAULT 180 CHECK (absence_cutoff_minutes BETWEEN 1 AND 1440),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (absence_cutoff_minutes > 0)
);
INSERT INTO public.attendance_settings(id) VALUES (1);
CREATE TABLE public.attendance_imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_file_name text NOT NULL,
 file_hash text NOT NULL CHECK (file_hash ~ '^[a-f0-9]{64}$'),
 period_start date NOT NULL, period_end date NOT NULL CHECK (period_end>=period_start),
 imported_by uuid NOT NULL REFERENCES public.profiles(id), imported_at timestamptz NOT NULL DEFAULT now(),
 warnings jsonb NOT NULL DEFAULT '[]', request_id uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(), payload jsonb NOT NULL
);
CREATE TABLE public.attendance_schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid NOT NULL REFERENCES public.employees(id),
 work_date date NOT NULL, shift text NOT NULL DEFAULT 'day' CHECK (shift IN ('day','night')), scheduled_time time,
 is_day_off boolean NOT NULL DEFAULT false, source_import_id uuid REFERENCES public.attendance_imports(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(employee_id,work_date,shift), CHECK ((is_day_off AND scheduled_time IS NULL) OR (NOT is_day_off AND scheduled_time IS NOT NULL))
);
CREATE INDEX attendance_schedules_date ON public.attendance_schedules(work_date,employee_id);
CREATE TABLE public.attendance_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_id uuid NOT NULL REFERENCES public.employees(id),
 schedule_id uuid NOT NULL REFERENCES public.attendance_schedules(id), work_date date NOT NULL,
 scheduled_time time, check_in_at timestamptz,
 tolerance_minutes_applied integer NOT NULL CHECK (tolerance_minutes_applied BETWEEN 0 AND 120),
 status text NOT NULL CHECK (status IN ('pending','on_time','late','absent','day_off','justified')),
 minutes_late integer NOT NULL DEFAULT 0 CHECK (minutes_late>=0), photo_storage_path text,
 notes text, registered_by uuid REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(schedule_id),
 CHECK (status NOT IN ('on_time','late') OR check_in_at IS NOT NULL),
 CHECK (status='late' OR minutes_late=0)
);
CREATE INDEX attendance_records_date ON public.attendance_records(work_date,employee_id);
CREATE TABLE public.attendance_audit_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), attendance_record_id uuid REFERENCES public.attendance_records(id),
 employee_id uuid REFERENCES public.employees(id), action text NOT NULL,
 before_data jsonb, after_data jsonb, performed_by uuid NOT NULL REFERENCES public.profiles(id),
 reason text NOT NULL CHECK (length(btrim(reason))>=3), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attendance_audit_employee_date ON public.attendance_audit_log(employee_id,created_at DESC);

-- Attendance tables have no client DML grants. Commands validate role inside PostgreSQL.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['employees','attendance_settings','attendance_imports','attendance_schedules','attendance_records','attendance_audit_log'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY attendance_admin_read ON public.%I FOR SELECT TO authenticated USING ((SELECT public.get_my_role()) = ''admin'')',t);
 END LOOP;
END $$;
CREATE POLICY employee_read_self ON public.employees FOR SELECT TO authenticated USING (profile_id=(SELECT auth.uid()));
CREATE POLICY employee_schedule_self ON public.attendance_schedules FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.employees e WHERE e.id=employee_id AND e.profile_id=(SELECT auth.uid())));
CREATE POLICY employee_record_self ON public.attendance_records FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.employees e WHERE e.id=employee_id AND e.profile_id=(SELECT auth.uid())));
CREATE POLICY attendance_settings_read ON public.attendance_settings FOR SELECT TO authenticated USING ((SELECT public.get_my_role())='employee');

-- Existing warehouse/admin policies remain intact. New employee role must not inherit
-- the original "all authenticated" merchandise reads/writes.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['shipments','shipment_items','reception_events','incidents'] LOOP
  EXECUTE format('CREATE POLICY attendance_employee_isolation ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.get_my_role()) IN (''admin'',''warehouse'')) WITH CHECK ((SELECT public.get_my_role()) IN (''admin'',''warehouse''))',t);
 END LOOP;
END $$;
-- Prevent self-insert of a privileged profile if a profile is ever missing.
CREATE POLICY attendance_profile_insert_guard ON public.profiles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.get_my_role()='admin' OR (id=auth.uid() AND role='employee'));
-- Keep the existing statistics body/API, but make its reads honor the role isolation.
-- Otherwise its previous DEFINER mode could disclose merchandise totals to employees.
ALTER FUNCTION public.get_shipment_stats(uuid) SECURITY INVOKER;

CREATE FUNCTION attendance_private.normalize_name(v text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT upper(regexp_replace(btrim(translate(v,'áéíóúÁÉÍÓÚüÜñÑ','aeiouAEIOUuUnN')),'\s+',' ','g'))
$$;
CREATE FUNCTION attendance_private.employee_prepare() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE code_number bigint;
BEGIN
 IF TG_OP='INSERT' THEN code_number:=nextval('public.attendance_employee_code_seq'); NEW.employee_code:='EMP-'||lpad(code_number::text,greatest(4,length(code_number::text)),'0'); END IF;
 NEW.normalized_name:=attendance_private.normalize_name(NEW.full_name);
 NEW.email:=nullif(lower(btrim(NEW.email)),'');
 IF TG_OP='UPDATE' THEN NEW.employee_code:=OLD.employee_code; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER employee_prepare BEFORE INSERT OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION attendance_private.employee_prepare();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['employees','attendance_schedules','attendance_records','attendance_settings'] LOOP
  EXECUTE format('CREATE TRIGGER attendance_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()',t);
 END LOOP;
END $$;

-- Store new accounts as least-privilege employee. Existing accounts/roles are untouched.
-- Auth metadata NEVER grants privileges. Admin linking is a separate validated command.
CREATE FUNCTION attendance_private.new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.profiles(id,full_name,role) VALUES(NEW.id,coalesce(NEW.raw_user_meta_data->>'full_name',NEW.email),'employee') ON CONFLICT(id) DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION attendance_private.new_user();

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('attendance-evidence','attendance-evidence',false,2097152,ARRAY['image/jpeg']) ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE POLICY attendance_photo_read ON storage.objects FOR SELECT TO authenticated USING (
 bucket_id='attendance-evidence' AND (public.get_my_role()='admin' OR EXISTS(
  SELECT 1 FROM public.employees e WHERE e.profile_id=auth.uid() AND e.employee_code=split_part(name,'/',5)))
);
CREATE POLICY attendance_photo_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 bucket_id='attendance-evidence' AND public.get_my_role()='employee' AND EXISTS(
 SELECT 1 FROM public.employees e WHERE e.profile_id=auth.uid() AND e.active
 AND name ~ ('^attendance/[0-9]{4}/[0-9]{2}/[0-9]{2}/'||e.employee_code||'/[a-f0-9-]{36}\.jpg$')
 AND split_part(name,'/',2)||'-'||split_part(name,'/',3)||'-'||split_part(name,'/',4)=to_char(now() AT TIME ZONE 'America/Lima','YYYY-MM-DD'))
);
-- Uploads cannot replace an object. Audit snapshots also protect historical evidence.
CREATE FUNCTION attendance_private.photo_unused(p_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.employees e WHERE e.profile_id=auth.uid() AND e.employee_code=split_part(p_name,'/',5))
 AND NOT EXISTS(SELECT 1 FROM public.attendance_records r WHERE r.photo_storage_path=p_name)
 AND NOT EXISTS(SELECT 1 FROM public.attendance_audit_log a WHERE a.before_data->>'photo_storage_path'=p_name OR a.after_data->>'photo_storage_path'=p_name)
$$;
CREATE POLICY attendance_photo_cleanup ON storage.objects FOR DELETE TO authenticated USING (
 bucket_id='attendance-evidence' AND attendance_private.photo_unused(name)
);

CREATE FUNCTION attendance_private.late_minutes(p_scheduled timestamptz,p_stamp timestamptz,p_tolerance integer) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN greatest(0,floor(extract(epoch FROM (p_stamp-p_scheduled))/60)::integer)<=p_tolerance THEN 0
 ELSE greatest(0,floor(extract(epoch FROM (p_stamp-p_scheduled))/60)::integer) END
$$;
CREATE FUNCTION attendance_private.check_in(p_photo_path text,p_schedule_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.employees; s public.attendance_schedules; cfg public.attendance_settings;
 stamp timestamptz:=clock_timestamp(); d date:=(stamp AT TIME ZONE 'America/Lima')::date;
 scheduled timestamptz; mins integer; result public.attendance_records; existing public.attendance_records;
BEGIN
 IF auth.uid() IS NULL OR public.get_my_role() IS DISTINCT FROM 'employee' THEN RAISE EXCEPTION 'Solo empleados autenticados pueden marcar asistencia'; END IF;
 SELECT * INTO e FROM public.employees WHERE profile_id=auth.uid() AND active FOR NO KEY UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'No tienes un empleado activo vinculado'; END IF;
 stamp:=clock_timestamp(); d:=(stamp AT TIME ZONE 'America/Lima')::date;
 IF p_schedule_id IS NULL AND (SELECT count(*) FROM public.attendance_schedules WHERE employee_id=e.id AND work_date=d AND shift='day')>1 THEN RAISE EXCEPTION 'Selecciona el turno que vas a marcar'; END IF;
 SELECT * INTO s FROM public.attendance_schedules WHERE employee_id=e.id AND work_date=d AND (p_schedule_id IS NULL OR id=p_schedule_id) AND (p_schedule_id IS NOT NULL OR shift='day') FOR UPDATE;
 IF s.id IS NULL THEN
  IF EXISTS(SELECT 1 FROM public.attendance_schedules WHERE employee_id=e.id AND work_date=d AND shift='night' AND (p_schedule_id IS NULL OR id=p_schedule_id)) THEN RAISE EXCEPTION 'El turno noche no requiere marcación de asistencia.'; END IF;
  RAISE EXCEPTION 'No tienes horario programado para hoy';
 END IF;
 IF s.shift='night' THEN RAISE EXCEPTION 'El turno noche no requiere marcación de asistencia.'; END IF;
 stamp:=clock_timestamp();
 IF (stamp AT TIME ZONE 'America/Lima')::date<>d THEN RAISE EXCEPTION 'Cambió el día durante la marcación. Vuelve a intentar'; END IF;
 SELECT * INTO existing FROM public.attendance_records WHERE schedule_id=s.id;
 IF existing.id IS NOT NULL AND (existing.status<>'pending' OR existing.check_in_at IS NOT NULL) THEN
  IF existing.check_in_at IS NOT NULL THEN RAISE EXCEPTION 'Ya registraste tu asistencia hoy a las %',to_char(existing.check_in_at AT TIME ZONE 'America/Lima','HH24:MI'); END IF;
  RAISE EXCEPTION 'El registro del día ya fue cerrado; solicita revisión administrativa';
 END IF;
 IF s.is_day_off THEN RAISE EXCEPTION 'Hoy tienes descanso; no corresponde marcar'; END IF;
 SELECT * INTO cfg FROM public.attendance_settings WHERE id=1;
 scheduled:=(d+s.scheduled_time) AT TIME ZONE 'America/Lima';
 IF stamp>=scheduled+make_interval(mins=>cfg.absence_cutoff_minutes) THEN RAISE EXCEPTION 'La hora límite de asistencia ya pasó; solicita revisión administrativa'; END IF;
 IF p_photo_path IS NULL OR p_photo_path !~ ('^attendance/'||to_char(d,'YYYY/MM/DD')||'/'||e.employee_code||'/[a-f0-9-]{36}\.jpg$')
 OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='attendance-evidence' AND o.name=p_photo_path AND o.owner_id=auth.uid()::text) THEN
  RAISE EXCEPTION 'La foto privada no existe o no pertenece a tu sesión';
 END IF;
 -- Minutes are full elapsed minutes, matching the HH:MM shown to employees.
 mins:=attendance_private.late_minutes(scheduled,stamp,e.late_tolerance_minutes);
 INSERT INTO public.attendance_records(employee_id,schedule_id,work_date,scheduled_time,check_in_at,status,minutes_late,photo_storage_path,registered_by,tolerance_minutes_applied)
 VALUES(e.id,s.id,d,s.scheduled_time,stamp,CASE WHEN mins=0 THEN 'on_time' ELSE 'late' END,mins,p_photo_path,auth.uid(),e.late_tolerance_minutes)
 ON CONFLICT(schedule_id) DO UPDATE SET scheduled_time=EXCLUDED.scheduled_time,check_in_at=EXCLUDED.check_in_at,status=EXCLUDED.status,minutes_late=EXCLUDED.minutes_late,photo_storage_path=EXCLUDED.photo_storage_path,registered_by=EXCLUDED.registered_by,tolerance_minutes_applied=EXCLUDED.tolerance_minutes_applied RETURNING * INTO result;
 RETURN to_jsonb(result);
END $$;
CREATE FUNCTION public.register_attendance_check_in(p_photo_path text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT attendance_private.check_in(p_photo_path) $$;

CREATE FUNCTION public.register_attendance_check_in(p_photo_path text,p_schedule_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT attendance_private.check_in(p_photo_path,p_schedule_id) $$;

-- Single transactional admin command: no arbitrary client writes to attendance tables.
CREATE FUNCTION attendance_private.admin_command(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.employees; old_e public.employees; s public.attendance_schedules; old_s public.attendance_schedules;
 r public.attendance_records; old_r public.attendance_records; cfg public.attendance_settings;
 reason text:=btrim(coalesce(p_data->>'reason','')); user_id uuid:=auth.uid();
 imp public.attendance_imports; entry jsonb; target uuid; stamp timestamptz; mins integer; tolerance integer; target_date date; n integer:=0; skipped integer:=0;
BEGIN
 IF user_id IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo administradores pueden administrar asistencia'; END IF;
 IF length(reason)<3 OR length(reason)>2000 THEN RAISE EXCEPTION 'Indica un motivo de 3 a 2000 caracteres'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('city-attendance-admin'));
 IF p_action='lookup_account' THEN
  RETURN (SELECT jsonb_build_object('id',u.id,'role',p.role) FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE lower(u.email)=lower(p_data->>'email'));
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
CREATE FUNCTION public.attendance_admin_command(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT attendance_private.admin_command(p_action,p_data) $$;
CREATE FUNCTION public.attendance_server_now() RETURNS timestamptz LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT now() $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA attendance_private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION attendance_private.check_in(text,uuid),attendance_private.admin_command(text,jsonb),attendance_private.photo_unused(text) TO authenticated;
REVOKE ALL ON FUNCTION public.register_attendance_check_in(text),public.register_attendance_check_in(text,uuid),public.attendance_admin_command(text,jsonb),public.attendance_server_now() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_attendance_check_in(text),public.register_attendance_check_in(text,uuid),public.attendance_admin_command(text,jsonb),public.attendance_server_now() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
