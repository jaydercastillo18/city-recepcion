# Importación de envíos · City Ofertas

## Activación manual en Supabase

La migración nueva **no se ha ejecutado en el proyecto remoto**. El SQL exacto está en:

`supabase/migrations/20261008190344_import_shipments_excel.sql`

Revisa ese archivo y ejecuta **su contenido completo** en el SQL Editor del proyecto existente. Incluye `BEGIN`/`COMMIT`, campos de auditoría, índices, la RPC, permisos y recarga del esquema de PostgREST. No vuelvas a ejecutar las migraciones antiguas, ni `seed.sql`, ni reimportes CHIMBOTE-20261006. No se necesita una clave service-role para importar desde la aplicación.

La migración añade campos nulos a los envíos históricos; no cambia sus cantidades, estados, productos, incidencias ni eventos. Conserva Auth, roles y políticas RLS existentes. Si todavía no está aplicada, la confirmación informa que hay que habilitar la importación; la vista previa funciona sin ella.

## Uso con un Excel real

1. Inicia sesión con un perfil `admin` y abre `/admin/envios`.
2. Pulsa **Nuevo envío** y selecciona el archivo `.xlsx`, `.xls` o `.csv` recibido de almacén central.
3. Revisa la hoja elegida y la fecha, que puedes corregir. Por ahora el destino es **CHIMBOTE**, de solo lectura. El número del envío se genera automáticamente como `CHIMBOTE-YYYYMMDD` al cambiar la fecha y tampoco se edita; al confirmar se añade un sufijo si ya existe.
4. Comprueba filas detectadas, productos, total de **CAJAS ENVIADAS**, advertencias y tabla de productos. Las filas inválidas bloquean la confirmación; corrige el archivo y vuelve a seleccionarlo. Los códigos vacíos o `000000` muestran advertencias, pero son válidos.
5. Pulsa **Confirmar importación**. Antes de ese paso no se escribe nada en Supabase. La recepción nueva empieza en cero y en estado «En recepción».
6. Pulsa **Empezar recepción**. La dirección utiliza el UUID del nuevo envío: `/recepcion/[shipmentId]`.
7. Para comprobar el aislamiento, abre por separado el envío anterior y el nuevo. Un mismo código puede estar en ambos; cantidades, observaciones y reportes pertenecen al UUID seleccionado.

Una nueva subida del mismo archivo crea otro envío, con sufijo `-02`, `-03`, etc. Nunca sobrescribe uno anterior. Un reintento de la **misma confirmación**, después de una desconexión y con la misma vista previa abierta, reutiliza el resultado guardado y evita una creación accidental duplicada.

## Lectura y validación

Los encabezados se convierten a mayúsculas, se eliminan tildes y se normalizan saltos de línea, puntuación y espacios. Se buscan en las primeras 80 filas.

| Campo | Ejemplos reconocidos |
| --- | --- |
| Proveedor opcional | PROVEEDOR/MARCA, PROVEEDOR, MARCA |
| Código requerido como columna | CÓDIGO, COD, CÓDIGO DE PRODUCTO |
| Producto requerido | PRODUCTO, NOMBRE DEL PRODUCTO, DESCRIPCIÓN |
| Cantidad requerida | CAJAS ENVIADAS, CJS ENVIADAS |

CAJAS DISTRIBUIDAS, PENDIENTES, RECIBIDAS y NO LLEGÓ no determinan la cantidad esperada. Se omiten filas con 0 cajas y se bloquean cantidades negativas, fraccionarias, ausentes o inválidas. No se aceptan columnas requeridas ambiguas, ni productos sin nombre con cajas positivas. Las fórmulas usan el valor que Excel guardó: guarda/recalcula el libro primero y revisa la vista previa.

El código original conserva el texto visible, incluido un formato numérico como `000123`. Si Excel ya eliminó los ceros y no conserva un formato que los muestre, no pueden recuperarse; configura la columna como texto en origen. `code_normalized` elimina separadores y convierte a mayúsculas para buscar.

La fecha se busca antes del encabezado, junto a una etiqueta FECHA. Admite «martes, 6 de octubre de 2026», `2026-10-06`, `06/10/2026` y fechas numéricas de Excel con calendario 1900 o 1904. Si falta o hay varias fechas, debes elegirla. El parser conserva la detección de DESTINO o SUCURSAL para uso futuro, pero el importador actual ignora ese texto y fija CHIMBOTE tanto en la UI como en la confirmación del servidor.

Se agrupan únicamente filas con **proveedor + código original + nombre exactamente iguales dentro de la hoja seleccionada**. Códigos repetidos con otro producto/proveedor no se unen. Los productos distintos con `000000` permanecen separados; el escáner ofrece elegir entre coincidencias del envío activo. Los códigos vacíos se reciben buscando por producto.

Límites: 5 MB por archivo, 20 hojas, 100 columnas, 10.000 filas de datos y 5.000 productos por envío. Se elige una sola hoja por importación y nunca se mezclan sus datos con otras hojas o envíos. PDF y archivos protegidos/no legibles se rechazan.

## Arquitectura y seguridad

- El modal `import-shipment-dialog.tsx` mantiene archivo, metadatos y vista previa solo en memoria.
- `POST /api/shipments/import/preview` verifica sesión/rol admin, limita la carga y analiza el archivo; no escribe datos.
- `POST /api/shipments/import/confirm` exige confirmación, vuelve a analizar el archivo original y comprueba la huella de la vista previa. No confía en productos/cantidades enviados por el navegador.
- La RPC `public.import_shipment_excel` valida nuevamente usuario, metadatos y productos. Es `SECURITY INVOKER`, usa RLS existente, no permite ejecución anónima y rechaza `warehouse`.
- Shipment y productos se crean en una única transacción PostgreSQL. Cualquier excepción revierte todos los inserts. Un índice único y `ON CONFLICT DO NOTHING` generan números seguros sin actualizar históricos.
- UUID por intento, bloqueo transaccional y huella del payload permiten reintentos idempotentes. Una nueva sesión de subida recibe otro UUID.
- La auditoría guarda nombre y SHA-256 del archivo, fecha/hora, usuario, filas detectadas y advertencias. No almacena el archivo completo.
- Recepción, observaciones, búsqueda y reportes filtran por `shipment_id`. Se cargan páginas de 500 filas para evitar el truncamiento habitual de Supabase; un fallo posterior no devuelve un detalle incompleto.
- El histórico se agrupa por mes y conserva cada tarjeta/enlace independiente; permite estado, fecha, destino y búsqueda por número/destino/fecha.

## Archivos de esta fase

Nuevos:

- `supabase/migrations/20261008190344_import_shipments_excel.sql`
- `src/app/api/shipments/import/preview/route.ts`
- `src/app/api/shipments/import/confirm/route.ts`
- `src/features/shipments/import/{types,format,parser,http}.ts`
- `src/features/shipments/components/import-shipment-dialog.tsx`
- `src/features/shipments/components/shipment-history.tsx`
- `src/lib/supabase/read-all-rows.ts`
- `tests/import-parser.test.ts`, `tests/import-transaction.test.ts`, `tests/import-pagination.test.ts`
- `docs/importacion-excel.md`

Modificados:

- `src/app/admin/envios/page.tsx`
- `src/app/globals.css`
- `src/features/shipments/actions.ts`
- `src/lib/reports/fetch-report-data.ts`
- `src/types/index.ts`, `src/types/database.ts`
- `package.json`, `package-lock.json`, `README.md`

Se reutiliza `xlsx`, ya instalado. Las dependencias nuevas `tsx` y `@electric-sql/pglite` son **solo de desarrollo** para pruebas; PGlite ejecuta PostgreSQL temporal sin acceso al Supabase real.

## Verificación reproducible

```sh
npm run test:import
npm run lint
npx tsc --noEmit
npm run build
```

Las pruebas incluyen los seis casos solicitados, permisos anónimos/RLS, reintentos, sufijos mayores que 9, fechas numéricas en ambos calendarios, ceros iniciales, CSV/XLS, validaciones y paginación. Después de cada prueba transaccional se comprueba que la copia local de CHIMBOTE-20261006 conserva exactamente envío, productos, eventos e incidencias. Los tests no usan credenciales ni hacen escrituras remotas.

Resultado de la verificación: **19/19 pruebas aprobadas**, lint sin errores, TypeScript sin errores y build de producción correcto. Next.js mantiene el aviso preexistente de deprecación de `middleware` a favor de `proxy`; no bloquea la compilación.
