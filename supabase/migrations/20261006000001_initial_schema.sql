-- ============================================================
-- CITY RECEPCIÓN - Migración 1: Schema inicial
-- ============================================================

-- ----------------------------------------------------------------
-- EXTENSIONES
-- ----------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ----------------------------------------------------------------
-- TABLA: profiles
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  role        TEXT        NOT NULL DEFAULT 'warehouse' CHECK (role IN ('admin', 'warehouse')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.profiles            IS 'Perfiles de usuario con rol del sistema';
COMMENT ON COLUMN public.profiles.id         IS 'Referencia a auth.users';
COMMENT ON COLUMN public.profiles.role       IS 'admin | warehouse';

-- ----------------------------------------------------------------
-- TABLA: shipments
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shipments (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_number       TEXT        UNIQUE NOT NULL,
  destination           TEXT        NOT NULL,
  shipment_date         DATE        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'receiving', 'completed', 'cancelled')),
  total_expected_boxes  INTEGER     NOT NULL DEFAULT 0 CHECK (total_expected_boxes >= 0),
  total_received_boxes  INTEGER     NOT NULL DEFAULT 0 CHECK (total_received_boxes >= 0),
  created_by            UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.shipments                      IS 'Envios / remesas de mercaderia';
COMMENT ON COLUMN public.shipments.shipment_number      IS 'Numero unico de envio (ej. ENV-2026-001)';
COMMENT ON COLUMN public.shipments.status               IS 'draft | receiving | completed | cancelled';
COMMENT ON COLUMN public.shipments.total_expected_boxes IS 'Suma de expected_boxes de todos los items';
COMMENT ON COLUMN public.shipments.total_received_boxes IS 'Suma de received_boxes de todos los items (calculado)';

CREATE INDEX IF NOT EXISTS idx_shipments_status        ON public.shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_created_by    ON public.shipments(created_by);
CREATE INDEX IF NOT EXISTS idx_shipments_shipment_date ON public.shipments(shipment_date DESC);

-- ----------------------------------------------------------------
-- TABLA: shipment_items
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shipment_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id     UUID        NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  supplier        TEXT,
  code_original   TEXT        NOT NULL,
  code_normalized TEXT        NOT NULL,
  product_name    TEXT        NOT NULL,
  expected_boxes  INTEGER     NOT NULL CHECK (expected_boxes > 0),
  received_boxes  INTEGER     NOT NULL DEFAULT 0 CHECK (received_boxes >= 0),
  status          TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'partial', 'complete', 'excess')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.shipment_items                  IS 'Items individuales dentro de un envio';
COMMENT ON COLUMN public.shipment_items.code_original    IS 'Codigo tal como lo provee el proveedor (ej. KD-5238)';
COMMENT ON COLUMN public.shipment_items.code_normalized  IS 'Codigo normalizado para busqueda (sin guiones/espacios, uppercase)';
COMMENT ON COLUMN public.shipment_items.status           IS 'pending | partial | complete | excess (calculado automaticamente)';

-- Indices de rendimiento
CREATE INDEX IF NOT EXISTS idx_items_shipment_id     ON public.shipment_items(shipment_id);
CREATE INDEX IF NOT EXISTS idx_items_code_normalized ON public.shipment_items(code_normalized);
CREATE INDEX IF NOT EXISTS idx_items_supplier        ON public.shipment_items(supplier);
CREATE INDEX IF NOT EXISTS idx_items_status          ON public.shipment_items(status);

-- Indice GIN para busqueda por trigrama en product_name (permite LIKE '%texto%' eficiente)
CREATE INDEX IF NOT EXISTS idx_items_product_name_trgm
  ON public.shipment_items USING gin (product_name gin_trgm_ops);

-- Indice GIN tambien para supplier (busquedas parciales)
CREATE INDEX IF NOT EXISTS idx_items_supplier_trgm
  ON public.shipment_items USING gin (supplier gin_trgm_ops);

-- ----------------------------------------------------------------
-- TABLA: reception_events (auditoria completa)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reception_events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id       UUID        NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  shipment_item_id  UUID        NOT NULL REFERENCES public.shipment_items(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action            TEXT        NOT NULL CHECK (action IN ('receive', 'correction', 'reset')),
  quantity          INTEGER     NOT NULL,
  previous_quantity INTEGER     NOT NULL,
  new_quantity      INTEGER     NOT NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.reception_events                   IS 'Registro inmutable de cada operacion de recepcion';
COMMENT ON COLUMN public.reception_events.action            IS 'receive | correction | reset';
COMMENT ON COLUMN public.reception_events.quantity          IS 'Cantidad delta aplicada en esta operacion';
COMMENT ON COLUMN public.reception_events.previous_quantity IS 'received_boxes antes de la operacion';
COMMENT ON COLUMN public.reception_events.new_quantity      IS 'received_boxes despues de la operacion';

CREATE INDEX IF NOT EXISTS idx_events_shipment_id ON public.reception_events(shipment_id);
CREATE INDEX IF NOT EXISTS idx_events_item_id     ON public.reception_events(shipment_item_id);
CREATE INDEX IF NOT EXISTS idx_events_user_id     ON public.reception_events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at  ON public.reception_events(created_at DESC);

-- ----------------------------------------------------------------
-- TABLA: incidents
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incidents (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id      UUID        NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  shipment_item_id UUID        REFERENCES public.shipment_items(id) ON DELETE SET NULL,
  user_id          UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type             TEXT        NOT NULL
                     CHECK (type IN ('missing', 'extra', 'damaged', 'wrong_product', 'other')),
  description      TEXT        NOT NULL,
  photo_path       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ,
  resolved_by      UUID        REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE  public.incidents            IS 'Incidencias reportadas durante la recepcion';
COMMENT ON COLUMN public.incidents.type       IS 'missing | extra | damaged | wrong_product | other';
COMMENT ON COLUMN public.incidents.photo_path IS 'Ruta en Supabase Storage';

CREATE INDEX IF NOT EXISTS idx_incidents_shipment_id ON public.incidents(shipment_id);
CREATE INDEX IF NOT EXISTS idx_incidents_type        ON public.incidents(type);
CREATE INDEX IF NOT EXISTS idx_incidents_resolved_at ON public.incidents(resolved_at);
