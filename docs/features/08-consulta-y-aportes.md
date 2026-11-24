# 08 — Consulta de precios y aportes de los usuarios

- **Estado:** Analizado
- **Fase:** 1–2 (consulta: Supabase de solo lectura; aportes y fotos: cuenta y Storage)

> Analizado el 21/11/2026 a partir de cómo se espera que se use la app. Reúne lo que falta para ese uso y ordena
> las specs 24 a 28. Las specs 22 (grupos) y 23 (validación) de la [spec 21](../../specs/21-cuenta-y-sincronizacion.md)
> siguen vigentes.

## Problema

El uso principal de El Changuito va a ser **consultar precios** y saber **dónde conviene comprar cerca**, de dos
maneras:

- **En la góndola:** leer el código de barras y ver si cerca hay un comercio más barato.
- **Antes de salir:** armar el carrito y ver qué comercios cercanos tienen esos productos y a cuánto.

Además, los usuarios cargan precios y fotos de productos. Esos aportes quedan **solo para quien los cargó**. Para
compartirlos con otros tienen que pasar antes por una validación (precios) o una supervisión (fotos): una foto
puede no corresponder al producto o ser inapropiada.

## Qué existe hoy

| Uso | Qué hay | Qué falta |
|---|---|---|
| Leer el código en la góndola | Lector en Buscar (spec 11). La oferta del lector (`ScanOffer`), propio o del catálogo, muestra los comercios cercanos (resumen + 3) o los precios por cadena, y "¿Cuánto sale acá?" compara el precio de la góndola contra el más barato cercano, la referencia y el último precio propio (spec 24, hecha). "Cargar precio acá" lleva a Cargar precio con el producto y el monto (spec 26, hecha) | — |
| Armar el carrito antes de ir | Agregar desde el catálogo sin dar de alta el producto (spec 18), carrito por comercio (spec 14), "Cerca tuyo" **ítem por ítem** al cambiar el comercio (spec 15), recorrido en el mapa (spec 16) | **Comparar el carrito entero** contra los comercios cercanos: es la pieza que más valor da |
| Cargar un precio | Pestaña "Cargar precio" de `/upload` (spec 26, hecha): comercio obligatorio por GPS (sucursales a menos de 200 m), usados u "Otro comercio"; producto propio, del catálogo, con un código desconocido o sin código, creado al guardar; `Price.storeRef` con dirección y coordenadas | — |
| Fotos de productos | Imágenes de Open Food Facts y del portal (spec 17). Foto propia (spec 27, hecha): en Cargar precio (B y C), Agregar producto y el detalle; comprimida, en IndexedDB y, con cuenta, en el bucket privado `fotos-propias`; "Solo la ves vos" | Supervisarla y compartirla con la comunidad (spec 28) |
| Precios privados | `localStorage` y, con cuenta, `user_records` con RLS (spec 21). Grupos (spec 22, hecha): un grupo a la vez de hasta 20 integrantes por link de invitación; cada uno ve los precios con código de barras de los demás de los últimos 60 días en Comercios cercanos, "¿Cuánto sale acá?" y el detalle (Precios del grupo), consultados a pedido con `group_prices`. Validación (spec 23, hecha): "Está bien" / "No coincide" sobre los precios de los demás, estado *Validado* o *Dudoso* (los Dudosos no cuentan como el más barato) y la página "Por validar" | Precios propios y del grupo en "¿Dónde conviene el carrito?" |

## Alcance MVP

Orden de implementación (no sigue la numeración):

| Orden | Spec | Qué hace |
|---|---|---|
| 1 | [25 — ¿Dónde conviene el carrito?](../../specs/25-donde-conviene-el-carrito.md) | Compara el carrito contra las sucursales cercanas (o contra las cadenas, sin ubicación): cuántos productos tiene cada una, el total, el ahorro y los faltantes; "Pasar todo a este comercio" |
| 2 | [24 — Comercios cercanos en el lector](../../specs/24-comercios-cercanos-en-el-lector.md) (hecha) | La oferta del lector muestra `NearbyLine` y `NearbyStores` con ubicación; opcional "¿Cuánto sale acá?", que lo compara contra la referencia (`vsReference`) |
| 3 | [26 — Cargar precio en el comercio](../../specs/26-cargar-precio-en-el-comercio.md) (hecha) | Los tres casos y el comercio por GPS o a mano (ver abajo) |
| 4 | [27 — Fotos propias](../../specs/27-fotos-propias.md) (hecha) | Foto del producto: compresión, guardado en el teléfono y, con cuenta, en Storage privado; leyenda "Solo la ves vos" |
| 5 | [22 — Grupos y precios compartidos](../../specs/22-grupos-y-precios-compartidos.md) (hecha) | Un grupo a la vez (hasta 20), link de invitación, apodos y "Compartir mis precios"; los precios del grupo en Comercios cercanos, "¿Cuánto sale acá?" y el detalle |
| 6 | [23 — Validación de precios del grupo](../../specs/23-validacion-de-precios.md) (hecha) | "Está bien" / "No coincide" con "¿Cuánto viste?"; *Validado* con 2 ok y mayoría, *Dudoso* con 2 no y al menos tantos como ok; página "Por validar" (14 días) y votos en Precios del grupo |
| 7 | 28 — Supervisión de fotos | Moderación automática, cola manual y publicación de las aprobadas |

### Spec 26 — Cargar precio en el comercio

Tres casos, según lo que tenga el producto. El lector de "Cargar precio" (y un botón "Cargar precio acá" en el de
Buscar) elige el caso solo:

| Caso | Qué se carga | Cómo |
|---|---|---|
| **A. Con código y en Precios Claros** | Precio + comercio | Si no es propio, se crea con `productFromSepa` (`src/lib/product-form.ts`) sin pasar por el formulario y se sigue directo al monto. Sin foto: ya tiene imagen o se puede sumar después |
| **B. Con código y fuera de Precios Claros** | Código + descripción + foto + comercio | El formulario de producto ya guarda el EAN solo; se suma la foto (spec 27) |
| **C. Sin código** | Descripción + foto + comercio | Igual que B, sin EAN |

El comercio, en los tres casos:

- **"Usar mi ubicación"** (`requestPosition`, `src/lib/location.ts`): si hay sucursales de Precios Claros a menos
  de ~150 m (`getSepaBranches` + `nearestBranches`), se ofrecen ("¿Estás en Coto — Av. Cabildo 2280?"). Al elegir
  una, se guarda como `StoreRef` del SEPA (`storeRefFromBranch`). Si no es ninguna, "Otro comercio": nombre
  obligatorio ("Super Luna"), dirección opcional y las coordenadas del GPS.
- **A mano:** nombre, y dirección y barrio opcionales, como "Otro comercio" en `CartStoreDialog`.
- Se sugieren los comercios ya usados en precios y compras anteriores.
- **Sin geocodificación inversa:** la ubicación no sale del dispositivo (regla de la spec 15).
- Con coordenadas, el precio propio aparece en "Comercios cercanos" con su distancia y el botón Mapa. Después
  puede sumarse como opción en la comparación del carrito (spec 25).

### Specs 27 y 28 — Fotos

1. **En el teléfono:** compresión a ~800 px y menos de 200 KB, sin EXIF ni GPS. Se guarda en IndexedDB
   (`localStorage` no tiene lugar para imágenes).
2. **Con cuenta:** se sube a un bucket privado de Supabase Storage (`fotos-propias/<user_id>/<id>.jpg`, que solo ve
   el autor). Leyenda: **"Solo la ves vos"** (spec 27, hecha): no promete una supervisión que todavía no existe. La
   leyenda "Se supervisará para compartirla con la comunidad" llega con la spec 28. Orden: 27 → 22 → 23 → 28.
3. **Supervisión automática** (spec 28), en una Edge Function al subir:
   - **Contenido inapropiado:** un clasificador de imágenes (Google Cloud Vision SafeSearch, AWS Rekognition
     Moderation u OpenAI omni-moderation). Si da positivo, se rechaza y se borra.
   - **Que sea el producto:** un modelo de visión recibe la foto, la descripción, la marca y la presentación, y
     dice si coinciden. Si en la foto se lee el código de barras, mejor.
   - Resultado: aprobada, rechazada o dudosa.
4. **Revisión manual:** las dudosas (y al principio todas) van a `/admin/fotos`, solo para un rol admin (claim en
   `app_metadata`), con Aprobar y Rechazar.
5. **Publicación:** las aprobadas pasan a un bucket público. Al mostrar una imagen, el orden es: foto propia, foto
   aprobada de la comunidad, Open Food Facts o el portal.
6. **Estados que ve el autor:** "En revisión para compartir con la comunidad", "Compartida" y "No se pudo
   compartir (no corresponde al producto)".

## Evolución futura

- **Comunidad abierta:** precios públicos para todos los usuarios, no solo para un grupo (ver [ideas](../ideas.md)).
  Se construye sobre las specs 22 y 23.
- **Combinar dos comercios** en la comparación del carrito ("los 2 que faltan, en Día a 400 m").
- **Precios cargados por el usuario** como opción en la comparación del carrito (después de la spec 26).
- **Acceso directo al lector** para consultar en la góndola sin pasar por la búsqueda de texto.

## Modelo de datos propuesto

- **Spec 25:** sin datos persistidos nuevos (`src/lib/basket.ts` y la acción `moveCartItems`).
- **Spec 26:** `Price.storeRef?: StoreRef`, opcional y compatible con lo guardado. `barrio` deja de ser
  obligatorio cuando hay comercio con dirección o coordenadas: se completa con el barrio de la sucursal o, si no
  hay, con "Sin especificar".
- **Spec 27 (hecha):** `Product.photo?: { id, takenAt }`, que viaja con el producto en `user_records` (sin tabla
  nueva); el archivo en IndexedDB (`el-changuito`, almacenes `photos` y `photo_deletes`) y, con cuenta, en el bucket
  privado `fotos-propias`. La tabla de estados de moderación es de la spec 28.
- **Spec 28:** bucket público `fotos-productos`, motivo y fecha de la decisión, rol admin.

## UI/UX

- La comparación del carrito es una tarjeta arriba del carrito y un modal con la lista (detalle en la spec 25).
- En Cargar precio, la elección del comercio va primero si hay GPS: un toque cuando se está en un comercio conocido.
- La foto propia lleva "Solo la ves vos" (spec 27). Con la spec 28, la leyenda de supervisión la acompaña hasta
  que se resuelve.

## Dependencias

- Specs 12, 14, 15, 16 y 20 (precios por cadena, carrito por comercio, comercios cercanos, mapa, lista de
  comercios) para las specs 24 y 25.
- Spec 21 (cuenta) para subir fotos y para compartir.
- Supabase Storage y Edge Functions, el primer backend con secretos del proyecto (clave del servicio de moderación),
  para la spec 28.

## Preguntas abiertas

- ¿Qué servicio de moderación se usa? Hay que comparar el costo por imagen y fijar un límite de subidas por día.
- Sin cuenta, ¿se puede sacar la foto (solo en el teléfono) o se pide cuenta?
- Términos de uso con la licencia de las fotos, para poder publicarlas, y texto nuevo en `/privacidad`.
- Botón "Denunciar foto" en las fotos públicas.
- Si la comunidad abierta pasa a ser central, actualizar el propósito ("lista personal/familiar") en
  `docs/README.md` y en la documentación del proyecto.
