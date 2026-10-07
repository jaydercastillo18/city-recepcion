-- ============================================================
-- CITY RECEPCIÓN - Migración 3: Funciones RPC transaccionales y Seguridad
-- ============================================================

-- ----------------------------------------------------------------
-- 1. TRIGGER: actualizar updated_at automáticamente
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_shipments_updated_at ON public.shipments;
CREATE TRIGGER trg_shipments_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_items_updated_at ON public.shipment_items;
CREATE TRIGGER trg_items_updated_at
  BEFORE UPDATE ON public.shipment_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ----------------------------------------------------------------
-- 2. TRIGGER: crear perfil automáticamente al registrar usuario
-- SEGURIDAD CRÍTICA:
-- Todos los usuarios nuevos SIEMPRE se crean con role = 'warehouse'.
-- Se ignora por completo cualquier 'role' proveniente de raw_user_meta_data
-- para evitar escalada de privilegios en el signup.
-- El primer admin debe ser promovido manualmente desde SQL/Admin.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'warehouse' -- SIEMPRE warehouse por defecto; nunca aceptar role desde metadata
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------
-- 3. FUNCIÓN RPC: register_box_reception
-- Operación transaccional endurecida para registrar cajas recibidas.
-- - Bloqueo de fila exclusivo (SELECT FOR UPDATE) en item y shipment
-- - Verificación de usuario y rol (admin o warehouse)
-- - Validación estricta del estado del shipment (solo 'receiving')
-- - 'receive': exclusivamente p_quantity = 1 o p_quantity = -1
-- - 'correction' / 'reset': exclusivo para role = 'admin'
-- - Validación de cantidades no negativas
-- - Recálculo atómico de estado del item y total_received_boxes del shipment
-- - Inserción obligatoria de auditoría en reception_events
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_box_reception(
  p_shipment_item_id  UUID,
  p_action            TEXT,     -- 'receive' | 'correction' | 'reset'
  p_quantity          INTEGER,  -- delta para 'receive' (1 o -1); cantidad absoluta para 'correction'
  p_notes             TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id          UUID;
  v_user_role        TEXT;
  v_item             public.shipment_items%ROWTYPE;
  v_shipment         public.shipments%ROWTYPE;
  v_prev_qty         INTEGER;
  v_new_qty          INTEGER;
  v_new_status       TEXT;
  v_event_id         UUID;
BEGIN
  -- 1. Exigir usuario autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Obtener rol y validar permisos
  v_user_role := public.get_my_role();
  IF v_user_role NOT IN ('admin', 'warehouse') THEN
    RAISE EXCEPTION 'Sin permisos suficientes' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Bloquear fila del item para escritura exclusiva
  SELECT * INTO v_item
  FROM public.shipment_items
  WHERE id = p_shipment_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item no encontrado: %', p_shipment_item_id USING ERRCODE = 'P0003';
  END IF;

  -- 4. Bloquear y verificar estado del envío
  SELECT * INTO v_shipment
  FROM public.shipments
  WHERE id = v_item.shipment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Envío no encontrado: %', v_item.shipment_id USING ERRCODE = 'P0004';
  END IF;

  -- NO permitir registrar cajas si el envío es draft, completed o cancelled
  IF v_shipment.status != 'receiving' THEN
    RAISE EXCEPTION 'El envío no está en recepción activa (estado actual: %). Solo se permite registrar en envíos receiving.', v_shipment.status
      USING ERRCODE = 'P0005';
  END IF;

  v_prev_qty := v_item.received_boxes;

  -- 5. Procesar acción y aplicar reglas de seguridad por rol
  CASE p_action
    WHEN 'receive' THEN
      -- Acción normal: SOLO permite +1 o -1 para evitar valores manipulados
      IF p_quantity NOT IN (1, -1) THEN
        RAISE EXCEPTION 'La acción receive solo permite incrementar o reducir 1 caja (p_quantity = 1 o -1, recibido: %)', p_quantity
          USING ERRCODE = 'P0006';
      END IF;
      v_new_qty := v_prev_qty + p_quantity;

    WHEN 'correction' THEN
      -- Solo administradores pueden realizar corrección directa
      IF v_user_role != 'admin' THEN
        RAISE EXCEPTION 'Solo administradores pueden realizar correcciones de cantidad'
          USING ERRCODE = 'P0007';
      END IF;
      IF p_quantity < 0 THEN
        RAISE EXCEPTION 'La cantidad en corrección no puede ser negativa (recibido: %)', p_quantity
          USING ERRCODE = 'P0008';
      END IF;
      v_new_qty := p_quantity;

    WHEN 'reset' THEN
      -- Solo administradores pueden resetear un producto
      IF v_user_role != 'admin' THEN
        RAISE EXCEPTION 'Solo administradores pueden resetear productos a cero'
          USING ERRCODE = 'P0009';
      END IF;
      v_new_qty := 0;

    ELSE
      RAISE EXCEPTION 'Acción inválida: %. Las acciones permitidas son receive, correction o reset', p_action
        USING ERRCODE = 'P0010';
  END CASE;

  -- 6. Impedir cantidades finales negativas
  IF v_new_qty < 0 THEN
    RAISE EXCEPTION 'La cantidad de cajas no puede ser negativa (resultado: %)', v_new_qty
      USING ERRCODE = 'P0011';
  END IF;

  -- 7. Recalcular status del item automáticamente
  v_new_status := CASE
    WHEN v_new_qty = 0                         THEN 'pending'
    WHEN v_new_qty < v_item.expected_boxes     THEN 'partial'
    WHEN v_new_qty = v_item.expected_boxes     THEN 'complete'
    ELSE                                            'excess'
  END;

  -- 8. Actualizar shipment_item
  UPDATE public.shipment_items
  SET
    received_boxes = v_new_qty,
    status         = v_new_status,
    updated_at     = NOW()
  WHERE id = p_shipment_item_id;

  -- 9. Recalcular total_received_boxes en el shipment
  UPDATE public.shipments
  SET
    total_received_boxes = (
      SELECT COALESCE(SUM(received_boxes), 0)
      FROM public.shipment_items
      WHERE shipment_id = v_item.shipment_id
    ),
    updated_at = NOW()
  WHERE id = v_item.shipment_id;

  -- 10. Insertar evento de auditoría obligatorio
  INSERT INTO public.reception_events (
    shipment_id,
    shipment_item_id,
    user_id,
    action,
    quantity,
    previous_quantity,
    new_quantity,
    notes
  ) VALUES (
    v_item.shipment_id,
    p_shipment_item_id,
    v_user_id,
    p_action,
    CASE p_action WHEN 'receive' THEN p_quantity ELSE (v_new_qty - v_prev_qty) END,
    v_prev_qty,
    v_new_qty,
    p_notes
  )
  RETURNING id INTO v_event_id;

  -- 11. Devolver respuesta estructurada
  RETURN jsonb_build_object(
    'success',           true,
    'event_id',          v_event_id,
    'item_id',           p_shipment_item_id,
    'previous_quantity', v_prev_qty,
    'new_quantity',      v_new_qty,
    'status',            v_new_status,
    'action',            p_action
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   SQLERRM,
      'code',    SQLSTATE
    );
END;
$$;

COMMENT ON FUNCTION public.register_box_reception IS
  'RPC transaccional endurecido: solo envios en receiving, receive solo +/-1, correcciones/reseteos solo admin, auditoria obligatoria.';

-- Permisos RPC para register_box_reception
REVOKE EXECUTE ON FUNCTION public.register_box_reception(UUID, TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_box_reception(UUID, TEXT, INTEGER, TEXT) TO authenticated;

-- ----------------------------------------------------------------
-- 4. FUNCIÓN RPC: get_shipment_stats
-- Dashboard eficiente calculado en BD
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shipment_stats(p_shipment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = 'P0001';
  END IF;

  SELECT jsonb_build_object(
    'total_expected',   COALESCE(SUM(expected_boxes), 0),
    'total_received',   COALESCE(SUM(received_boxes), 0),
    'total_pending',    COALESCE(SUM(CASE WHEN status = 'pending'  THEN 1 ELSE 0 END), 0),
    'total_partial',    COALESCE(SUM(CASE WHEN status = 'partial'  THEN 1 ELSE 0 END), 0),
    'total_complete',   COALESCE(SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END), 0),
    'total_excess',     COALESCE(SUM(CASE WHEN status = 'excess'   THEN 1 ELSE 0 END), 0),
    'boxes_missing',    GREATEST(0, COALESCE(SUM(expected_boxes), 0) - COALESCE(SUM(received_boxes), 0)),
    'item_count',       COUNT(*)
  )
  INTO v_result
  FROM public.shipment_items
  WHERE shipment_id = p_shipment_id;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_shipment_stats IS
  'Calcula estadisticas de un envio en una sola query eficiente con seguridad.';

-- Permisos RPC para get_shipment_stats
REVOKE EXECUTE ON FUNCTION public.get_shipment_stats(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shipment_stats(UUID) TO authenticated;
