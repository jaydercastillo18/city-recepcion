-- Revisar/aplicar manualmente. No cierra ni elimina ningún envío existente.
BEGIN;
ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS finalized_by_name text,
  ADD COLUMN IF NOT EXISTS finalized_with_shortage boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finalization_notes text,
  ADD COLUMN IF NOT EXISTS missing_boxes_at_finalization integer NOT NULL DEFAULT 0;

-- SECURITY INVOKER conserva RLS. Los eventos solo tenían una política SELECT;
-- permitir DELETE exclusivamente al admin para eliminar dependencias de su envío.
DROP POLICY IF EXISTS events_delete_admin ON public.reception_events;
CREATE POLICY events_delete_admin ON public.reception_events FOR DELETE TO authenticated
  USING ((SELECT public.get_my_role()) = 'admin');
-- Privilegio de tabla necesario para la RPC invoker; RLS limita cada DELETE a admin.
GRANT DELETE ON public.incidents, public.reception_events, public.shipment_items, public.shipments TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_shipment_admin(
  p_shipment_id uuid, p_confirm_shortage boolean DEFAULT false, p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_shipment public.shipments%ROWTYPE;
  v_missing bigint;
  v_count integer;
  v_name text;
BEGIN
  IF v_user IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo los administradores pueden finalizar envíos.' USING ERRCODE = '42501';
  END IF;
  IF length(p_notes) > 2000 THEN
    RAISE EXCEPTION 'El motivo no puede superar 2000 caracteres.' USING ERRCODE = '22023';
  END IF;
  -- La recepción también bloquea el shipment antes de cambiar cantidades.
  SELECT * INTO v_shipment FROM public.shipments WHERE id = p_shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Envío no encontrado.' USING ERRCODE = 'P0002'; END IF;
  -- Reintentos no cambian quién cerró ni el snapshot del cierre.
  IF v_shipment.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'already_finalized', true,
      'missing_boxes', v_shipment.missing_boxes_at_finalization,
      'with_shortage', v_shipment.finalized_with_shortage);
  END IF;
  IF v_shipment.status NOT IN ('receiving', 'draft') THEN
    RAISE EXCEPTION 'Este envío no puede finalizarse en su estado actual.';
  END IF;
  SELECT coalesce(sum(greatest(expected_boxes - received_boxes, 0)), 0), count(*)
    INTO v_missing, v_count FROM public.shipment_items WHERE shipment_id = p_shipment_id;
  IF v_count = 0 THEN RAISE EXCEPTION 'No se puede finalizar un envío sin productos.'; END IF;
  IF v_missing > 0 AND p_confirm_shortage IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Confirma expresamente que quieres finalizar con faltantes.' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(nullif(btrim(full_name), ''), v_user::text) INTO v_name
    FROM public.profiles WHERE id = v_user;
  UPDATE public.shipments SET status = 'completed', finalized_at = now(), finalized_by = v_user,
    finalized_by_name = v_name, finalized_with_shortage = v_missing > 0,
    missing_boxes_at_finalization = v_missing::integer, finalization_notes = nullif(btrim(p_notes), '')
    WHERE id = p_shipment_id;
  -- No actualiza cantidades, estados de productos, eventos ni observaciones.
  RETURN jsonb_build_object('success', true, 'with_shortage', v_missing > 0, 'missing_boxes', v_missing);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_shipment_admin(p_shipment_id uuid, p_confirmation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_shipment public.shipments%ROWTYPE;
  v_items integer;
  v_events integer;
  v_incidents integer;
BEGIN
  IF v_user IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo los administradores pueden eliminar envíos.' USING ERRCODE = '42501';
  END IF;
  -- Mismo orden item -> shipment que register_box_reception: evita un ciclo de bloqueos.
  PERFORM id FROM public.shipment_items WHERE shipment_id = p_shipment_id ORDER BY id FOR UPDATE;
  SELECT * INTO v_shipment FROM public.shipments WHERE id = p_shipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Envío no encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF p_confirmation IS DISTINCT FROM v_shipment.shipment_number THEN
    RAISE EXCEPTION 'Escribe el número exacto del envío para eliminarlo.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.incidents WHERE shipment_id = p_shipment_id;
  GET DIAGNOSTICS v_incidents = ROW_COUNT;
  DELETE FROM public.reception_events WHERE shipment_id = p_shipment_id;
  GET DIAGNOSTICS v_events = ROW_COUNT;
  DELETE FROM public.shipment_items WHERE shipment_id = p_shipment_id;
  GET DIAGNOSTICS v_items = ROW_COUNT;
  DELETE FROM public.shipments WHERE id = p_shipment_id;
  -- Cualquier error propaga la excepción y revierte todas las eliminaciones.
  RETURN jsonb_build_object('success', true, 'shipment_id', p_shipment_id,
    'shipment_number', v_shipment.shipment_number, 'items_deleted', v_items,
    'events_deleted', v_events, 'incidents_deleted', v_incidents,
    'expected_boxes', v_shipment.total_expected_boxes, 'received_boxes', v_shipment.total_received_boxes);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_shipment_admin(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_shipment_admin(uuid, boolean, text) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_shipment_admin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_shipment_admin(uuid, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
