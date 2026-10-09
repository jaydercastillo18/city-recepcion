# Recuperación de contraseña — City Ofertas

## Archivos de esta fase

Creados:

- src/app/auth/recuperar/page.tsx
- src/app/auth/restablecer/page.tsx
- src/features/auth/recovery.ts
- src/features/auth/recovery-server.ts
- src/features/auth/recovery-actions.ts
- src/features/auth/recovery-client.ts
- src/features/auth/recovery-session.ts
- src/features/auth/components/forgot-password-form.tsx
- src/features/auth/components/reset-password-form.tsx
- src/features/attendance/components/recovery-controls.tsx
- tests/password-recovery.test.ts
- docs/password-recovery.md

Modificados:

- src/features/auth/components/login-form.tsx
- src/features/attendance/components/access-dialog.tsx
- tests/attendance-personnel.test.ts
- package.json

## Administración

Personal → Gestionar acceso → Cuenta activada permite generar un enlace recovery,
copiarlo, abrir WhatsApp con el teléfono y mensaje preparados, o solicitar un correo.
Se valida la sesión admin, empleado activo/no archivado, profile_id, coincidencia de
correo/cuenta y activación real mediante el RPC de consulta Auth existente.
Nunca se invita nuevamente ni se modifica el estado de acceso de una cuenta activada.

El servidor genera `auth.admin.generateLink({ type: "recovery", email,
options: { redirectTo: origin + "/auth/restablecer" } })` con la clave service role.
Solo devuelve user id y action_link a la sesión admin solicitante. El enlace permanece
en memoria del modal hasta cerrarlo. No se persiste en tablas, auditoría ni reportes.

El correo usa `resetPasswordForEmail`, con cliente sin persistencia y flujo implicit,
para que el empleado pueda abrirlo en su propio dispositivo sin un verificador PKCE
almacenado en el navegador del administrador. Un envío exitoso puede reemplazar los
enlaces previos; la UI los retira. Si el proveedor devuelve rate limit/error, conserva
el enlace temporal existente y ofrece copiar/WhatsApp; nunca genera uno adicional.

La auditoría previa registra `employee_password_recovery_requested`, employee_id,
performed_by, created_at por DEFAULT y motivo fijo, en la tabla existente.
La inserción usa service role exclusivamente en servidor después de validar admin:
los clientes authenticated conservan sus permisos SELECT y RLS sin cambios.
Si no se puede registrar la solicitud, no se genera/envía recuperación.

## Empleado

Login → ¿Olvidaste tu contraseña? → /auth/recuperar envía el correo con Supabase
Password Recovery y redirect al mismo origen del navegador, /auth/restablecer.
La respuesta es idéntica para correo existente, inexistente, límites o fallos.
Este flujo conserva el verificador PKCE mediante el adaptador SSR oficial: abrir un
correo PKCE en otro navegador sin ese verificador requiere solicitar otro enlace.

/auth/restablecer valida hash access_token + refresh_token, code PKCE o una sesión
válida mediante getUser. No usa roles de user_metadata. Limpia los parámetros de la
URL antes de inicializar el cliente y no acepta errores de enlace aunque hubiera una
sesión anterior. Los errores técnicos se sustituyen por mensajes en español.
Una nueva contraseña requiere 8 caracteres y confirmación; updateUser se ejecuta
solo en el cliente autenticado del empleado. Después muestra éxito y redirige a
/asistencia para perfiles employee; otros perfiles van a /.

Los tokens de sesión se gestionan únicamente por Supabase Auth/SSR como parte de
la sesión normal. No se almacenan en PostgreSQL, audit log, analytics o logs de la app.
Las rutas de recuperación incluyen referrer=no-referrer y robots=noindex.

## Configuración pendiente de Supabase

No se ejecutaron cambios remotos, ni se creó/alteró una migración para este flujo.
Agregar en Authentication → URL Configuration → Redirect URLs:

- https://city-recepcion.vercel.app/auth/restablecer
- http://localhost:3000/auth/restablecer

Mantener las rutas existentes /auth/invitacion. Para otros dominios de pruebas,
añadir también su origen autorizado con /auth/restablecer.
APP_URL (o NEXT_PUBLIC_SITE_URL) determina el origen de las solicitudes de admin.
SMTP y límites de envío continúan dependiendo de la configuración de Supabase.

## Verificación

tests/password-recovery.test.ts prueba permisos y elegibilidad, recovery sin invite,
redirección, estados estables, WhatsApp, rate limits y conservación de enlaces,
auditoría sin secretos, hash/PKCE/sesiones, enlaces vencidos, contraseña y respuesta
de login sin enumeración. Las llamadas a Auth y SMTP son dobles locales, sin enviar
correos reales ni modificar cuentas de producción.
