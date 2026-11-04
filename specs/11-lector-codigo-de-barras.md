# SPEC 11 — Lector de códigos de barras con la cámara

> **Estado:** Borrador
> **Depende de:** [SPEC 10](10-productos-con-codigo-de-barras.md)
> **Fecha:** 2026-10-31
> **Objetivo:** Leer el código de barras de un producto con la cámara del celular desde la web, para encontrarlo entre los propios, cargarle un precio o darlo de alta con los datos del catálogo SEPA.

## Por qué existe esta spec

Escribir 13 dígitos en el súper no es práctico. Con la cámara, la app reconoce el producto en un segundo y la
vinculación con el SEPA pasa a ser automática. Hoy se puede hacer desde la web, sin esperar a la app nativa de
la Fase 3.

## Alcance

**Incluye:**

- Componente `BarcodeScanner` (modal a pantalla completa con la vista de la cámara).
- API nativa `BarcodeDetector` cuando existe (Chrome en Android); en el resto (Safari en iPhone, Firefox,
  Chrome de escritorio en Windows) se carga el ponyfill `barcode-detector` (ZXing en WebAssembly).
- Botón 📷 en **Buscar**, en **Cargar precio** (elegir producto) y en **Agregar producto** (campo EAN).
- Ingreso manual del código como alternativa dentro del mismo modal.

**Fuera de alcance:**

- Linterna, zoom o elección de cámara.
- Códigos QR u otros formatos que no sean de producto.
- Leer precios o tickets con la cámara (OCR).
- Funcionar offline (sigue sin service worker).

## Componente — `src/components/BarcodeScanner.tsx`

```typescript
interface BarcodeScannerProps {
  open: boolean;
  onDetected: (gtin13: string) => void;   // ya validado y normalizado con toGtin13
  onClose: () => void;
}
```

Lógica sin React en `src/lib/barcode.ts`:

```typescript
export const PRODUCT_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;
/** Detector nativo si soporta los formatos; si no, el ponyfill (import dinámico) */
export function createDetector(): Promise<BarcodeDetectorLike>;
/** Acepta un código recién cuando se leyó igual 2 veces seguidas (pura, con tests) */
export function createConfirmer(): (raw: string) => string | null;
```

## Reglas

- **Cámara:** `getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })`. El `<video>`
  lleva `playsInline` y `muted` (sin eso Safari en iPhone abre el video en pantalla completa).
- **Lectura:** se analiza un cuadro cada ~150 ms con `requestAnimationFrame`, nunca dos análisis a la vez.
- **Validación:** el código se normaliza con `toGtin13` y tiene que pasar `isValidGtin`; se acepta recién con
  **2 lecturas iguales seguidas** (descarta lecturas parciales). Al aceptarlo: vibración corta
  (`navigator.vibrate?.(80)`), se cierra la cámara y se llama a `onDetected`.
- **Liberar la cámara:** al cerrar el modal, al detectar y al desmontar se detienen todas las pistas
  (`track.stop()`). Con Cache Components la página se oculta con `<Activity>` en lugar de desmontarse: React
  ejecuta igual la limpieza de los efectos al ocultarla, así que la cámara se apaga si se cambia de página con
  el modal abierto.
- **WebAssembly propio:** el `.wasm` de ZXing se copia a `public/` y se configura con `prepareZXingModule`
  (por defecto el paquete lo baja de un CDN de terceros). Se carga solo la primera vez que se abre el lector
  sin API nativa.
- **Errores** (siempre con el ingreso manual disponible):
  - Permiso denegado → "Sin permiso para usar la cámara. Podés habilitarlo en la configuración del navegador o
    escribir el código."
  - Sin cámara o sin `getUserMedia` (o sin HTTPS) → "Este dispositivo no tiene cámara disponible."
  - Falla la carga del lector → "No se pudo iniciar el lector."

## Qué pasa al leer un código

| Dónde | Producto propio con ese EAN | No propio, sí en catálogo SEPA | No está en ningún lado |
|---|---|---|---|
| **Buscar** (`/`) | Navega a su detalle | Ofrece "Agregar <descripción>" → Agregar producto con los datos completos | Ofrece "Agregar producto" con el EAN completo |
| **Cargar precio** | Lo selecciona en el formulario | Ofrece agregarlo primero | Ofrece agregarlo primero |
| **Agregar producto** | "Ya tenés este producto" con link | Completa el formulario (igual que elegirlo en el buscador) | Completa solo el EAN |

Para pasar de Buscar o Cargar precio a Agregar producto se navega a `/upload?tab=producto&ean=<gtin13>`. Esa
ruta (con `UploadForm.tsx` dentro de un `<Suspense>`) ya existe desde la spec 10, que la usa para la sección "En
Precios Claros" de Buscar: esta spec solo la reutiliza.

## UI/UX

- Modal negro a pantalla completa: video, recuadro guía horizontal al centro, texto "Apuntá al código de barras",
  botón "✕" (`aria-label="Cerrar lector"`) y link "Escribir el código".
- Botón 📷 con `aria-label="Leer código de barras"` al lado del buscador de `/`, del `select` de producto en
  Cargar precio y del campo EAN en Agregar producto.
- El botón 📷 se muestra solo si existe `navigator.mediaDevices?.getUserMedia`.

## Plan de implementación

1. **Lógica pura + tests** (`src/lib/barcode.ts`): `createConfirmer`. Verificar: tests (1 lectura → `null`; 2 iguales → código; 2 distintas → `null`).
2. **Detector.** `npm i barcode-detector`; `createDetector` con import dinámico del ponyfill; copiar el `.wasm` a
   `public/` (script `postinstall` o paso documentado) y `prepareZXingModule`. Verificar: en Chrome de
   escritorio (sin API nativa en Windows) se carga el ponyfill desde el propio origen (pestaña Network).
3. **Componente** `BarcodeScanner` con cámara, bucle de lectura, errores e ingreso manual. Verificar: en
   `localhost` con la webcam y un código impreso.
4. **Integración** en Buscar, Cargar precio y Agregar producto según la tabla.
5. **Prueba en celulares** con la URL de preview de Vercel (HTTPS): Android con Chrome y iPhone con Safari.
6. **Documentación.** `CLAUDE.md` (componente, `lib/barcode.ts`, Funcionalidades, nota de HTTPS y permisos).

## Criterios de aceptación

- [ ] `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.
- [ ] En Android (Chrome) se lee un EAN-13 real en menos de 2 s y usa la API nativa (no se descarga el `.wasm`).
- [ ] En iPhone (Safari) se lee el mismo código con el ponyfill; el video no se abre en pantalla completa.
- [ ] En Buscar, leer un producto propio abre su detalle; uno del catálogo ofrece agregarlo con los datos completos.
- [ ] En Cargar precio, leer un producto propio lo deja seleccionado.
- [ ] Al cerrar el modal, al detectar o al cambiar de página, el indicador de cámara del sistema se apaga.
- [ ] Con el permiso denegado se ve el mensaje y se puede escribir el código.
- [ ] Un código mal leído (dígito verificador inválido) nunca se acepta.
- [ ] El `.wasm` se sirve desde el propio dominio, nunca desde un CDN de terceros.
- [ ] En 375 px el modal y los botones 📷 no generan scroll horizontal.

## Decisiones

- **Sí:** web en lugar de esperar a React Native. La cámara desde el navegador ya alcanza para leer EAN y la PWA es instalable.
- **Sí:** API nativa con ponyfill. En Android no se descarga nada extra; Safari todavía no habilita `BarcodeDetector` por defecto.
- **Sí:** `barcode-detector` (ZXing-C++ en WebAssembly) en lugar de librerías en JavaScript puro. Es más rápido en celulares modestos y tiene la misma interfaz que la API nativa.
- **Sí:** dos lecturas iguales. Elimina casi todas las lecturas parciales con un costo imperceptible.
- **Sí:** servir el `.wasm` desde el propio dominio. No depende de un CDN externo ni filtra el uso a terceros.
- **Sí:** solo formatos de producto (EAN-13, EAN-8, UPC-A, UPC-E). Menos falsos positivos y detección más rápida.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Safari habilita `BarcodeDetector` sin soportar los formatos | `createDetector` consulta `getSupportedFormats()` y cae al ponyfill si faltan |
| Cámaras con poco foco o poca luz | Recuadro guía y opción de escribir el código siempre visible |
| El `.wasm` (~1 MB) tarda en redes lentas | Se carga solo sin API nativa y solo al abrir el lector; "Preparando el lector…" mientras tanto |
| Cámara que queda encendida | Limpieza en cierre, detección, desmontaje y ocultamiento por `<Activity>`; criterio de aceptación específico |

## Lo que **no** incluye esta spec

- Linterna, zoom o elección de cámara.
- Códigos QR.
- OCR de precios o tickets.
- Modo offline.
