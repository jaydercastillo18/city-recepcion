# Control de asistencia · City Ofertas Chimbote

## Arquitectura y estado de entrega

Se implementaron las fases A–E en el proyecto Next.js existente, usando el mismo Supabase Auth, las mismas cookies y el mismo despliegue. No se crearon proyectos externos, no se enviaron correos de prueba y no se ejecutó SQL remoto. La migración original `20261009001046_attendance_module.sql` ya está aplicada en Supabase remoto y existen empleados reales. No debe volver a ejecutarse. La migración de enlaces `20261009025154_attendance_access_links.sql` también está aplicada, según la inspección remota del 9 de octubre. El rediseño y ciclo de vida de personal se describen en [attendance-redesign.md](attendance-redesign.md); únicamente la nueva migración de personal está pendiente.

El portal `/` dirige a admin a dos módulos, a employee a `/asistencia` y a warehouse a recepción. Administración de asistencia usa `/admin/asistencia` con Hoy, Personal, Horarios, Importar Excel, Historial, Reportes y Configuración. Se conserva el branding, header y fondo existente.

## SQL exacto y aplicación manual

La migración original se conserva idéntica a la versión aplicada. SQL de enlaces ya aplicado: [`20261009025154_attendance_access_links.sql`](../supabase/migrations/20261009025154_attendance_access_links.sql). **No volver a ejecutarlo.**

SQL incremental de personal pendiente: [`20261009211607_attendance_personnel_lifecycle.sql`](../supabase/migrations/20261009211607_attendance_personnel_lifecycle.sql). Las instrucciones siguientes se refieren solo a este archivo nuevo.

1. Revisar únicamente el archivo incremental completo. Esta entrega no lo ejecuta en Supabase remoto.
2. Cuando se autorice su aplicación, ejecutar ese archivo una sola vez, incluyendo `BEGIN` y `COMMIT`, sobre la base que ya tiene el módulo original.
3. No ejecutar la migración original, seeds ni `db reset`. Las pruebas usan una base PostgreSQL en memoria con datos históricos antes de aplicar la incremental.
4. No se recrean tablas, esquema, bucket ni policies. `attendance_private` sigue sin exponerse en la API.
5. Desplegar el código de accesos después de aplicar la incremental. Esta entrega no publica ni envía correos reales.

### Comparación previa del esquema y cambios de acceso ya aplicados

La consulta remota de solo lectura confirmó 3 empleados reales, la tolerancia individual, los turnos día/noche y el cierre exclusivo de día. La columna `invitation_email_status` no existe; `lookup_account` devuelve solo id/rol y faltan `access_statuses` e `invitation_email`. Las policies ya restringen administración a admin y lectura a employee sobre sus propios datos; warehouse no obtiene acceso administrativo.

La incremental agrega solo `employees.invitation_email_status`, con `DEFAULT 'not_sent'`, `NOT NULL` y un CHECK de cuatro estados. Es metadata operativa necesaria para recordar el resultado del envío después de cerrar el modal. Para empleados anteriores, el valor inicial indica que el flujo nuevo no ha registrado un envío; no reconstruye correos históricos. No se agregan estados de activación, fechas duplicadas, links, tokens, OTP ni contraseñas a las tablas de asistencia.

Se reemplazan únicamente la función privada del comando y su wrapper público, conservando firmas, propietarios, permisos, `search_path` y guardas de administrador. `lookup_account` obtiene indicadores de Auth sin devolver hashes; `access_statuses` calcula estados desde Auth; `invitation_email` guarda y audita solo el estado de entrega. El resto del cuerpo del comando conserva exactamente sus operaciones anteriores. No hacen falta nuevos índices, policies ni triggers: los existentes ya cubren el acceso y la vinculación.

El ALTER no modifica códigos, profile_id, tolerancias, timestamps, horarios, asistencias, imports, fotos, secuencia ni auditoría existentes. Solo añade el valor por defecto a la nueva columna. La función `generateLink` sigue exclusivamente en el servidor con la clave administrativa; no requiere una función SQL ni persistencia del enlace.

Las tablas nuevas son `employees`, `attendance_schedules`, `attendance_records`, `attendance_imports`, `attendance_settings`, `attendance_audit_log`. Incluyen índices por fecha/empleado, claves foráneas, unicidad por empleado/fecha/turno y por horario en asistencia, restricciones de estado, horarios coherentes y timestamps. No se borran empleados ni horarios históricos desde la UI; personal se desactiva.

La migración amplía `profiles.role` con `employee`. **No cambia roles de cuentas existentes.** Las cuentas nuevas se crean como employee, ignorando cualquier rol en metadata; futuros usuarios de almacén requieren asignación explícita del rol warehouse por un administrador autorizado. Se conserva el perfil y su arquitectura.

Las políticas originales de mercadería quedan vigentes. Se añade una política restrictiva para impedir que el nuevo rol employee herede sus lecturas antiguas de “todos los autenticados”. La RPC existente `get_shipment_stats` cambia exclusivamente a `SECURITY INVOKER`, conservando cuerpo, firma y cálculos, para que respete ese aislamiento. Admin y warehouse conservan recepción y estadísticas. No se cambian las cantidades ni los datos de envíos, items, eventos o incidencias, ni parser, escáner, cierres o eliminación.

## RLS, comandos y privacidad

- Admin puede leer toda la asistencia. Las mutaciones se ejecutan con motivo obligatorio mediante `attendance_admin_command`.
- Employee solo puede leer su ficha, horarios y registros. Consulta su tolerancia individual, pero no puede modificarla.
- Warehouse no obtiene acceso administrativo ni lecturas de asistencia automáticamente.
- No se conceden INSERT/UPDATE/DELETE de las tablas de asistencia a `authenticated`, ni escrituras arbitrarias de registros, importaciones o auditoría.
- Las RPC públicas son invoker. Los únicos helpers con privilegios elevados están en `attendance_private`, con `search_path` vacío, permisos anónimos revocados y autorización interna por `auth.uid()` y el rol real de profiles. Son necesarios para escribir registros sin conceder escrituras al empleado.
- Las fotos son JPEG de hasta 2 MB en un bucket privado. El servidor verifica sesión, empleado, contenido JPEG y reloj PostgreSQL antes de registrar. El navegador comprime la imagen antes de subirla.
- Rutas: `attendance/YYYY/MM/DD/EMP-0001/<uuid>.jpg`. Las políticas impiden subir a otra persona, reemplazar objetos y leer evidencia ajena.
- Para ver fotos, `/api/asistencia/photo?record=<id>` consulta el registro bajo RLS y genera un signed URL de **60 segundos**. Respuesta privada, sin caché y no indexable. No se usa reconocimiento facial ni biometría.
- Un upload fallido se intenta limpiar. La evidencia ya usada en un registro o en auditoría no puede ser eliminada por el empleado.

## Invitaciones y contraseñas

Configurar en el servidor local y en Vercel Environment Variables:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=<clave administrativa del proyecto actual>
APP_URL=https://city-recepcion.vercel.app
```

En desarrollo: `APP_URL=http://localhost:3000`. Nunca agregar `NEXT_PUBLIC_` a la clave administrativa ni compartirla con el navegador. Las lecturas, reportes y marcaciones utilizan el cliente autenticado normal; la clave administrativa solo se usa en el servidor para generar enlaces Auth y enviar correo cuando admin lo solicita.

En Supabase Auth → URL Configuration, agregar los redirect URLs exactos:

- `http://localhost:3000/auth/invitacion`
- `https://city-recepcion.vercel.app/auth/invitacion`

Si se usa otro dominio autorizado del deployment, configurar su APP_URL y redirect correspondiente. No se configura SMTP externo en esta entrega.

Flujo principal: Personal → Agregar empleado → Guardar y crear acceso → `auth.admin.generateLink({ type: "invite", email, options: {redirectTo, data: {full_name}} })` → modal Acceso creado. Generar el enlace no envía correo. Copiar enlace o WhatsApp funcionan sin SMTP. El administrador abre WhatsApp y confirma el envío allí; la aplicación no manda mensajes automáticamente. La contraseña se crea en `/auth/invitacion`.

El botón Enviar por correo es opcional y hace un único intento mediante Supabase Auth. No hay reintentos automáticos; durante la solicitud se deshabilita y bloquea el doble clic. El límite temporal se traduce a español y conserva la cuenta, la vinculación y el enlace visible. El fallback Copiar/WhatsApp sigue disponible. Un envío exitoso de invitación puede reemplazar el token anterior en Supabase: el modal deja de ofrecer ese enlace antiguo. Si se genera otro después, se advierte expresamente que reemplaza el anterior, incluido el del correo.

Se separan cuenta (Sin acceso / Invitación pendiente / Cuenta activada) y correo (No enviado / Enviado / Límite temporal alcanzado / Error de envío). El estado del correo se guarda en `employees.invitation_email_status` y se audita solo ese estado. Cuenta activada se calcula en PostgreSQL a partir de `auth.users.email_confirmed_at` y la existencia de contraseña, sin devolver hashes. Un fallo de email no activa ni desactiva cuentas.

Una cuenta employee ya activada se vincula y utiliza su contraseña actual. No se generan enlaces de reinicio para ella. Una invitación pendiente permite Generar nuevo enlace con confirmación, solo admin. Si ya confirmó el enlace pero no terminó de establecer contraseña, Supabase requiere generar un enlace de recuperación en lugar de otra invitación; se usa Auth y la misma pantalla. Nunca se inventan tokens. Cuentas admin/warehouse no se convierten en empleados.

El `action_link` se devuelve únicamente al administrador autenticado que lo pidió y vive en el estado del modal. No se guarda en localStorage, base de datos, auditoría, imports, logs, analytics ni reportes. Al cerrar el modal se descarta. No se enviaron correos reales durante pruebas.

Si City Ofertas necesita muchas invitaciones o recuperaciones por correo, se podrá configurar SMTP propio en Supabase Auth en una fase posterior. El flujo Generate Link → WhatsApp/Copiar ya permite operar sin ese servicio.

## Personal y horarios

El código interno se asigna dentro de PostgreSQL con una secuencia: EMP-0001, EMP-0002… Los números no se reutilizan tras un fallo y no se truncan al pasar EMP-9999. Cambiar el nombre conserva el código.

Personal permite buscar nombre/código/cargo, filtrar activos/inactivos, crear, editar, activar/desactivar e invitar. Cada cambio guarda auditoría y motivo. El correo de una cuenta vinculada no se altera desde Personal; debe administrarse de forma coherente desde Auth.

Cada horario pertenece a empleado, fecha y turno (`day` / `night`), independientemente de otros días. El formulario permite una hora o descanso. Un día que ya tiene una marcación o cierre requiere Corregir en Historial, con auditoría; no se sobrescribe desde una importación.

## Importación de horario Excel

Columnas: `NOMBRE`, `FUNCIÓN` (o `CARGO`), `6-Oct`, `7-Oct`… También se reconocen fechas de Excel, ISO y fechas con año. Para columnas sin año se exige el año visible del importador. Soporta `.xlsx` y `.xls` de hasta 3 MB y hasta 20 000 horarios; celdas vacías se omiten. Archivo más selecciones, vista previa y reportes se limitan a 4 MB; si exceden, se pide dividir el período, compatible con el [límite de funciones de Vercel](https://vercel.com/docs/functions/limitations#request-body-size).

**Importación diaria:** el Excel puede contener varias fechas. El campo Fecha objetivo inicia en hoy (Perú), muestra las fechas detectadas y permite seleccionar otra expresamente. La vista previa y la confirmación procesan solo esa columna. El SQL rechaza filas de otras fechas. Importar el 8-Oct nunca cambia el 7-Oct ni crea `attendance_records`. Los títulos `HORARIO … (Turno Día)` / `(Turno Noche)` se reconocen incluso dentro de una misma hoja y guardan `day` / `night`. Sin indicación de turno se usa `day`.

Personal ofrece 0, 5, 10, 15 y valor personalizado de tolerancia. Solo admin modifica la ficha. El cambio guarda `employee_tolerance_changed` con antes/después, actor, motivo y fecha. `attendance_settings` conserva solo la hora límite global. La pantalla propia y el historial muestran la tolerancia; los reportes incluyen el snapshot aplicado. Solo el turno día participa en control de asistencia. El turno noche muestra «Sin control de asistencia», sin cámara ni botón de marcación. La RPC rechaza night incluso sin foto; cierre y correcciones no crean registros para night. KPIs y detalle de asistencia excluyen noche. Excel incluye «Horario noche» y PDF una tabla informativa cuando corresponda.

Horas admitidas: `09:00`, `9:00 a. m.`, `2:00 p. m.`, fracciones de día Excel y `DESCANSO`. Hora inválida bloquea la confirmación y debe corregirse en el archivo.

Se normalizan tildes, mayúsculas y espacios del nombre. Solo una coincidencia exacta y única de nombre normalizado entre empleados activos se sugiere automáticamente. Nombres desconocidos o ambiguos requieren elegir el código de una persona o crear la ficha desde la vista previa. No se usa coincidencia difusa automática.

La vista previa pagina 50 filas y muestra empleado, fecha, horario anterior, nuevo y acción NUEVO/SIN CAMBIOS/ACTUALIZAR/ERROR. Cambiar la selección de una persona aplica a las fechas con ese mismo nombre en el Excel. Las filas duplicadas por empleado, fecha y turno bloquean la confirmación. Solo ACTUALIZAR requiere casilla explícita y motivo; SIN CAMBIOS conserva timestamp y origen, incluso si ya existe asistencia.

La confirmación vuelve a parsear el archivo, verifica su hash, empleados activos y todas las filas. PostgreSQL compara el timestamp del horario anterior; si cambió desde la vista previa, la importación se revierte y pide revisar nuevamente. El import, sus horarios y auditoría se guardan en una sola transacción. Cada intento tiene UUID: un reintento idéntico es idempotente; otro archivo/datos con el mismo intento se rechaza. Los imports anteriores permanecen auditados.

## Marcación y estados

Employee entra a `/asistencia`, ve su horario de hoy, toma/sube foto, revisa el preview y confirma. `/api/asistencia/check-in` acepta foto y el identificador del horario/turno: no acepta un employee_id, estado u hora del navegador. La RPC obtiene su empleado y horario de hoy con fecha **America/Lima**, bloquea las filas y utiliza `clock_timestamp()` del servidor.

Unicidad por `schedule_id` (horario de empleado/fecha/turno) y bloqueo evitan doble entrada. El intento repetido devuelve “Ya registraste tu asistencia hoy a las HH:MM”. No se permite marcar sin horario, en descanso, con ficha inactiva, después de la hora límite o si el día ya fue cerrado/justificado. Un registro corregido a pendiente y sin entrada puede volver a marcarse.

La tardanza se calcula en **minutos completos** desde la hora programada. Con tolerancia 5: 09:55, 10:00 y 10:04 son puntuales; 10:06 son 6 minutos de tardanza; 10:20 son 20. Los timestamps originales conservan los segundos. La tolerancia viene de `employees.late_tolerance_minutes` (entero 0–120, por defecto 5). Cada registro guarda `tolerance_minutes_applied NOT NULL`. Cambiar la ficha no altera registros previos. La corrección administrativa usa el snapshot existente, o la tolerancia actual al crear un registro nuevo. El cierre conserva el snapshot si existe. La corrección administrativa recalcula puntual/tarde con la misma función; no permite asignar esos estados ignorando la hora.

Antes de `scheduled_time + absence_cutoff_minutes` (180 por defecto) se muestra pendiente. Al superar el límite, la lectura del servidor muestra falta en dashboard, historial, estadísticas y reportes. **Ese estado calculado aún no crea un registro permanente**: Cerrar asistencia del día lo materializa y audita. También se permite cerrar explícitamente antes del límite, con advertencia, casilla y motivo. No se instalaron tareas cron remotas.

La pantalla de hoy y la del empleado refrescan cada 60 segundos mientras son visibles, y permiten Actualizar manualmente. Los días de descanso se cuentan aparte. No se calcula ninguna hora importante usando el reloj del celular.

## Administración, correcciones y reportes

Hoy muestra programados, asistidos, puntuales, tarde, faltas, descansos, justificados y pendientes, búsqueda/filtro y fotos. Historial consulta hasta un año y muestra las últimas 200 entradas de auditoría del período.

Corregir permite justificar, cambiar entrada/horario, observación y estado, con motivo obligatorio. Rechaza entradas futuras o ajenas a la fecha de trabajo. Se guarda antes/después, empleado, registro, actor y fecha. El empleado no puede hacer correcciones.

Reportes usa el mismo cliente autenticado bajo RLS. Admin exporta un día/período o empleado; employee exporta únicamente su información. Warehouse no accede. Los endpoints no usan service_role.

- PDF: logo, cabecera City Ofertas Chimbote, fechas, resumen, detalle (nombre, código, cargo, horario, entrada, estado, minutos y observación), responsable, hora Perú y páginas.
- Excel: Resumen (incluye estadísticas por persona), Detalle, Tardanzas, Faltas, Descansos y Justificaciones.
- Los estados calculados de falta aún sin cierre se identifican como “Hora límite superada”. No se incluyen URLs de fotos en archivos exportados.

## Prueba manual con dos empleados

1. Aplicar el SQL nuevo manualmente y configurar variables/redirects como se indicó; iniciar el proyecto con `npm run dev`.
2. Entrar con **el admin existente**. El portal debe mostrar ambos módulos. Abrir Control de asistencia → Personal.
3. Agregar `Prueba Puntual` y `Prueba Tarde`, con dos correos reales distintos a los que puedas acceder, cargo `Prueba` y motivo `Prueba de módulo`. Anotar sus códigos EMP; no crear ni compartir contraseñas desde administración.
4. Generar el acceso de ambas fichas, copiar/compartir por WhatsApp el enlace, abrirlo en una sesión separada y crear la contraseña propia. Opcionalmente probar el envío explícito por correo. Si ya existía una cuenta employee con ese correo, usar su contraseña actual tras vincularla.
5. Admin → Horarios: asignar **la fecha actual de Perú** a ambos. Para Prueba Puntual, programar aproximadamente 5 minutos después de la hora actual; para Prueba Tarde, aproximadamente 20 minutos antes. Evitar probar cerca de medianoche. Motivo `Prueba de puntualidad`.
6. En el celular (HTTPS del deployment para cámara) o navegador con carga de imagen, entrar como Prueba Puntual. Debe ir a `/asistencia`; tomar/subir foto, revisar y confirmar. Esperar estado Puntual y hora del servidor.
7. Entrar como Prueba Tarde en otro navegador/sesión. Marcar con otra foto. Debe aparecer Tarde, aproximadamente 20 minutos según cuánto demoró la prueba.
8. Reintentar marcar: debe avisar que ya existe entrada, sin crear otro registro. Ninguna cuenta debe ver registros/fotos de la otra ni entrar a `/admin/asistencia/personal` o mercadería.
9. Admin → Hoy: ver ambas entradas y abrir las fotos. Corregir una observación con motivo. Historial → Auditoría debe mostrar antes/después y responsable.
10. Para probar descanso, asignarlo a una fecha distinta mediante Horarios. Consultar esa fecha en la ficha/historial; se muestra Descanso. Si se prueba en la fecha actual, usar un día sin marcaciones; el servidor debe rechazar marcar.
11. Crear un Excel con `NOMBRE | FUNCIÓN | <fecha futura> | <otra fecha futura>` y ambas personas, una hora y DESCANSO. Generar preview, resolver coincidencias y confirmar. Elegir una sola fecha objetivo y confirmar. Reimportar esa fecha: debe mostrar SIN CAMBIOS y omitir escrituras; cambiar una hora requiere aceptación expresa. No usar para sobrescribir el día ya marcado.
12. Crear otra fecha pasada sin entradas, cerrar ese día con motivo y confirmar. Deben aparecer faltas o descansos, con auditoría. No cerrar el día real de trabajo durante una prueba sin intención de hacerlo.
13. Exportar PDF diario y Excel del período, y luego un reporte propio desde cada employee. Verificar aislamiento, estados, minutos y observaciones.
14. Entrar con warehouse existente: recepción sigue funcionando y no accede a Administración de asistencia.
15. Al terminar, **desactivar** las fichas de prueba desde Personal con motivo; no borrar registros ni datos de mercadería.

## Archivos de esta fase

Nuevos:

- `supabase/migrations/20261009001046_attendance_module.sql`
- `src/features/attendance/types.ts`, `domain.ts`, `server.ts`, `actions.ts`, `parser.ts`, `reports.ts`, `limits.ts`
- `src/features/attendance/components/{admin-page,admin-panel,attendance-list,check-in,mutation-form,personal,refresh-clock,schedule-import,summary}.tsx`
- `src/app/asistencia/{layout,page}.tsx`
- `src/app/admin/asistencia/{layout,page}.tsx` y `[section]/page.tsx`
- `src/app/api/asistencia/{check-in,import,photo,report}/route.ts`
- `src/app/auth/invitacion/page.tsx`
- `tests/attendance.test.ts`
- `docs/control-de-asistencia.md`

Modificados para integrar:

- `src/app/page.tsx`
- `src/app/recepcion/layout.tsx` (excluir employee, conservar admin/warehouse)
- `src/components/layout/app-header.tsx`
- `src/features/auth/actions.ts`
- `src/features/auth/components/login-form.tsx`
- `src/middleware.ts`
- `src/types/index.ts`, `src/types/database.ts`
- `package.json` (agregar pruebas de asistencia a `npm test`)
- `.env.example`, `README.md`

Sin dependencias nuevas. Se reutilizan Supabase SSR/js, XLSX, jsPDF/AutoTable, Radix y PGlite ya instalados. Prettier se usó como herramienta temporal; no se agregó al package ni lockfile.

## Verificación

Las pruebas de asistencia usan PostgreSQL PGlite efímero, roles/RLS reales y un esquema Storage local equivalente para verificar políticas. No utilizan credenciales ni conectan a Supabase remoto. No se enviaron invitaciones reales; el recorrido real de Auth requiere la configuración del servidor y Redirect URLs, y debe probarse manualmente con los dos empleados. Copiar/WhatsApp no requieren SMTP.

Los casos cubren aislamiento, puntualidad, tardanza, descanso, doble marcación, fechas independientes, Excel/fechas/horas/descanso, tildes, nombres ambiguos, escrituras prohibidas, warehouse, fotos privadas/propiedad, reportes bajo RLS, auditoría, rollback, idempotencia, cambios posteriores a preview, tolerancia exacta, evidencia histórica, recepción compatible, secuencia y roles sin metadata.

Resultados: `npm run lint` aprobado sin errores ni warnings; `npx tsc --noEmit` aprobado; `npm test` **132/132** (53 mercadería + 79 asistencia/invitaciones/migraciones/personal); `npm run build` aprobado. Se conserva el aviso previo de Next.js sobre deprecación de `middleware`.

La prueba incremental aplica primero el módulo original, crea empleados vinculados y sin cuenta, horarios día/noche, importación, marcación con evidencia y auditoría, y solo entonces aplica el SQL nuevo. Compara datos completos antes/después (incluyendo Auth, secuencia y Storage), policies, permisos y propiedades/OIDs de funciones. También verifica estados derivados de Auth y denegación de comandos a employee/warehouse/anon. Las pruebas de generateLink y correo usan adaptadores de Auth simulados; no se ejecutó GoTrue local, no se generó una invitación real ni se envió correo remoto.
