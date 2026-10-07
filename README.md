# 📦 CITY RECEPCIÓN — Sistema Profesional de Control y Recepción de Almacén

> **FASE 1: Arquitectura Base, Búsqueda Instantánea y Control de Recepción**  
> Diseñado para reemplazar las hojas impresas de almacén por una interfaz móvil y de escritorio de alta velocidad y máxima fiabilidad.

---

## 🚀 1. Resumen Ejecutivo y Caso de Uso

En un flujo real de almacén, una remesa (por ejemplo hacia **Chimbote**) puede incluir cientos de productos de distintos proveedores (`GRUPO FEY`, `MUEBLES CENTRAL`, etc.) con códigos como `KD-5238` o `EST-201` y cientos de cajas físicas.

**City Recepción** resuelve los cuellos de botella de la hoja de papel:
- ⚡ **Búsqueda Instantánea:** Búsqueda en milisegundos por código (tolerante a guiones y espacios, ej. `KD5238` encuentra `KD-5238`), nombre de producto (sin importar acentos ni mayúsculas) y proveedor.
- 📱 **Diseño Móvil para Almacén:** Botones grandes touch-friendly (56px) para sumar `+1`, restar `-1`, o completar en un solo toque `Recibir Todo`.
- ✏️ **Recepción Masiva / Manual:** Posibilidad de registrar cantidades grandes de golpe (ej. 20 cajas directas) sin pulsar 20 veces.
- ⚠️ **Control de Incidencias y Excesos:** Advertencia visual y confirmación cuando se excede la cantidad esperada, más registro de incidencias (cajas dañadas, código ilegible, faltantes).
- 🔒 **Transaccionalidad en PostgreSQL (RPC):** Bloqueo a nivel de fila (`SELECT ... FOR UPDATE`) para evitar condiciones de carrera, auditoría automática de cada acción en `reception_events` y recálculo automático de totales de envío.

---

## 🛠️ 2. Stack Tecnológico

| Capa | Tecnología |
| :--- | :--- |
| **Framework Web** | [Next.js](https://nextjs.org/) 16 con App Router y Turbopack |
| **Biblioteca UI** | [React](https://react.dev/) 19 & Tailwind CSS v4 |
| **Tipado** | TypeScript estricto (`strict: true`) |
| **Base de Datos** | [Supabase](https://supabase.com/) & PostgreSQL |
| **Autenticación** | Supabase Auth con Middleware de sesión y roles (`admin`, `warehouse`) |
| **Seguridad de Datos** | Row Level Security (RLS) en todas las tablas |
| **Íconos** | Lucide React |
| **Despliegue** | Optimizado para [Vercel](https://vercel.com/) |

---

## 📁 3. Estructura del Proyecto

```text
city-recepcion/
├── supabase/
│   ├── migrations/
│   │   ├── 20261006000001_initial_schema.sql    # Tablas (shipments, items, events, profiles)
│   │   ├── 20261006000002_rls_policies.sql      # Políticas RLS sincronizadas
│   │   └── 20261006000003_functions_rpc.sql     # Procedimientos RPC atómicos, seguridad y triggers
│   └── seed.sql                                 # Datos DEMO aislados (solo desarrollo local opcional)
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx               # Login seguro con feedback visual
│   │   ├── admin/                              # Panel de administración (envíos y métricas)
│   │   ├── recepcion/                          # Vista del operario de almacén
│   │   │   ├── [shipmentId]/page.tsx           # Pantalla de recepción del envío
│   │   │   └── [shipmentId]/rapida/page.tsx    # Modo recepción rápida (placeholder Fase 2)
│   │   ├── globals.css                         # Sistema de diseño de almacén (Tailwind v4)
│   │   └── layout.tsx                          # Layout raíz con Toaster y tipografía
│   ├── components/
│   │   ├── layout/app-header.tsx               # Barra superior con datos de sesión
│   │   └── ui/                                 # Toast, badges y componentes accesibles
│   ├── features/
│   │   ├── auth/                               # Server Actions y formulario de autenticación
│   │   ├── reception/                          # ItemCard, ShipmentHeader, Búsqueda, RPC Actions
│   │   └── shipments/                          # Server Actions de listado y creación
│   ├── lib/
│   │   ├── search/                             # Normalización de texto y motor de búsqueda
│   │   ├── supabase/                           # Clientes Server / Browser de Supabase
│   │   └── utils.ts                            # Formateadores, progreso y helpers
│   ├── middleware.ts                           # Protección de rutas por cookie de sesión
│   └── types/                                  # Definiciones estrictas de TypeScript
```

---

## ⚙️ 4. Guía de Instalación y Configuración Paso a Paso

### Paso 1: Clonar y preparar dependencias
```bash
cd city-recepcion
npm install
```

### Paso 2: Crear proyecto en Supabase
1. Ingresa a [database.new](https://database.new) e inicia un nuevo proyecto en Supabase.
2. Ve a **Project Settings** > **API** y copia:
   - **Project URL**
   - **anon / public key**
   - **service_role key** (mantén esta clave en secreto)

### Paso 3: Ejecutar migraciones SQL en Supabase
Ve al **SQL Editor** de tu proyecto en Supabase y ejecuta en orden los siguientes scripts que se encuentran en `supabase/migrations/`:

1. `20261006000001_initial_schema.sql`: Crea las tablas con índices trigram para búsqueda ultra veloz.
2. `20261006000002_rls_policies.sql`: Habilita RLS con permisos sincronizados para operarios y administradores.
3. `20261006000003_functions_rpc.sql`: Instala `register_box_reception`, triggers automáticos, roles seguros y auditoría.

*(Opcional: Si deseas cargar 2 productos de prueba para desarrollo local, ejecuta `supabase/seed.sql`)*.

### Paso 4: Configurar variables de entorno
Crea tu archivo `.env.local` en la raíz copiando de `.env.example`:

```bash
cp .env.example .env.local
```

Rellena los valores reales de Supabase:
```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-aqui
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key-aqui
```

### Paso 5: Crear usuarios en Supabase Auth
En el panel de **Supabase Dashboard** > **Authentication** > **Users**:
1. Crea un usuario operario de almacén (ej: `almacen@city.com` / contraseña segura).
2. Crea un usuario administrador (ej: `admin@city.com` / contraseña segura).
3. Para otorgar el rol `admin` al administrador, ejecuta en el SQL Editor:
   ```sql
   UPDATE public.profiles
   SET role = 'admin'
   WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@city.com');
   ```
*(Por defecto, cualquier usuario creado recibe el rol `warehouse`)*.

---

## 🏃 5. Ejecución Local y Compilación

### Modo desarrollo:
```bash
npm run dev
```
Abre en tu navegador [http://localhost:3000](http://localhost:3000). Serás redirigido automáticamente al login o a la vista de recepción.

### Verificación de TypeScript y Linting:
```bash
npx tsc --noEmit
npm run lint
```

### Compilación para Producción:
```bash
npm run build
```

---

## 📱 6. Características Implementadas en FASE 1

### 🔍 Buscador Inteligente de Almacén
- **Búsqueda por Código:** Tolerante a separadores (`KD-5238`, `KD5238`, `kd5238` devuelven el mismo ítem).
- **Búsqueda por Producto:** Normalización fonética y de acentos (`silla` encuentra `SILLA GAMER`).
- **Búsqueda por Proveedor:** Escribir `FEY` filtra al instante los productos provistos por `GRUPO FEY`.
- **Filtros por Estado:** Pestañas con contadores en tiempo real para `Todos`, `Pendientes`, `Parciales`, `Completos` y `Excesos`.

### 📦 Tarjetas de Producto con Acciones Táctiles
- **`+1 Caja` / `-1 Caja`:** Botones de 56px optimizados para uso con una sola mano en smartphone.
- **`⚡ Recibir Todo`:** Si se esperan 10 cajas y faltan 6, un solo toque registra el lote completo.
- **`✏️ Manual`:** Abre un campo numérico directo para recepciones de pallets o lotes grandes (ej. 20 cajas).
- **`⚠️ Reportar Incidencia`:** Permite registrar notas de inspección (`Caja rota`, `Código ilegible`, etc.) que quedan asociadas al historial de recepción en la base de datos.
- **Validación de Exceso:** Si se intenta ingresar más de lo esperado en la remesa, solicita confirmación del usuario y aplica el badge púrpura `🚨 EXCESO`.

### 🛡️ Arquitectura Segura y Auditada
- **Eventos de Recepción (`reception_events`):** Cada incremento, corrección o anotación registra usuario, fecha/hora exacta, cantidad anterior y cantidad nueva.
- **Recálculo en BD:** El total recibido del envío se actualiza atómicamente en PostgreSQL, garantizando integridad sin depender de cálculos en el navegador.

---

## 🚢 7. Despliegue en Vercel

1. Sube el repositorio a GitHub o GitLab.
2. Importa el proyecto en [Vercel](https://vercel.com/new).
3. Configura las variables de entorno en **Project Settings** > **Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Presiona **Deploy**. El proyecto está configurado para compilar con Next.js 16 y optimización de componentes.

---

## 🗺️ 8. Roadmap: FASE 2 y Siguientes
- [ ] Escaneo con cámara del teléfono (código de barras / QR) con feedback sonoro tipo *beep* de terminal Honeywell / Zebra.
- [ ] Importador masivo de archivos Excel/CSV para creación automática de envíos e ítems.
- [ ] Módulo de fotos de incidencias almacenadas en Supabase Storage.
- [ ] Modo offline con sincronización en segundo plano (PWA).
