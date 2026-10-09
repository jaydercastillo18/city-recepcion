# Recepción de almacén · City Ofertas

## Uso desde celular
1. Abrir un envío y tocar **Escanear caja**. La cámara requiere HTTPS (localhost funciona para desarrollo; una IP local por HTTP no).
2. Autorizar cámara y apuntar al código que trae la caja. Se comparan de forma exacta code_original y code_normalized, normalizando mayúsculas y separadores, sin eliminar ceros iniciales.
3. Verificar código/nombre y tocar **+1 caja**. Puede activar **Auto registrar +1 por lectura de barras**. Cada lectura se pausa; tocar **Escanear siguiente caja** antes de la siguiente unidad evita duplicados por fotogramas.
4. Si hay códigos repetidos, elegir el producto. Los excesos requieren confirmación.
5. Para etiquetas de texto, tocar **Leer texto de etiqueta** y confirmar el producto reconocido con **+1 caja**. OCR se carga bajo demanda; la primera lectura necesita Internet para descargar el motor y el modelo. La foto se procesa en el navegador.
6. Si la cámara falla o no reconoce, ingresar el código en el campo manual. Si no coincide: **Código no encontrado en este envío**.

## Faltantes y observaciones
- **Solo faltantes** muestra productos con esperadas - recibidas > 0, incluyendo pendientes y parciales. Se combina con búsqueda. Cambia a **Todos** para regresar.
- **Agregar observación** permite texto libre de hasta 2000 caracteres. Al guardar, aparece en la tarjeta. Cada guardado agrega una observación y conserva las anteriores.
- Se reutiliza incidents con tipo other: no se modificaron esquema, RLS, autenticación ni RPC de recepción. Las incidencias históricas siguen visibles y exportables.
- El resumen se actualiza tras registrar cajas. Los excesos no compensan faltantes de otro producto.

## Reportes
PDF horizontal con logo oficial, cabecera, resumen, detalle, faltantes y observaciones/incidencias. Cada producto incluye proveedor, código, nombre, esperadas, recibidas, diferencia (recibidas - esperadas), estado y observaciones. Identifica al responsable de emisión por la sesión activa y muestra fecha/hora de Lima.

Excel conserva códigos como texto y contiene **Resumen**, **Detalle**, **Faltantes**, **Observaciones-Incidencias**. Excel no permite / en nombres de hojas; por eso se usa guion. Las observaciones aparecen tanto en Detalle/Faltantes como en la hoja dedicada, con producto, fecha y estado. Las incidencias generales del envío se mantienen en la sección dedicada.

## Identidad
Logo oficial suministrado en CYTYOFERTAS.svg: copia original en public/city-ofertas.svg, versión recortada PNG en public/city-ofertas.png y copia compacta embebida para PDF. Cabecera/login utilizan el logo oficial. Morado, fucsia, blanco; hero ligero de camión y recepción; controles táctiles y respeto de movimiento reducido.

## Dependencias nuevas
- @zxing/browser 0.2.1: lectura de códigos de barras y códigos bidimensionales existentes.
- tesseract.js 7.0.0: reconocimiento de texto por captura de cámara.
Las dos se cargan bajo demanda al usar el escáner/OCR. Se actualizó package-lock.json.

## Validación
- npm run lint: sin errores.
- npx tsc --noEmit: sin errores.
- npm run build: compilación exitosa. Aviso existente: middleware está deprecado en favor de proxy.
- Pruebas locales: códigos exactos/normalizados, ceros iniciales, rechazo de coincidencias parciales, códigos repetidos, faltantes sin compensar excesos, cuatro hojas Excel, incidencias históricas/generales, reporte vacío y PDF multipágina.
- Consultas de lectura Supabase sin sesión: shipment_items e incidents no exponen datos.
- Endpoints PDF/Excel sin sesión: HTTP 401.
- Login verificado a 390 px: sin desbordamiento horizontal.
- Pendiente de prueba física: cámara de celular y recepción/guardado con usuario autenticado. No se modificaron cajas ni observaciones reales durante la verificación.

## Archivos modificados o añadidos
- package-lock.json
- package.json
- src/app/globals.css
- src/app/login/page.tsx
- src/app/recepcion/[shipmentId]/page.tsx
- src/app/recepcion/page.tsx
- src/components/layout/app-header.tsx
- src/features/auth/components/login-form.tsx
- src/features/reception/actions.ts
- src/features/reception/components/item-card.tsx
- src/features/reception/components/shipment-header.tsx
- src/features/reception/components/shipment-reception-client.tsx
- src/features/shipments/actions.ts
- src/lib/reports/excel-generator.ts
- src/lib/reports/fetch-report-data.ts
- src/lib/reports/pdf-generator.ts
- src/types/index.ts
- public/city-ofertas.png
- public/city-ofertas.svg
- src/components/layout/city-brand.tsx
- src/components/layout/warehouse-hero.tsx
- src/features/reception/components/camera-scanner.tsx
- src/lib/reception.ts
- src/lib/reports/city-logo.ts
- src/lib/reports/report-rows.ts
- docs/recepcion-almacen.md
- README.md
