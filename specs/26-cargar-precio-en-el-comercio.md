# SPEC 26 — Cargar precio en el comercio

> **Estado:** Borrador
> **Depende de:** [SPEC 10](10-productos-con-codigo-de-barras.md), [SPEC 11](11-lector-codigo-de-barras.md), [SPEC 15](15-precios-y-comercios-cercanos.md), [SPEC 18](18-agregar-al-carrito-sin-alta.md), [SPEC 21](21-cuenta-y-sincronizacion.md), [SPEC 24](24-comercios-cercanos-en-el-lector.md)
> **Fecha:** 2026-11-21
> **Objetivo:** Cargar el precio de cualquier producto (propio, del catálogo, con un código desconocido o sin código) en el comercio donde está el usuario, elegido por GPS o a mano, sin dar de alta el producto antes.

## Por qué existe esta spec

Cargar un precio es la otra mitad del uso en la góndola ([feature 08](../docs/features/08-consulta-y-aportes.md)).
Hoy la pestaña "Cargar precio" de `/upload`:

- exige un producto **propio**: un producto del catálogo, o un código que no está en ningún lado, obliga a pasar
  antes por "Agregar producto";
- pide el **barrio** como obligatorio y el comercio como texto libre opcional, sin dirección ni coordenadas: el
  precio no puede aparecer con su distancia ni en el mapa;
- después de guardar borra todo, aunque se estén cargando varios precios en el mismo comercio.

Hay tres casos, según el producto:

| Caso | Producto | Qué se carga |
|---|---|---|
| **A** | Con código y en Precios Claros | Precio + comercio; el producto se crea con `productFromSepa` |
| **B** | Con código y fuera de Precios Claros | Código + nombre (+ marca) + precio + comercio |
| **C** | Sin código | Nombre (+ marca) + precio + comercio |

Un producto propio es el caso más simple: precio + comercio.

## Alcance

**Incluye:**

- La pestaña **Cargar precio** rediseñada: primero el **comercio**, después el **producto**, después el **precio**.
- **Comercio obligatorio**, elegido con "Usar mi ubicación" (sucursales de Precios Claros a menos de 200 m), entre
  los comercios ya usados, o como "Otro comercio" con nombre, dirección y barrio (con las coordenadas del GPS si se
  usó). El barrio pasa a ser opcional.
- **Buscador único de producto**: los propios y los de Precios Claros, con el lector de códigos y "No tiene código
  de barras".
- Casos B y C en el mismo formulario: nombre (obligatorio) y marca (opcional). El producto se crea al guardar.
- `Price.storeRef?: StoreRef`, también en los precios que registra el checkout del carrito.
- Después de guardar, **queda el comercio**: se limpian producto y monto.
- `/upload?tab=precio&ean=…&monto=…` abre la pestaña con el producto y el monto, y el botón **Cargar precio acá**
  en la oferta del lector de Buscar (spec 24) lleva ahí.
- En "Comercios cercanos", los precios propios con coordenadas dentro del radio se **mezclan** con los de Precios
  Claros, con su distancia y el botón Mapa.
- Texto nuevo en `/privacidad` sobre las coordenadas de un comercio cargado a mano.

**Fuera de alcance:**

- La foto del producto en los casos B y C (spec 27).
- Compartir o validar precios (specs 22 y 23).
- Los precios propios como opción en "¿Dónde conviene?" del carrito (spec 25).
- Geocodificación inversa (dirección a partir del GPS): la ubicación no sale del dispositivo.
- Editar o borrar el comercio de un precio ya guardado.
- Cambios en la pestaña "Agregar producto".

## Reglas

### Orden del formulario

1. **Comercio** (obligatorio).
2. **Producto** (obligatorio).
3. **Precio** (obligatorio, mayor que 0).
4. **Guardar precio**.

Validación al guardar, con el foco en el primer campo con error:

- sin comercio → "Elegí el comercio";
- sin producto → "Elegí el producto";
- caso B o C sin nombre → "Completá el nombre";
- monto vacío, 0 o no numérico → "Completá el precio".

### Comercio

Sin comercio elegido, el bloque muestra:

- **Usar mi ubicación** (solo si `geolocationAvailable()`).
- **Comercios que usaste**: hasta 5 botones con los comercios más recientes de los precios y las compras
  (`recentStores`), distintos por `storeKey`. Sin ninguno, no aparece.
- **Otro comercio**: abre el formulario de nombre (obligatorio, "Ej: Super Luna"), dirección (opcional) y barrio
  (opcional), como "Otro comercio" de `CartStoreDialog`.

**Usar mi ubicación:**

- Una lectura con `requestPosition({ highAccuracy: true })` (10 s de límite). "Buscando comercios cerca…" mientras
  tanto. **No cambia la ubicación guardada de la app** (la de Buscar).
- Con la posición, las sucursales de Precios Claros (`useSepaBranches`, que se carga recién ahí) a menos de
  **200 m**, de la más cercana a la más lejana, **hasta 3** (`storesAtPoint`). Cada una es un botón: "¿Estás en
  <cadena> — <sucursal>?", con la dirección y "a 80 m".
- Debajo, siempre, **Otro comercio acá**: el mismo formulario de "Otro comercio", que guarda además las coordenadas
  de la lectura, redondeadas a 4 decimales.
- Sin sucursales a menos de 200 m (o sin Supabase, o si fallan las sucursales): "No hay comercios de Precios Claros
  a menos de 200 m" y el formulario de "Otro comercio acá" ya abierto.
- Permiso denegado → "Sin permiso para usar tu ubicación. Elegí el comercio a mano."; sin señal → "No se pudo obtener
  tu ubicación. Elegí el comercio a mano." (`LOCATION_ERROR_MESSAGE` más la indicación). Quedan los comercios usados y
  "Otro comercio".

**Comercio elegido:** una fila con el nombre, la dirección o el barrio, el ícono de ubicación si tiene coordenadas, y
**Cambiar**, que vuelve al bloque sin comercio.

El comercio elegido vive en el estado de la página: se conserva al navegar (`<Activity>`) y se pierde al recargar.

### Producto

Sin producto elegido:

- Campo de texto "Buscá un producto" y, al lado, el botón del lector (`ScanButton`).
- Resultados mientras se escribe:
  - **Tus productos**: `filterProducts`, hasta 5.
  - **En Precios Claros** (con al menos 3 caracteres y Supabase): `useSepaSearch` sin los que ya tienen un propio,
    con la imagen de 48 px.
- Link **No tiene código de barras** debajo del campo → caso C.

Al leer un código:

| Código | Resultado |
|---|---|
| De un producto propio | Queda elegido ese producto |
| En Precios Claros (`getSepaProduct`) | Caso A: queda elegido el producto del catálogo |
| Fuera de Precios Claros | Caso B: "El código <ean> no está en Precios Claros." con Nombre y Marca |
| Falla la consulta | Caso B con "No se pudo consultar Precios Claros." |
| Sin Supabase | Caso B |

"Buscando el código…" mientras se consulta. Una respuesta vieja (otro código leído o el campo editado) se descarta.

**Producto elegido:** una fila con la imagen de 48 px, el nombre, la marca y la presentación (lo que exista),
"Precios Claros" si es del catálogo y no es propio, y **Cambiar**. En B y C la fila es el formulario de Nombre
(obligatorio) y Marca (opcional), con el código arriba en B y **Cambiar**.

**Al guardar** se resuelve el producto (`resolvePriceProduct`):

- propio → ese;
- A → el propio con ese EAN si apareció mientras tanto (por la sincronización); si no, uno nuevo con
  `productFromSepa`;
- B → uno nuevo con `name`, `brand` (si hay) y `ean`;
- C → uno nuevo con `name` y `brand`, sin `ean`.

Nada se crea antes de guardar: elegir un producto del catálogo y cambiarlo no deja productos sueltos.

### Precio

- Campo "Precio ($)" (`type="number"`, `inputMode="decimal"`, `min="0"`, `step="0.01"`).
- Si el producto tiene precios propios, debajo: "Último precio $Y · dd/mm" (`getPriceStats`).

### Guardar

- Se registra un `Price`:
  - `amount`;
  - `date`: ahora;
  - `storeRef`: el comercio elegido;
  - `store`: `storeRef.name`;
  - `barrio`: `storeRef.barrio` o, si no tiene, `NO_BARRIO` ("Sin especificar").
- Aviso de 3 s: "Precio guardado: <producto> $X en <comercio>. Solo lo ves vos." (`role="status"`).
- Se limpian producto y monto; **queda el comercio**. El foco vuelve al buscador de producto.
- Si la URL tenía `ean` o `monto`, queda en `/upload?tab=precio` (`router.replace`), para que recargar no vuelva a
  completar el formulario.

### `/upload?tab=precio&ean=…&monto=…`

- Abre la pestaña "Cargar precio". Con `ean` válido (`toGtin13`), resuelve el producto como al leer el código. Con
  `monto` mayor que 0, completa el precio. El comercio que ya estaba elegido se conserva.
- Se aplica cuando cambia la URL (el mismo patrón que `?tab=producto&ean=…`), no con una `key`.
- En la oferta del lector de Buscar (spec 24), el link **Cargar precio acá** lleva a
  `/upload?tab=precio&ean=<ean>` y, si hay algo escrito en "¿Cuánto sale acá?", suma `&monto=<monto>`. Aparece en la
  oferta de un propio, de uno del catálogo y de uno fuera del catálogo (al lado de "Agregar producto").

### Checkout del carrito

Los precios que registra la compra de un grupo con comercio llevan también `storeRef: group.store`. Sin comercio
("Sin comercio"), como hoy.

### Precios propios en "Comercios cercanos"

- `priceStoreRef(price)` devuelve `price.storeRef` si existe; si no, `{ name: store, barrio }` como hoy.
- `getRecentStorePrices` no cambia: el último de cada comercio (`storeKey`) de los últimos 60 días.
- En `NearbyStores`, un precio propio cuyo comercio tiene coordenadas **dentro del radio** de la ubicación de la app
  se ordena con los de Precios Claros por precio y después distancia, con la distancia ("aprox." con localidad),
  "Cargado por vos · dd/mm" y el botón **Mapa**. "Más barato" se calcula sobre todas esas filas.
- Los demás precios propios (sin coordenadas o fuera del radio) quedan al final, como hoy.
- `NearbyLine` ("Desde $X…") no cambia: resume solo Precios Claros.

## Modelo de datos

```typescript
// src/lib/models.ts
interface Price {
  id: string;
  productId: string;
  amount: number;
  date: Date;
  barrio: string;       // NO_BARRIO si no se conoce
  store?: string;       // nombre del comercio; con storeRef, igual a storeRef.name
  storeRef?: StoreRef;  // nuevo: comercio completo (sucursal SEPA o cargado a mano, con coordenadas si se usó el GPS)
}
```

- Opcional: los precios guardados antes siguen sirviendo y no hace falta migrar `preciolocal_prices`.
- Viaja dentro del JSON de `user_records` (spec 21) como el resto del precio; el esquema de la base no cambia.
- `store` y `barrio` se siguen escribiendo: el historial del detalle, `getRecentStorePrices` y una versión vieja de la
  app en otro dispositivo los leen.

Funciones puras nuevas, con tests:

```typescript
// src/lib/price-form.ts
/** Producto elegido en Cargar precio, antes de guardar */
export type PriceProductChoice =
  | { kind: 'own'; product: Product }
  | { kind: 'sepa'; sepa: SepaProduct }                       // caso A
  | { kind: 'new'; ean?: string; name: string; brand: string }; // casos B (con ean) y C

/** Sucursales a menos de 200 m de un punto, de la más cercana, hasta 3 */
export function storesAtPoint(branches: SepaBranch[], point: LatLng): NearBranch[];

/** Comercios de los precios y las compras, del más reciente, distintos por storeKey, hasta 5 */
export function recentStores(prices: Price[], purchases: Purchase[]): StoreRef[];

/** "Otro comercio": nombre, dirección y barrio sin espacios de más; coordenadas redondeadas a 4 decimales */
export function otherStore(input: { name: string; address: string; barrio: string; point?: LatLng }): StoreRef;

/** El producto a usar: el existente o uno nuevo (isNew) */
export function resolvePriceProduct(choice: PriceProductChoice, products: Product[], newId: string):
  { product: Product; isNew: boolean };

/** El Price a registrar, con store y barrio a partir del storeRef */
export function priceAt(input: { id: string; productId: string; amount: number; store: StoreRef; date: Date }): Price;
```

Cambios en funciones existentes:

```typescript
// src/lib/store.ts
priceStoreRef(price: Pick<Price, 'store' | 'barrio' | 'storeRef'>): StoreRef;  // storeRef primero

// src/lib/location.ts
requestPosition(options?: { highAccuracy?: boolean }): Promise<LatLng>;        // por defecto, sin alta precisión

// src/components/NearbyStores.tsx — prop nueva, para la distancia de los precios propios
origin?: LatLng;
radiusKm?: number;
```

## UI/UX

```
┌───────────────────────────────────────┐
│ Cargar precio                         │
│                                       │
│ Comercio *                            │
│ ┌───────────────────────────────────┐ │
│ │ Coto — Cabildo         [Cambiar]  │ │
│ │ Av. Cabildo 2280, Belgrano        │ │
│ └───────────────────────────────────┘ │
│                                       │
│ Producto *                            │
│ [ Buscá un producto          ] [▥]    │
│ No tiene código de barras             │
│                                       │
│ Precio ($) *                          │
│ [ 4.300                        ]      │
│                                       │
│ [        Guardar precio        ]      │
└───────────────────────────────────────┘

Sin comercio, después de "Usar mi ubicación":
│ Comercio *                            │
│ ¿Estás en…?                           │
│ ┌ Coto — Cabildo            a 40 m ─┐ │
│ │ Av. Cabildo 2280                   │ │
│ │ Día — Juramento           a 150 m  │ │
│ └───────────────────────────────────┘ │
│ Otro comercio acá                     │
```

- Bloques con `.card`, separados; los encabezados ("Comercio", "Producto", "Precio") con `font-semibold`.
- Botones y filas tocables de 44 px (`.list-row`, `.btn-secondary`); `Cambiar` como link de texto con 44 px de alto.
- La sucursal más cercana en `primary-700`, como en la lista de comercios cercanos (spec 20).
- Mensajes de error junto a su campo (`aria-invalid`, `aria-describedby`), además del foco.
- El aviso de guardado, fijo abajo con el ícono de check, como el de Buscar (spec 18).
- Íconos de `lucide-react` (`MapPin`, `Store`, `ScanBarcode`, `Check`), con `aria-hidden="true"`.
- 375 px sin scroll horizontal; inputs de 16 px.
- Diseño con `/frontend-design` y `/ui-ux-pro-max` al implementar.

## Plan de implementación

1. **Modelo y `priceStoreRef` (TDD)**: `Price.storeRef` en `models.ts`. `priceStoreRef` con `storeRef` primero,
   con tests en `store.test.ts`. Un precio con `storeRef` de una sucursal tiene el `storeKey` de su `sepaId`.
2. **Funciones de la pestaña (TDD)**: `src/lib/price-form.ts` y `price-form.test.ts`.
   - `storesAtPoint`: 199 m entra, 201 m no; un máximo de 3; orden por distancia; sin coordenadas se ignora.
   - `recentStores`: distintos por `storeKey`, del más reciente, hasta 5, sin nombres vacíos.
   - `otherStore`: recorta espacios, omite vacíos y redondea coordenadas.
   - `resolvePriceProduct`: los cuatro casos, y A con un propio que apareció con el mismo EAN.
   - `priceAt`: `barrio` de la sucursal o `NO_BARRIO`.
3. **Checkout con `storeRef`**: los precios del grupo con comercio lo llevan (`src/app/cart/page.tsx`). Verificar:
   comprar en una sucursal deja el precio con `storeRef`.
4. **Alta precisión**: opción `highAccuracy` en `requestPosition`, sin cambiar a quienes ya la llaman.
5. **Bloque del comercio**: `src/components/PriceStorePicker.tsx` (GPS, sucursales a menos de 200 m, comercios
   usados, "Otro comercio" / "Otro comercio acá", comercio elegido con "Cambiar").
6. **Bloque del producto**: `src/components/PriceProductPicker.tsx` (buscador de propios y del catálogo, lector,
   "No tiene código de barras", casos B y C, producto elegido con "Cambiar").
7. **Pestaña nueva**: `src/app/upload/PriceForm.tsx` con los dos bloques, el precio, la validación, el guardado y
   el aviso. Sale de `UploadForm.tsx`, que queda con las pestañas y "Agregar producto".
8. **Parámetros de la URL**: `?tab=precio&ean=…&monto=…` en `UploadForm` / `PriceForm`, y el link **Cargar precio
   acá** en la oferta del lector de Buscar.
9. **Precios propios en Comercios cercanos**: `origin` y `radiusKm` en `NearbyStores`, mezclados por precio y
   distancia con Mapa. Pasarlos desde Buscar, la oferta del lector y `NearbyStoresCard`.
10. **Privacidad y docs**:
    - `/privacidad`: el comercio cargado con "Usar mi ubicación" guarda sus coordenadas en el precio, que se
      sincroniza con la cuenta. La ubicación de la app sigue sin sincronizarse.
    - `CLAUDE.md`: Estructura, Modelos (`Price.storeRef`), Funcionalidades (Cargar, Búsqueda, Carrito) y Estado
      Actual.
    - `docs/features/08-consulta-y-aportes.md`: spec 26 hecha.

**A revisar (sin test automático):**

- "Usar mi ubicación" adentro de un supermercado, con el celular.
- Cargar tres precios seguidos en el mismo comercio.
- Leer un código del catálogo, cambiarlo por otro y guardar: queda un solo producto nuevo.
- "Cargar precio acá" desde la oferta del lector, con y sin monto escrito.
- 375 px con nombres largos de sucursal.

## Criterios de aceptación

- [ ] Guardar sin comercio muestra "Elegí el comercio" y no registra nada.
- [ ] El barrio no es obligatorio: un precio en "Otro comercio" con solo el nombre se guarda con barrio "Sin especificar".
- [ ] "Usar mi ubicación" a menos de 200 m de una sucursal de Precios Claros la ofrece como "¿Estás en <cadena> — <sucursal>?", con su distancia.
- [ ] Elegir esa sucursal y guardar deja un `Price` con `storeRef.sepaId`, la dirección y el barrio de la sucursal.
- [ ] "Otro comercio acá" con nombre "Super Luna" guarda un `Price` con `storeRef` de nombre "Super Luna" y coordenadas de 4 decimales.
- [ ] "Usar mi ubicación" en Cargar precio no cambia la ubicación de la barra de Buscar.
- [ ] Sin permiso de ubicación, aparece "Sin permiso para usar tu ubicación. Elegí el comercio a mano." y se puede elegir "Otro comercio".
- [ ] "Comercios que usaste" muestra hasta 5 comercios distintos de precios y compras anteriores; tocar uno lo elige.
- [ ] Buscar "playadito" muestra los propios que coinciden y los de Precios Claros que no son propios.
- [ ] Elegir un producto de Precios Claros y guardar crea un solo producto propio (con EAN, marca y presentación) y su precio.
- [ ] Leer un código que no está en Precios Claros pide Nombre; guardar crea el producto con ese EAN y su precio.
- [ ] "No tiene código de barras" pide Nombre; guardar crea el producto sin EAN y su precio.
- [ ] Elegir un producto del catálogo y después "Cambiar" no crea ningún producto.
- [ ] Después de guardar, el comercio sigue elegido y producto y precio quedan vacíos.
- [ ] `/upload?tab=precio&ean=<un EAN del catálogo>&monto=4300` abre Cargar precio con ese producto y $4.300.
- [ ] "Cargar precio acá" en la oferta del lector de Buscar lleva a Cargar precio con el producto (y el monto, si se escribió).
- [ ] La compra de un grupo con comercio registra precios con `storeRef`.
- [ ] Con ubicación, un precio propio con coordenadas dentro del radio aparece en "Comercios cercanos" ordenado por precio entre los de Precios Claros, con distancia, "Cargado por vos · dd/mm" y Mapa.
- [ ] Un precio guardado antes de esta spec (sin `storeRef`) sigue apareciendo en el detalle y al final de "Comercios cercanos".
- [ ] `/privacidad` explica que el comercio cargado con la ubicación guarda sus coordenadas.
- [ ] 375 px sin scroll horizontal; `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.

## Decisiones

- **Sin foto en los casos B y C** (elegido): la foto tiene su propio diseño (compresión, IndexedDB, bucket privado,
  leyenda de supervisión) en la spec 27. Esta spec deja el producto creado y la 27 le suma la foto.
- **Se rediseña Cargar precio y se suma el link desde el lector** (elegido). Descartado: cargarlo solo dentro de la
  oferta del lector (mezcla consultar con cargar en una tarjeta que ya es larga) y solo en la pestaña (obliga a leer
  el código dos veces).
- **Buscador único** de propios y catálogo (elegido) en lugar del `select`: con muchos productos el `select` no
  sirve, y así un producto del catálogo se carga sin darlo de alta.
- **B y C en el mismo formulario** (elegido). Descartado: mandar a "Agregar producto" y volver, que es el paso que
  esta spec quiere sacar.
- **El producto se crea al guardar**, no al elegirlo: cambiar de idea no deja productos sueltos.
- **Comercio obligatorio, barrio opcional** (elegido): un precio sin comercio no sirve para comparar ni para
  compartirlo después (specs 22 y 23); el barrio sale de la sucursal o queda en "Sin especificar", como en el
  checkout.
- **Comercio primero en el formulario**: estando en un comercio se elige una vez y se cargan varios productos
  seguidos. Por eso, al guardar, **queda el comercio** (elegido).
- **Se guardan las coordenadas de "Otro comercio acá", redondeadas a 4 decimales** (elegido): sin ellas el precio
  no tiene distancia ni mapa. Son las del comercio, no las del recorrido del usuario, pero se sincronizan con la
  cuenta: se aclara en `/privacidad`.
- **200 m y hasta 3 sucursales**, con alta precisión: adentro de un local el GPS puede errar 100 m o más; el
  análisis proponía ~150 m. Con 3 opciones, una sucursal de enfrente no tapa la correcta.
- **"Usar mi ubicación" no cambia la ubicación de la app**: la de Buscar es un barrio o un punto de referencia
  elegido a propósito, y cargar un precio no tiene por qué moverla.
- **Sin geocodificación inversa**: mandaría la posición a un servicio externo (regla de la spec 15).
- **`store` y `barrio` se siguen escribiendo** junto a `storeRef`: lo que ya los lee no cambia, y una versión vieja
  de la app en otro dispositivo sigue mostrando el precio.
- **El checkout también guarda `storeRef`**: el comercio del grupo ya es un `StoreRef`; perderlo al registrar el
  precio dejaría los precios pagados sin distancia.
- **Precios propios mezclados en Comercios cercanos** (elegido), con distancia y Mapa. Descartado: dejarlos al final
  con Mapa (se pierde que puede ser el más barato). `NearbyLine` sigue resumiendo solo Precios Claros, que es lo que
  dice "en N comercios cerca".
- **El aviso dice "Solo lo ves vos"** en lugar de "Precio compartido exitosamente!": los precios son privados hasta
  las specs 22 y 23.
- **Precios propios en "¿Dónde conviene?" quedan afuera**: la spec 25 compara contra las sucursales del SEPA. Se
  suman cuando haya precios con `storeRef` para probarlo.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El GPS adentro del local erra más de 200 m | Siempre quedan "Otro comercio acá", los comercios usados y "Otro comercio" a mano |
| La primera lectura de sucursales tarda (bajan todas, de a 1.000) | Se pide recién con "Usar mi ubicación" y queda en la caché de la sesión; "Buscando comercios cerca…" mientras tanto |
| Un producto del caso C se carga dos veces con nombres parecidos | El buscador muestra antes los propios que coinciden; unir productos queda fuera de alcance |
| Un dispositivo con una versión vieja edita un precio y pierde `storeRef` | Las acciones copian el objeto entero con spread (`updatePrice`): el campo se conserva aunque no lo conozcan |

## Qué **no** entra en esta spec

- Foto del producto (spec 27).
- Compartir o validar precios (specs 22 y 23).
- Precios propios en "¿Dónde conviene?" del carrito (spec 25).
- Geocodificación inversa.
- Editar o borrar el comercio de un precio guardado.
- Cambios en "Agregar producto".
