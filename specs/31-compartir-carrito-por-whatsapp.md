# SPEC 31 — Compartir el carrito por WhatsApp

> **Estado:** Implementada
> **Depende de:** [SPEC 02](02-boton-repetir-historial.md), [SPEC 10](10-productos-con-codigo-de-barras.md), [SPEC 12](12-precio-de-referencia-sepa.md), [SPEC 14](14-carrito-por-comercio.md), [SPEC 15](15-precios-y-comercios-cercanos.md), [SPEC 18](18-agregar-al-carrito-sin-alta.md), [SPEC 30](30-compartir-por-whatsapp.md)
> **Fecha:** 2026-11-24
> **Objetivo:** Enviar por WhatsApp el carrito, un comercio del carrito o una compra del historial como una lista legible con un link que muestra esos productos en la app y los carga en el carrito de quien lo recibe.

## Por qué existe esta spec

Para pedirle a alguien que haga la compra hay que escribir la lista a mano. Con esta spec, quien no usa la app lee la
lista en el chat, y quien la usa toca el link y tiene el carrito armado, con sus comercios y precios.

Es una **copia del momento**: no se actualiza si alguien cambia su carrito. La lista compartida en tiempo real es otro
feature ([03](../docs/features/03-lista-compartida.md)).

## Alcance

**Incluye:**

- **Compartir por WhatsApp** en el carrito entero, en cada comercio del carrito y en cada compra expandida del
  historial.
- Mensaje con la lista agrupada por comercio, cantidades, precios y total, y el link al final.
- Link con los datos **dentro de la dirección**, después del `#`: sin base, sin cuenta y sin vencimiento.
- Página nueva **`/cart/compartido`**: vista previa y **Cargar en mi carrito** (combinar o reemplazar).
- **Cargar un carrito compartido**, al pie del Carrito: pegar el mensaje o el link.
- Texto nuevo en `/privacidad`.

**Fuera de alcance:**

- Lista compartida en tiempo real, o avisar a quien compartió que se compró.
- Link corto guardado en la base.
- Otras apps, "Copiar lista" o el menú de compartir del sistema.
- Elegir qué productos compartir o cargar.
- Compartir fotos propias, categoría, marca y presentación de los productos, historial de precios o medio de pago.
- Compartir productos o precios sueltos.
- Vista previa propia del link en WhatsApp: usa la general de la spec 30.
- Medir cuántos links se abren.

## Reglas

### Qué se comparte

- **Carrito entero:** todos los ítems. **Comercio:** los ítems de ese grupo, también de "Sin comercio".
  **Compra:** sus ítems, con la fecha de la compra. El comercio de cada ítem es `item.store` o, si no tiene, el de la
  compra (`purchaseStoreRef`, que pasa a exportarse).
- Por ítem viajan: producto, cantidad, precio y comercio. Un ítem en $0 viaja sin precio.
- **Nombre del producto:** un producto con EAN que tiene precio de referencia (está en el catálogo) viaja solo con el
  EAN. Los demás (sin EAN, sin referencia, todavía cargando o sin conexión) llevan también el nombre (`productName`).
- **Comercio de Precios Claros** (`sepaId`): viajan nombre y `sepaId`; dirección, barrio, cadena y coordenadas se
  completan del catálogo al abrirlo. **Comercio a mano:** nombre, barrio y dirección, **nunca las coordenadas**.
- Hasta **100 productos** por link. Con más, el botón no está y en su lugar dice "Se pueden compartir hasta 100
  productos". En un carrito de más de 100, cada comercio con hasta 100 se puede compartir igual.

### El mensaje

Carrito entero:

```
🛒 *Mi carrito* (4 productos)

*Coto — Caballito* · $8.150,00
• 2 × Leche entera 1 l · $3.200,00
• 1 × Yerba Playadito 1 kg · $4.950,00

*Sin comercio* · $2.100,00
• 1 × Pan lactal · $2.100,00
• 1 × Jabón · sin precio

*Total: $10.250,00*

Cargalo en El Changuito:
https://elchanguito.vercel.app/cart/compartido#1c.…
```

- El importe de cada renglón es el subtotal (cantidad × precio). Los comercios van en el orden del carrito
  (`groupCartByStore`), "Sin comercio" al final.
- **Un solo comercio:** el título es `🛒 *Mi carrito en Coto — Caballito* (2 productos)`, sin encabezado ni subtotal del
  grupo. Solo "Sin comercio": `🛒 *Mi carrito* (2 productos)`, sin encabezado.
- **Compra:** `🛒 *Compra del 12/11/2026 en Coto — Caballito* (2 productos)` y "Cargala en El Changuito:".
- Con 1 producto, "(1 producto)". Cantidades con `formatNumber` de 0 a 3 decimales ("0,5 ×").
- Los caracteres `*`, `_`, `~` y `` ` `` y los saltos de línea de nombres y comercios se reemplazan por un espacio: son
  formato de WhatsApp.
- El mensaje lista hasta **40 productos**; después, "y N productos más" (o "y 1 producto más"). Los subtotales, el total
  y el link son siempre de todos.
- El link es **siempre el de producción** (`APP_URL`, spec 30).

### Los botones

- Son links (`<a>`) a `whatsappUrl(texto, link)` (spec 30), con `target="_blank"` y `rel="noopener noreferrer"`. El
  mensaje se puede editar antes de enviarlo. No hay estados de carga ni aviso después.
- **Carrito:** "Compartir por WhatsApp" debajo del total, junto a "Ver recorrido".
- **Comercio:** ícono de 44 px en el pie del grupo, junto a "Comprar en…", con
  `aria-label="Compartir <comercio> por WhatsApp"`. No se ve mientras el medio de pago está abierto. Con un solo grupo
  no aparece: alcanza con el del carrito.
- **Historial:** "Compartir por WhatsApp" en el pie de la compra expandida, junto al total.
- Se puede compartir con ítems sin precio.

### El link

- `/cart/compartido#<datos>`. Lo que sigue al `#` no se envía al servidor.
- Los datos empiezan con la versión `1`. Otra versión: "Este link es de una versión más nueva de la app. Recargá la
  página."
- El último registro lleva la cantidad de productos: si falta o no coincide, "El link está incompleto. Pedí que te lo
  manden de nuevo." Sin datos, ilegible o fuera de los límites: "El link no es válido." En los tres casos, un botón
  **Ir al carrito**.
- Todo lo que llega se valida: EAN con `toGtin13`; cantidad mayor a 0 y hasta 9.999; precio de 0 a 100.000.000; textos de
  1 a 200 caracteres; `sepaId` con la forma `n-n-n`; de 1 a 100 productos. Un solo dato inválido invalida el link.

### Vista previa (`/cart/compartido`)

- Título "Carrito compartido" o "Compra del 12/11/2026"; debajo, "N productos · $total".
- Una tarjeta por comercio, con nombre, dirección o barrio y subtotal; por ítem, imagen de 40 px, nombre, "2 ×
  $1.600,00" y subtotal, o "Sin precio". Solo lectura.
- **Nombre que se muestra:** el del producto propio con ese EAN; si no, el sugerido del catálogo; si no, el del link; si
  no, "Producto <EAN>".
- Mientras consulta el catálogo, los productos que viajan solo con EAN y no son propios muestran "Buscando…" y el botón
  dice "Buscando productos…", deshabilitado (`aria-busy`). Si la consulta falla: "No se pudo consultar Precios Claros"
  con **Reintentar**, y el botón queda deshabilitado solo si a algún producto le falta el nombre. Sin Supabase no se
  consulta nada y se puede cargar.
- Si fallan las sucursales o las referencias no hay error: el comercio queda con nombre y `sepaId`, y el precio sigue
  las reglas de abajo sin la referencia.
- En una compra: "Son los precios de esa compra. En tu carrito entran con tu último precio o el de referencia, si hay."
- **Cargar en mi carrito:** con el carrito vacío, carga y va a `/cart`. Con productos, abre un `<dialog>` con
  **Combinar**, **Reemplazar** y **Cancelar**.
- En Safari del iPhone fuera de la app instalada (`navigator.standalone === false`): "¿Tenés la app en la pantalla de
  inicio? Copiá este link y pegalo en Carrito → Cargar un carrito compartido." con **Copiar link** ("Link copiado", 3 s).
- Abrir la vista previa no cambia ningún dato.

### La carga

- **Producto:** con EAN, el propio con ese EAN; si no hay, se crea con `productFromSepa` o, fuera del catálogo, con
  nombre y EAN. Sin EAN, el propio sin EAN con el mismo nombre (sin mayúsculas ni espacios de más); si no hay, se crea
  con el nombre. Los creados no tienen categoría.
- Dos ítems del link que terminan en el mismo producto propio se suman: quedan el comercio y el precio del primero.
- **Precio de un carrito:** el del link; si viajó sin precio, `initialCartPrice` (último propio, referencia o $0).
- **Precio de una compra:** el último propio; si no, la referencia; si no, el del link.
- **Combinar:** si el producto ya está en el carrito, suma la cantidad y conserva su comercio y su precio. **Reemplazar**
  vacía el carrito y carga lo compartido.
- Todo en **un solo `set`** (productos y carrito): un cambio para la persistencia y la sincronización. No registra
  precios.

### Pegar un link

- **Cargar un carrito compartido**, link al pie del Carrito, vacío o no. Abre un `<dialog>` con el campo "Pegá el
  mensaje o el link" y **Ver carrito**.
- Busca `/cart/compartido#…` en cualquier parte del texto, con cualquier dominio, y va a la vista previa. Si no está: "No
  hay un carrito compartido en ese texto".

## Modelo de datos

No cambia ningún dato guardado ni la base.

```typescript
// src/lib/shared-cart.ts (sin React)
export const MAX_SHARED_ITEMS = 100;
export const MAX_MESSAGE_ITEMS = 40;

export interface SharedItem {
  ean?: string;        // GTIN-13
  name?: string;       // obligatorio sin EAN
  quantity: number;
  price?: number;      // sin precio conocido, ausente
  store?: StoreRef;    // sin lat, lng ni chain; con sepaId, solo name y sepaId
}

export interface SharedCart {
  kind: 'cart' | 'purchase';
  date?: string;       // 'AAAA-MM-DD' en hora local, solo en 'purchase'
  items: SharedItem[];
}

export type DecodeResult = { ok: true; cart: SharedCart } | { ok: false; error: 'invalid' | 'incomplete' | 'version' };

export function sharedFromItems(items: CartItem[], products: Product[], inCatalog: (ean: string) => boolean): SharedItem[];
export function encodeSharedCart(cart: SharedCart): string;
export function decodeSharedCart(payload: string): DecodeResult;
export function findSharedPayload(text: string): string | null;
/** names: nombre de cada ítem en el mismo orden (en el mensaje va siempre, aunque no viaje en el link) */
export function shareMessage(cart: SharedCart, names: string[]): string;
export function sharedCartUrl(cart: SharedCart): string;

/** Datos para cargar: productos nuevos e ítems listos para el carrito */
export interface SharedLoad { products: Product[]; items: CartItem[] }
export function resolveSharedCart(cart: SharedCart, context: SharedContext): SharedLoad;

// src/lib/store.ts
loadSharedCart: (load: SharedLoad, merge: boolean) => void;

// src/lib/sepa.ts: de a 100 EAN, sin reintentos
export function getSepaProducts(eans: string[]): Promise<Map<string, SepaProduct>>;
```

`SharedContext` reúne los productos y precios propios, el catálogo, las sucursales, las referencias y el generador de
`id`.

**Formato del link** (versión 1): registros separados por `.` y campos por `-`; los campos vacíos del final se omiten.

| Registro | Campos |
|---|---|
| `1c` o `1p-<fecha>` | Versión y tipo; la fecha es `AAAAMMDD` en base 36 |
| `s-<nombre>-<barrio>-<dirección>-<sepaId>` | Un comercio; se numeran desde 1 en orden |
| `i-<ean>-<cantidad>-<precio>-<comercio>-<nombre>` | Un producto; cantidad en milésimas, precio en centavos; comercio vacío = "Sin comercio" |
| `e-<cantidad de productos>` | Cierre |

Los números van en base 36 y los textos (UTF-8) en base 62: solo letras, dígitos, `.` y `-`, que WhatsApp deja enteros
dentro del link. Con 20 productos del catálogo, unos 400 caracteres.

## UI/UX

```
/cart/compartido (375 px)
Carrito compartido
4 productos · $10.250,00
┌──────────────────────────────────┐
│ Coto — Caballito       $8.150,00 │
│ Av. Rivadavia 5000               │
│ [img] Leche entera 1 l           │
│       2 × $1.600,00    $3.200,00 │
│ …                                │
└──────────────────────────────────┘
[      Cargar en mi carrito        ]
```

- Pestaña **Carrito** activa en `/cart/compartido` (ya coincide por prefijo).
- Logo de WhatsApp de la spec 30 (`currentColor`), con `aria-hidden="true"`; botones `.btn-secondary`. Sin verde: en la
  app significa "más barato".
- Toque mínimo de 44 px; los `<dialog>` cierran con Escape, devuelven el foco y se cierran al ocultarse la página con
  `<Activity>`.
- El emoji del mensaje no es un ícono de la interfaz: va solo en el texto que se envía.
- Diseño con `/frontend-design` y `/ui-ux-pro-max` al implementar.

## Plan de implementación

1. **Codificar y decodificar (TDD):** `src/lib/shared-cart.ts` con `encodeSharedCart`, `decodeSharedCart`,
   `findSharedPayload` y `sharedCartUrl`, y `shared-cart.test.ts`: ida y vuelta (acentos, ñ, EAN con ceros, cantidades
   decimales), link cortado, otra versión, límites y solo caracteres permitidos.
2. **Mensaje (TDD):** `sharedFromItems` y `shareMessage`: los tres formatos, un solo comercio, sin precio, más de 40,
   caracteres de formato y coordenadas que no viajan.
3. **Carga (TDD):** `resolveSharedCart` y la acción `loadSharedCart` en `store.ts`: cada regla de producto, precio,
   combinar y reemplazar, y un solo cambio del store.
4. **Botones del carrito:** `src/components/ShareCartLink.tsx` en `cart/page.tsx` (carrito y grupos), con las
   referencias que la página ya pide. Logo de WhatsApp a su propio componente si la spec 30 lo dejó dentro del botón.
   **Verificar:** abre WhatsApp con la lista y el link.
5. **Vista previa:** `getSepaProducts` en `sepa.ts`, `src/components/useSharedCart.ts` (catálogo, sucursales solo si hay
   un `sepaId`, referencias e imágenes) y `src/app/cart/compartido/page.tsx`, que lee `location.hash` con
   `useSyncExternalStore` (vacío en el prerender; `hashchange` y al volver a mostrarse).
   **Verificar:** cargar, combinar y reemplazar con un link real.
6. **Pegar:** `src/components/PasteCartDialog.tsx` y su link al pie de `cart/page.tsx`, también con el carrito vacío; el
   aviso con **Copiar link** en la vista previa para el iPhone.
7. **Historial:** el botón en la compra expandida de `purchases/page.tsx`, con `useSepaReferences` de sus productos.
8. **Docs:** sección "Compartir por WhatsApp" en `/privacidad`; `CLAUDE.md` (Estructura, Arquitectura, Rutas, Carrito,
   Historial, Estado Actual); `docs/ideas.md` (sacar "Compartir carrito") y `docs/pruebas-pendientes.md`.

**Texto de `/privacidad`:** "Al compartir un carrito o una compra por WhatsApp, el mensaje lleva los productos, las
cantidades, los precios y los comercios (nombre, barrio y dirección; nunca tu ubicación). Los datos van dentro del link
y no los guardamos: los ve quien recibe el mensaje y cualquiera a quien se lo reenvíe."

**A revisar a mano (sin test automático):** Android e iPhone, con y sin la app instalada; WhatsApp Web; listas de 40 y
de 100 productos con nombre en los tres. Si alguno no abre o corta el link, bajar `MAX_MESSAGE_ITEMS` o
`MAX_SHARED_ITEMS` y anotarlo en *Decisiones*.

## Criterios de aceptación

- [ ] Con 2 comercios y "Sin comercio", **Compartir por WhatsApp** abre WhatsApp con el mensaje del ejemplo: grupos,
      subtotales, total y link.
- [ ] El botón de un comercio comparte solo sus productos, con el nombre del comercio en el título; con un solo grupo no
      aparece.
- [ ] Desde una compra expandida el título dice "Compra del dd/mm/aaaa" y el link la carga.
- [ ] Un ítem en $0 dice "sin precio" en el mensaje y "Sin precio" en la vista previa.
- [ ] Desde `localhost` y la preview, el link es de `https://elchanguito.vercel.app`.
- [ ] El link solo tiene letras, dígitos, `.` y `-` después del `#`, y la dirección con los datos no aparece en ningún
      pedido de red.
- [ ] 20 productos del catálogo dan un link de menos de 600 caracteres.
- [ ] Ni el mensaje ni el link llevan coordenadas, también con un comercio cargado con GPS.
- [ ] Con 41 productos el mensaje lista 40 y "y 1 producto más", y el link carga los 41; con 101 no hay botón y se
      explica por qué.
- [ ] Abrir el link sin cuenta y sin productos propios muestra la vista previa, y no cambia el carrito hasta tocar
      **Cargar en mi carrito**.
- [ ] Con el carrito vacío, carga y va a `/cart`, agrupado por comercio y con los precios compartidos.
- [ ] Con productos, pregunta Combinar o Reemplazar; al combinar, un producto repetido suma la cantidad y conserva su
      comercio y su precio.
- [ ] Un producto con EAN que ya era propio no se duplica; uno sin EAN con el mismo nombre, tampoco.
- [ ] Un comercio de Precios Claros queda con dirección y botón Mapa; uno a mano, sin Mapa.
- [ ] Una compra entra con el último precio de quien recibe; si no tiene, la referencia; si no, el de la compra.
- [ ] Cargar no registra precios en el historial.
- [ ] Un link cortado dice "El link está incompleto…", uno alterado "El link no es válido." y ninguno rompe la página.
- [ ] Con la consulta al catálogo fallida aparece **Reintentar**; sin las variables de Supabase se puede cargar.
- [ ] Pegar el mensaje entero, o solo el link, en **Cargar un carrito compartido** abre la vista previa; otro texto
      muestra el error.
- [ ] En Safari del iPhone la vista previa ofrece **Copiar link**; en la app instalada y en Android, no.
- [ ] Con sesión, el carrito cargado se sincroniza como cualquier cambio.
- [ ] 320 y 375 px sin scroll horizontal; `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.

## Decisiones

- **Datos dentro del link** (elegido por el usuario): sin cuenta, sin tabla y sin vencimiento; el servidor no los ve.
  Descartado: link corto en Supabase, que pide escritura anónima, limpieza y control de abuso.
- **Después del `#` y no en `?c=`:** no llega a los registros de Vercel.
- **Productos, cantidades, comercio y precios** (elegido por el usuario). Descartado: solo productos y cantidades, o un
  interruptor al compartir.
- **Nombre solo si hace falta** (elegido por el usuario): link corto. "Está en el catálogo" se sabe por la referencia
  que el carrito ya consulta; ante la duda, el nombre viaja.
- **Vista previa antes de cargar** (elegido por el usuario): abrir un link no cambia datos. Descartado: carga directa.
- **Se carga todo** (elegido por el usuario): lo que sobra se quita en el carrito. Descartado: casillas.
- **Combinar suma y conserva lo propio** (elegido por el usuario), como "Repetir compra".
- **Compra con el precio actual de quien recibe** (elegido por el usuario): los de la compra pueden ser viejos.
  Descartado: el precio de la compra, la misma regla que el carrito.
- **Carrito, cada comercio y compras del historial** (elegido por el usuario).
- **Comercio a mano sin coordenadas** (elegido por el usuario): salieron del GPS de quien comparte.
- **Pegar el link en la app** (elegido por el usuario): en iPhone, WhatsApp abre Safari, que no comparte datos con la app
  instalada. Descartado: solo un aviso.
- **Directo a WhatsApp** (elegido por el usuario), como la spec 30.
- **Lista agrupada por comercio con el link al final** (elegida por el usuario). Descartado: compacta y link primero.
- **Hasta 40 en la lista y 100 en el link** (elegido por el usuario).
- **Después de la spec 30** (elegido por el usuario): reutiliza `share.ts`, el logo y la vista previa del link.
- **Base 36 y base 62 y no base64url ni compresión:** base64url usa `_`, que WhatsApp toma como formato, y
  `CompressionStream` es asíncrono: el link tiene que estar listo antes del toque.
- **Registro de cierre con la cantidad:** un mensaje cortado se detecta en lugar de cargar una parte.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| WhatsApp corta o no abre un mensaje largo | Límites de 40 y 100; registro de cierre; prueba a mano en tres plataformas |
| La lista larga esconde el link detrás de "Leer más" | Se acepta: el link queda al final, en su propio renglón |
| En Android el link abre el navegador y no la app instalada | En Chrome comparten los datos; si se abre en otro navegador, se pega en la app |
| Un producto deja de estar en el catálogo después de compartir | Se carga como "Producto <EAN>", con su código |
| Un link manipulado | Validación de todos los campos, límites y textos mostrados como texto |
| Cambia el formato en otra versión | Versión en el primer registro |

## Qué **no** entra en esta spec

- Tiempo real ni marcar lo comprado.
- Link corto.
- Otras apps, copiar la lista o el menú del sistema.
- Elegir productos al compartir o al cargar.
- Vista previa propia en WhatsApp y medición de links.

Cada una, si llega, va en su propia spec.
