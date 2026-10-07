-- ============================================================
-- CITY RECEPCIÓN - Migración 2: RLS Policies (Sincronizada)
-- ============================================================

-- ----------------------------------------------------------------
-- HABILITAR RLS (Idempotente)
-- ----------------------------------------------------------------
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reception_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents        ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- FUNCIÓN AUXILIAR: obtener rol del usuario autenticado
-- SECURITY DEFINER con search_path fijo para evitar privilege escalation
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- ----------------------------------------------------------------
-- RLS: profiles (5 policies)
-- ----------------------------------------------------------------

-- 1. Cada usuario puede ver su propio perfil
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

-- 2. Admin puede ver todos los perfiles
CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  USING (public.get_my_role() = 'admin');

-- 3. Cada usuario puede actualizar su propio perfil (no puede cambiar su rol)
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = public.get_my_role());

-- 4. Admin puede actualizar perfiles (incluyendo cambio de roles)
CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- 5. Creación de perfil para usuario propio
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- ----------------------------------------------------------------
-- RLS: shipments (4 policies)
-- ----------------------------------------------------------------

-- 6. Todos los usuarios autenticados pueden ver envíos
CREATE POLICY "shipments_select_authenticated"
  ON public.shipments FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 7. Solo admin puede crear envíos
CREATE POLICY "shipments_insert_admin"
  ON public.shipments FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

-- 8. Solo admin puede actualizar envíos directamente
CREATE POLICY "shipments_update_admin"
  ON public.shipments FOR UPDATE
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- 9. Solo admin puede eliminar envíos
CREATE POLICY "shipments_delete_admin"
  ON public.shipments FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ----------------------------------------------------------------
-- RLS: shipment_items (4 policies)
-- ----------------------------------------------------------------

-- 10. Todos los autenticados pueden ver items
CREATE POLICY "items_select_authenticated"
  ON public.shipment_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 11. Solo admin puede insertar items
CREATE POLICY "items_insert_admin"
  ON public.shipment_items FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

-- 12. Solo admin puede actualizar items directamente (operaciones de almacén vía RPC)
CREATE POLICY "items_update_admin"
  ON public.shipment_items FOR UPDATE
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- 13. Solo admin puede eliminar items
CREATE POLICY "items_delete_admin"
  ON public.shipment_items FOR DELETE
  USING (public.get_my_role() = 'admin');

-- ----------------------------------------------------------------
-- RLS: reception_events (1 policy)
-- ----------------------------------------------------------------

-- 14. Todos los autenticados pueden ver eventos de recepción
CREATE POLICY "events_select_authenticated"
  ON public.reception_events FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ----------------------------------------------------------------
-- RLS: incidents (4 policies)
-- ----------------------------------------------------------------

-- 15. Todos los autenticados pueden ver incidencias
CREATE POLICY "incidents_select_authenticated"
  ON public.incidents FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 16. Cualquier usuario autenticado puede crear incidencias
CREATE POLICY "incidents_insert_authenticated"
  ON public.incidents FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- 17. Solo admin puede actualizar (resolver) incidencias
CREATE POLICY "incidents_update_admin"
  ON public.incidents FOR UPDATE
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- 18. Solo admin puede eliminar incidencias
CREATE POLICY "incidents_delete_admin"
  ON public.incidents FOR DELETE
  USING (public.get_my_role() = 'admin');
