# Cierre y eliminación administrativa · City Ofertas

## SQL pendiente de aplicación manual

El SQL exacto es el contenido completo de:

`supabase/migrations/20261008203448_shipment_admin_finalize_delete.sql`

Revisa y ejecuta ese archivo completo en el SQL Editor del proyecto existente. Incluye `BEGIN`/`COMMIT`, campos de auditoría, RPC, permisos y recarga de PostgREST. **No se ha aplicado al Supabase remoto**. No ejecutes el seed ni vuelvas a ejecutar migraciones anteriores. Esta migración no finaliza, elimina, reinicia ni cambia cantidades de ningún envío existente.

Antes de aplicarla, las acciones muestran un mensaje que indica que falta habilitarlas. Importación, recepción y reportes siguen usando los datos existentes.

## Finalizar recepción

Solo los administradores ven la acción de cierre. Pulsa **Finalizar recepción** en el histórico o en la cabecera del envío para abrir un resumen con esperadas, recibidas, faltantes, pendientes, parciales y observaciones/incidencias.

- Sin faltantes: muestra **Recepción completa** y permite confirmar normalmente.
- Con faltantes: muestra **FINALIZAR CON FALTANTES**, explica que la diferencia quedará en el reporte final y exige marcar **Entiendo que existen cajas faltantes y quiero cerrar el envío**. El motivo es opcional, pero recomendado; admite hasta 2000 caracteres. Solo entonces se habilita el botón de cierre.

La RPC `finalize_shipment_admin(uuid, boolean, text)` vuelve a exigir sesión y rol admin, bloquea el envío, calcula los faltantes por producto y exige aceptación expresa si falta alguna caja. Los excesos de un producto nunca compensan los faltantes de otro. Si las cantidades cambiaron desde el resumen, la decisión se valida de nuevo en PostgreSQL.

Se guarda:

- `finalized_at`: fecha/hora del cierre.
- `finalized_by`: UUID del administrador.
- `finalized_by_name`: nombre del administrador capturado al cierre, para mostrarlo en reportes aunque el emisor sea un operario.
- `finalized_with_shortage`: si hubo faltantes.
- `missing_boxes_at_finalization`: faltantes reales al cierre.
- `finalization_notes`: motivo opcional.

El estado es `completed`. **16 esperadas / 13 recibidas permanecen 16 / 13, con 3 faltantes**. No se modifican cantidades, estados de productos, incidencias ni eventos. La RPC de recepción existente rechaza movimientos en un envío completado. Reintentar el cierre no sobrescribe su auditoría.

El histórico muestra **Cerrado con 3 faltantes** con un indicador ámbar. PDF y Excel siguen disponibles: incluyen **Finalizado con faltantes**, faltantes al cierre, motivo, administrador y fecha/hora. Conservan detalle completo, productos pendientes/parciales, diferencias y observaciones. Los envíos históricos ya completados sin auditoría nueva continúan siendo compatibles; no se rellenan datos inventados.

## Eliminar definitivamente

En `/admin/envios`, usa el botón discreto de papelera **Eliminar envío**. El modal vuelve a consultar el envío y muestra número, fecha, productos, recibidas/esperadas, eventos e incidencias/observaciones.

Advierte si hay movimientos reales o si ya está finalizado. Para habilitar **ELIMINAR DEFINITIVAMENTE**, escribe el número exacto del envío: respeta mayúsculas y espacios. No hay trato especial para nombres de pruebas.

La RPC `delete_shipment_admin(uuid, text)`:

1. Exige sesión y rol admin.
2. Bloquea productos y envío de manera compatible con la recepción existente.
3. Comprueba nuevamente la coincidencia exacta del número.
4. Elimina incidencias, eventos, productos y el envío dentro de una transacción.
5. Devuelve el ID/número y las cantidades de registros eliminados.

Si falla cualquier paso, revierte todo. El borrado utiliza exclusivamente el `shipment_id` indicado y no toca otros envíos. Después se actualizan listado, recepción y dashboard; los endpoints PDF/Excel existentes responden 404 para el envío inexistente. Los archivos previamente descargados por un usuario no se pueden recuperar desde la aplicación después del borrado.

Ambas RPC son `SECURITY INVOKER`, con `search_path` vacío, sin ejecución para `PUBLIC`/`anon` y permiso `authenticated` con comprobación interna de admin. La migración añade una política DELETE exclusivamente admin a `reception_events` para permitir la eliminación ordenada de dependencias; mantiene RLS habilitado y las demás políticas. No se utiliza service-role desde el navegador ni desde las acciones.

También concede el privilegio de tabla DELETE a `authenticated` en las cuatro tablas necesarias. Las políticas RLS restringen las filas exclusivamente a admin; tener ese privilegio no permite a un operario borrar registros.

## Archivos de esta fase

Nuevos: la migración citada, `src/features/shipments/admin-actions.ts`, `src/features/shipments/components/delete-shipment-dialog.tsx` y esta guía.

Modificados: `src/features/shipments/actions.ts`, `src/features/shipments/components/shipment-history.tsx`, `src/features/reception/components/finalize-shipment-modal.tsx`, `src/features/reception/components/shipment-report-buttons.tsx`, `src/features/reception/components/shipment-header.tsx`, `src/lib/reports/report-rows.ts`, `src/lib/reports/pdf-generator.ts`, `src/lib/reports/excel-generator.ts`, `src/types/index.ts`, `src/types/database.ts`, `tests/import-transaction.test.ts`, `package.json` y `README.md`.

No se han añadido dependencias. `npm test` ejecuta todas las pruebas existentes y las administrativas en PostgreSQL temporal, sin credenciales ni escrituras remotas.

## Verificación

```sh
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Las pruebas cubren los once casos solicitados, ausencia de permisos anónimos, idempotencia del cierre y rollback de borrado ante un fallo intermedio. Después de cada prueba transaccional se compara la copia local del 06/10 para garantizar que envío, productos, eventos e incidencias permanecen intactos. El PDF de ejemplo 13/16 también se renderiza para revisar que auditoría y detalle sean legibles.

Resultado: **53/53 pruebas aprobadas**, lint y TypeScript sin errores, build correcto. Permanece el aviso preexistente de Next.js sobre `middleware`/`proxy`.
