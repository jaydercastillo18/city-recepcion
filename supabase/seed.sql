-- ============================================================
-- CITY RECEPCIÓN - Seed Data (SOLO PARA DESARROLLO LOCAL / TEST)
-- ============================================================
-- ADVERTENCIA:
-- Este archivo NO es una migración de producción.
-- Contiene únicamente 2 registros pequeños claramente rotulados como DEMO.
-- Los datos REALES de envíos (como Chimbote) se importarán posteriormente.
-- ============================================================

DO $$
DECLARE
  v_demo_shipment_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN

  -- Envio DEMO (Solo pruebas)
  INSERT INTO public.shipments (
    id,
    shipment_number,
    destination,
    shipment_date,
    status,
    total_expected_boxes,
    total_received_boxes
  ) VALUES (
    v_demo_shipment_id,
    'DEMO-ENV-001',
    '[DEMO] LOCAL DE PRUEBAS',
    CURRENT_DATE,
    'receiving',
    8,
    0
  )
  ON CONFLICT (shipment_number) DO NOTHING;

  -- Items DEMO (Solo 2 productos de prueba)
  INSERT INTO public.shipment_items (
    shipment_id,
    code_original,
    code_normalized,
    product_name,
    supplier,
    expected_boxes
  ) VALUES
    (v_demo_shipment_id, 'DEMO-01', 'DEMO01', '[DEMO] SILLA DE OFICINA PRUEBA', 'PROVEEDOR DEMO', 5),
    (v_demo_shipment_id, 'DEMO-02', 'DEMO02', '[DEMO] MESA AUXILIAR PRUEBA', 'PROVEEDOR DEMO', 3)
  ON CONFLICT DO NOTHING;

  -- Actualizar totales del envio demo
  UPDATE public.shipments
  SET total_expected_boxes = (
    SELECT COALESCE(SUM(expected_boxes), 0)
    FROM public.shipment_items
    WHERE shipment_id = v_demo_shipment_id
  )
  WHERE id = v_demo_shipment_id;

END $$;
