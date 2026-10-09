# Rediseño de asistencia · City Ofertas

## Alcance

Diseño negro/morado, acentos fucsia/violeta, logo y camión SVG existentes. El adjunto recibido contiene la descripción visual; no incluye una imagen de referencia. Se usa la identidad existente y esa descripción. Las ilustraciones son decorativas, sin interacción ni contenido accesible, y se respeta reduced-motion.

Las siete pantallas administrativas comparten AttendanceShell, AttendanceHero, AttendanceTabs y estilos limitados al módulo. El portal employee también recibe las tarjetas, listas y métricas nuevas. El header compartido muestra iniciales, correo, rol y dropdown Radix con navegación por teclado; se conservan rutas y permisos de recepción.

## Pantallas

- Personal: KPIs calculados, buscador por nombre/correo/código/teléfono, filtros combinados de estado y cargo, tabla desktop, tabla reducida tablet y cards mobile. Drawer compartido para alta y edición, código bloqueado, presets de tolerancia, estado inicial y acceso opcional al guardar. Archivados visibles solo mediante filtros administrativos; el listado inicial muestra activos.
- Hoy: seis KPIs del turno día, tabla/cards con horario, llegada, tolerancia y estado; evidencia y corrección mantienen los endpoints existentes. Cierre mantiene motivo/confirmación y exclusión de noche.
- Horarios: filtros de fecha, nombre, turno y estado; noche siempre informativo, sin corrección de asistencia.
- Excel: wizard de cinco pasos y badges NUEVO/SIN CAMBIOS/ACTUALIZAR/DESCANSO/ERROR. El parser, selección de fecha, conflictos, idempotencia y transacción permanecen iguales. La vista previa se adapta a tarjetas móviles.
- Historial: período y filtros, tolerancia aplicada, minutos tarde, observación, evidencia privada y auditoría. Tabla reducida en tablet y cards completas en móvil.
- Reportes: diario, mensual/período y por empleado, resumen antes de PDF/Excel. La lectura diaria se carga aparte si el período seleccionado no incluye hoy. Se conservan los generadores y autorización existentes.
- Configuración: cards de hora límite, sugerencia inicial de 5 minutos, suspensión manual y zona horaria. Edición del límite con motivo. No cambia tolerancias existentes.

## Ciclo de vida y acceso

La migración nueva es `20261009211607_attendance_personnel_lifecycle.sql`. Depende del módulo original y la migración de enlaces ya aplicados. Se inspeccionó el remoto en modo lectura: 4 empleados y columna invitation_email_status presente. No se ejecutó SQL de cambios remoto.

Agrega únicamente suspended_at y archived_at, ambas nullable sin actualización masiva. No duplica responsable/motivo: se conservan en attendance_audit_log. CHECK impide active=true para archivados. Un trigger impide reactivar archivados a través de la RPC anterior. Los estados inactivos históricos permanecen intactos.

Una RPC nueva attendance_employee_command, con wrapper INVOKER e implementación privada DEFINER, exige administrador, sesión, motivo y bloqueo compartido con el comando anterior. Suspender pone active=false; reactivar pone active=true y limpia suspended_at; archivar exige código exacto y pone active=false/archived_at. Se archiva incluso personal sin historial: no existe borrado físico. No se elimina Auth, Storage, relaciones, asistencias ni horarios.

Login del sistema, middleware, lectura de sesión y APIs vuelven a consultar active, por lo que un token previo tampoco concede entrada al módulo ni a sus endpoints. La RPC de marcación ya rechaza empleados inactivos. Esto bloquea el acceso a CITY OFERTAS; no elimina ni cambia contraseñas de Supabase Auth ni configura un ban global de Auth. Reactivar permite volver a entrar con la cuenta existente.

Se registran employee_created, employee_updated, employee_suspended, employee_reactivated, employee_archived y employee_access_generated. La generación de acceso sigue usando el servidor y service role; la auditoría nueva lleva solo id y motivo fijo, nunca el enlace ni tokens. Correo, WhatsApp y regeneración mantienen el flujo anterior. No se añadió recuperación de contraseña para cuentas activadas; es opcional y no se muestra un botón sin flujo implementado.

## Verificación y capturas

Pruebas PostgreSQL en memoria aplican original + access_links, crean datos históricos y después aplican lifecycle. Verifican conservación, confirmación exacta, suspensión/reversión, permisos, archivado y privacidad. Se mantienen todas las pruebas anteriores. Auth/SMTP reales no se ejecutan.

La revisión de navegador usa datos ficticios desde una ruta local temporal que se elimina antes del build. No expone una ruta de demo en producción ni escribe en Supabase. Se verifican 1440, 1024, 768 y 390 px, búsqueda por correo, estados, drawer móvil y modales de confirmación. Capturas en `docs/screenshots/attendance/`.

Aplicar la migración nueva requiere una ejecución manual posterior: esta entrega no la aplica y no despliega automáticamente. Los botones de ciclo de vida requieren esa migración. Las guardas de acceso usan active para conservar compatibilidad con el esquema remoto actual antes de aplicarla.

Resultados finales: lint sin errores ni warnings; TypeScript aprobado; npm test 132/132 (53 mercadería + 79 asistencia, accesos y personal); build aprobado. Solo permanece el aviso preexistente de Next.js sobre middleware. El build no contiene la ruta temporal visual-asistencia. Se verificó que las migraciones anteriores no tienen diferencias.
