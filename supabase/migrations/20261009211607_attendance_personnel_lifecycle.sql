-- Personnel lifecycle only. Original attendance and access migrations remain intact.
BEGIN;
ALTER TABLE public.employees
 ADD COLUMN suspended_at timestamptz,
 ADD COLUMN archived_at timestamptz,
 ADD CONSTRAINT employees_archived_inactive CHECK (archived_at IS NULL OR NOT active);

-- The existing employee RPC cannot accidentally reactivate an archived employee.
CREATE FUNCTION attendance_private.employee_lifecycle_guard() RETURNS trigger
 LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.archived_at IS NOT NULL AND (NEW.active OR NEW.archived_at IS NULL) THEN
  RAISE EXCEPTION 'Un empleado archivado no puede reactivarse';
 END IF;
 IF NOT NEW.active AND NEW.suspended_at IS NULL AND NEW.archived_at IS NULL
 AND (TG_OP='INSERT' OR OLD.active IS DISTINCT FROM NEW.active) THEN
  NEW.suspended_at:=now();
 ELSIF NEW.active THEN NEW.suspended_at:=NULL; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER employee_lifecycle_guard BEFORE INSERT OR UPDATE ON public.employees
 FOR EACH ROW EXECUTE FUNCTION attendance_private.employee_lifecycle_guard();

-- Standardize future creation/edit audit events; historical audit is untouched.
CREATE FUNCTION attendance_private.employee_audit_labels() RETURNS trigger
 LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.action='employee' THEN
  NEW.action:=CASE WHEN NEW.before_data IS NULL THEN 'employee_created' ELSE 'employee_updated' END;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER employee_audit_labels BEFORE INSERT ON public.attendance_audit_log
 FOR EACH ROW EXECUTE FUNCTION attendance_private.employee_audit_labels();

CREATE FUNCTION attendance_private.employee_command(p_action text,p_data jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_e public.employees; e public.employees;
 user_id uuid:=auth.uid(); reason text:=btrim(coalesce(p_data->>'reason','')); event_name text;
BEGIN
 IF user_id IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin' THEN
  RAISE EXCEPTION 'Solo administradores pueden administrar personal';
 END IF;
 IF length(reason)<3 OR length(reason)>2000 THEN RAISE EXCEPTION 'Indica un motivo de 3 a 2000 caracteres'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('city-attendance-admin'));
 SELECT * INTO old_e FROM public.employees WHERE id=(p_data->>'id')::uuid FOR UPDATE;
 IF old_e.id IS NULL THEN RAISE EXCEPTION 'Empleado no encontrado'; END IF;
 IF p_action='archive' THEN
  IF p_data->>'confirmation' IS DISTINCT FROM old_e.employee_code THEN RAISE EXCEPTION 'Escribe el código exacto del empleado'; END IF;
  IF old_e.archived_at IS NOT NULL THEN RETURN jsonb_build_object('success',true,'reused',true); END IF;
  UPDATE public.employees SET active=false,archived_at=now() WHERE id=old_e.id RETURNING * INTO e;
  event_name:='employee_archived';
 ELSIF p_action='suspend' THEN
  IF old_e.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Empleado archivado'; END IF;
  IF NOT old_e.active AND old_e.suspended_at IS NOT NULL THEN RETURN jsonb_build_object('success',true,'reused',true); END IF;
  UPDATE public.employees SET active=false,suspended_at=now() WHERE id=old_e.id RETURNING * INTO e;
  event_name:='employee_suspended';
 ELSIF p_action='reactivate' THEN
  IF old_e.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Un empleado archivado no puede reactivarse'; END IF;
  IF old_e.active THEN RETURN jsonb_build_object('success',true,'reused',true); END IF;
  UPDATE public.employees SET active=true,suspended_at=NULL WHERE id=old_e.id RETURNING * INTO e;
  event_name:='employee_reactivated';
 ELSIF p_action='access_generated' THEN
  IF NOT old_e.active OR old_e.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Empleado inactivo o archivado'; END IF;
  INSERT INTO public.attendance_audit_log(employee_id,action,performed_by,reason)
   VALUES(old_e.id,'employee_access_generated',user_id,'Generación administrativa de acceso');
  RETURN jsonb_build_object('success',true);
 ELSE RAISE EXCEPTION 'Acción no permitida'; END IF;
 INSERT INTO public.attendance_audit_log(employee_id,action,before_data,after_data,performed_by,reason)
  VALUES(e.id,event_name,to_jsonb(old_e),to_jsonb(e),user_id,reason);
 RETURN jsonb_build_object('success',true);
END $$;
CREATE FUNCTION public.attendance_employee_command(p_action text,p_data jsonb) RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT attendance_private.employee_command(p_action,p_data)
$$;
REVOKE ALL ON FUNCTION attendance_private.employee_command(text,jsonb),attendance_private.employee_lifecycle_guard(),attendance_private.employee_audit_labels() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.attendance_employee_command(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION attendance_private.employee_command(text,jsonb),public.attendance_employee_command(text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
