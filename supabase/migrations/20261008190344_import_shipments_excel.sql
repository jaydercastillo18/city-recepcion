-- CITY OFERTAS: importación de un archivo como un envío NUEVO.
-- Revisar/aplicar manualmente. No modifica ni reimporta envíos históricos.
BEGIN;

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS source_file_name text,
  ADD COLUMN IF NOT EXISTS source_file_sha256 text,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS imported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS import_rows integer,
  ADD COLUMN IF NOT EXISTS import_warnings jsonb,
  ADD COLUMN IF NOT EXISTS import_request_id uuid,
  ADD COLUMN IF NOT EXISTS import_payload_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_import_request
  ON public.shipments(import_request_id) WHERE import_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_destination_date
  ON public.shipments(destination, shipment_date DESC);

CREATE OR REPLACE FUNCTION public.import_shipment_excel(
  p_destination text,
  p_shipment_date date,
  p_shipment_number text,
  p_source_file_name text,
  p_source_file_sha256 text,
  p_import_rows integer,
  p_warnings jsonb,
  p_items jsonb,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
  v_base text := btrim(p_shipment_number);
  v_number text;
  v_suffix integer := 1;
  v_total bigint;
  v_count integer;
  v_existing public.shipments%ROWTYPE;
  v_hash text;
BEGIN
  IF v_user IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo los administradores pueden importar envíos.' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR p_destination IS NULL OR btrim(p_destination) = ''
    OR length(p_destination) > 120 OR v_base IS NULL OR v_base = '' OR length(v_base) > 120
    OR p_shipment_date IS NULL OR p_shipment_date NOT BETWEEN date '1900-01-01' AND date '2100-12-31'
    OR p_source_file_name IS NULL OR length(p_source_file_name) NOT BETWEEN 1 AND 255
    OR lower(p_source_file_name) !~ '\.(xlsx|xls|csv)$'
    OR p_source_file_sha256 IS NULL OR p_source_file_sha256 !~ '^[a-f0-9]{64}$'
    OR p_import_rows IS NULL OR p_import_rows NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'Datos del envío o del archivo inválidos.' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'La importación debe contener una lista de productos.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 5000
    OR jsonb_array_length(p_items) > p_import_rows OR pg_column_size(p_items) > 6000000
    OR (p_warnings IS NOT NULL AND (jsonb_typeof(p_warnings) <> 'array' OR pg_column_size(p_warnings) > 524288)) THEN
    RAISE EXCEPTION 'La importación supera los límites permitidos.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS t(item)
    WHERE jsonb_typeof(item) <> 'object'
      OR jsonb_typeof(item->'code_original') IS DISTINCT FROM 'string'
      OR length(item->>'code_original') > 120
      OR jsonb_typeof(item->'product_name') IS DISTINCT FROM 'string'
      OR btrim(item->>'product_name') = '' OR length(item->>'product_name') > 500
      OR (item ? 'supplier' AND jsonb_typeof(item->'supplier') NOT IN ('string', 'null'))
      OR length(coalesce(item->>'supplier', '')) > 200
      OR jsonb_typeof(item->'expected_boxes') IS DISTINCT FROM 'number'
      OR coalesce(item->>'expected_boxes', '') !~ '^[1-9][0-9]{0,9}$'
  ) THEN
    RAISE EXCEPTION 'Hay productos sin nombre o cantidades/códigos inválidos.' USING ERRCODE = '22023';
  END IF;

  SELECT sum((item->>'expected_boxes')::bigint) INTO v_total
    FROM jsonb_array_elements(p_items) AS t(item);
  IF v_total > 2147483647 THEN
    RAISE EXCEPTION 'El total de cajas supera el límite del sistema.' USING ERRCODE = '22023';
  END IF;

  -- El mismo intento puede reintentarse tras una desconexión sin duplicar el envío.
  -- Una NUEVA subida tiene otro request_id, incluso si el archivo es idéntico.
  v_hash := md5(jsonb_build_object('destination', btrim(p_destination), 'date', p_shipment_date,
    'number', v_base, 'file', p_source_file_name, 'sha256', p_source_file_sha256,
    'rows', p_import_rows, 'warnings', p_warnings, 'items', p_items)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended('city-import:' || p_request_id::text, 0));
  SELECT * INTO v_existing FROM public.shipments WHERE import_request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.imported_by IS DISTINCT FROM v_user OR v_existing.import_payload_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'Este intento de importación ya se usó con otros datos.' USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_count FROM public.shipment_items WHERE shipment_id = v_existing.id;
    RETURN jsonb_build_object('shipment_id', v_existing.id, 'shipment_number', v_existing.shipment_number,
      'item_count', v_count, 'total_boxes', v_existing.total_expected_boxes, 'reused', true);
  END IF;

  LOOP
    v_number := CASE WHEN v_suffix = 1 THEN v_base ELSE v_base || '-' || lpad(v_suffix::text, greatest(2, length(v_suffix::text)), '0') END;
    -- ON CONFLICT evita sobrescribir y resuelve carreras con otras importaciones o creaciones manuales.
    INSERT INTO public.shipments(shipment_number, destination, shipment_date, status,
      total_expected_boxes, total_received_boxes, created_by, source_file_name, source_file_sha256,
      imported_at, imported_by, import_rows, import_warnings, import_request_id, import_payload_hash)
    VALUES(v_number, btrim(p_destination), p_shipment_date, 'receiving', v_total::integer, 0, v_user,
      p_source_file_name, p_source_file_sha256, now(), v_user, p_import_rows, p_warnings, p_request_id, v_hash)
    ON CONFLICT (shipment_number) DO NOTHING RETURNING id INTO v_id;
    EXIT WHEN v_id IS NOT NULL;
    v_suffix := v_suffix + 1;
    IF v_suffix > 9999 THEN RAISE EXCEPTION 'No se pudo generar un número de envío disponible.'; END IF;
  END LOOP;

  -- Agrupar SOLO en el payload actual y por la identidad completa, nunca por código aislado.
  INSERT INTO public.shipment_items(shipment_id, supplier, code_original, code_normalized,
    product_name, expected_boxes, received_boxes, status)
  SELECT v_id, nullif(coalesce(item->>'supplier', ''), ''), item->>'code_original',
    regexp_replace(upper(item->>'code_original'), '[[:space:]_./-]+', '', 'g'),
    item->>'product_name', sum((item->>'expected_boxes')::bigint)::integer, 0, 'pending'
  FROM jsonb_array_elements(p_items) AS t(item)
  GROUP BY coalesce(item->>'supplier', ''), item->>'code_original', item->>'product_name';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  -- Cualquier excepción revierte tanto shipment como items. No se captura ni oculta el error.
  RETURN jsonb_build_object('shipment_id', v_id, 'shipment_number', v_number,
    'item_count', v_count, 'total_boxes', v_total, 'reused', false);
END;
$$;

REVOKE ALL ON FUNCTION public.import_shipment_excel(text, date, text, text, text, integer, jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_shipment_excel(text, date, text, text, text, integer, jsonb, jsonb, uuid) TO authenticated;
COMMENT ON FUNCTION public.import_shipment_excel(text, date, text, text, text, integer, jsonb, jsonb, uuid)
  IS 'Importación atómica admin, SECURITY INVOKER/RLS, envío nuevo, identidad completa y reintento idempotente.';
NOTIFY pgrst, 'reload schema';
COMMIT;
