# SPEC 17 — Imágenes de productos

> **Estado:** Implementado
> **Depende de:** [SPEC 10](10-productos-con-codigo-de-barras.md), [SPEC 12](12-precio-de-referencia-sepa.md), [SPEC 18](18-agregar-al-carrito-sin-alta.md), [SPEC 19](19-restyling-base-y-navegacion.md)
> **Fecha:** 2026-11-17
> **Objetivo:** Mostrar la imagen de cada producto con código de barras cuando existe, y un marcador con su inicial cuando no, en Buscar, el catálogo, el detalle, el carrito y el historial.

## Por qué existe esta spec

`Product` tiene el campo `image` desde el principio, pero nada lo completa ni lo muestra: la app es solo texto.
Con el catálogo SEPA (spec 10) los productos tienen código de barras, y con el código se puede buscar una imagen.

El SEPA **no trae imágenes**. Fuentes probadas el 15/11/2026 con 60 EAN del catálogo elegidos al azar (30 que
están en 8 o más cadenas y 30 que están en 1 a 3):

| Fuente | En 8+ cadenas | En 1 a 3 cadenas | Notas |
|---|---|---|---|
| Imágenes del portal Precios Claros (`https://imagenes.preciosclaros.gob.ar/productos/<ean>.jpg`) | 9 de 30 (30 %) | 0 de 30 | Archivos de 2018 a 2021; responde 403 si no existe; sin licencia publicada |
| [Open Food Facts](https://world.openfoodfacts.org) (API por código) | 9 de 15 (60 %) | 0 de 15 | 17.032 productos de Argentina; imágenes CC-BY-SA; solo alimentos y bebidas |

Conclusión: hay imagen para **una parte** de los productos conocidos (más de la mitad de los de marcas grandes) y
casi ninguna para los de una sola cadena o los que no son alimentos (los pañales de la prueba no tienen en
ninguna de las dos). La app tiene que verse bien **con y sin** imagen.

Esta versión reemplaza el borrador del 15/11/2026, escrito antes de implementar las specs 15, 16, 18 y 19. Cambia
de dónde sale la imagen de un producto propio (se busca por EAN al mostrar, no se copia al producto), suma los
lugares que aparecieron después (la oferta del lector, el historial, los buscadores de Cargar y de vincular) y
cierra la consulta que había quedado abierta (una consulta aparte, sin vista).

## Alcance

**Incluye:**

- Tabla `sepa_imagenes` en Supabase con la URL de la imagen de cada EAN que tiene una.
- Script `npm run sepa:images` que la completa desde las dos fuentes, y su workflow semanal.
- `getSepaImages(eans)` en `lib/sepa.ts` y el hook `useSepaImages(eans)`: las imágenes de todos los EAN de una
  pantalla en una sola consulta, con caché.
- Componente `ProductImage`: la imagen, o un cuadro con la inicial del nombre cuando no hay o no carga.
- Imagen en: resultados del catálogo (Buscar, Agregar producto y el modal de vincular), oferta del lector de
  Buscar, tarjetas de Buscar, detalle, carrito e historial de compras.

**Fuera de alcance:**

- Sacar o subir una foto propia (necesita almacenamiento; Fase 2). `Product.image` queda reservado para eso.
- Copiar las imágenes a un almacenamiento propio.
- Imágenes para productos sin código de barras (ven siempre el marcador).
- Otras fuentes (sitios de las cadenas).
- Imagen en el diálogo "Cambiar comercio", en las listas de comercios y en el mapa.

## Modelo de datos

```sql
-- supabase/migrations/20261117000000_sepa_imagenes.sql
create table public.sepa_imagenes (
  ean        text primary key check (ean ~ '^[0-9]{13}$'),
  url        text,                    -- null = se buscó y no hay
  fuente     text check (fuente in ('off', 'preciosclaros')),
  revisado   date not null
);
-- Permisos y RLS como las demás tablas sepa_*: grant select a anon y authenticated, política "lectura pública"
```

Sin clave foránea a `sepa_productos`: un producto puede faltar del catálogo unos días y la imagen no tiene que
perderse por eso.

```typescript
// src/lib/sepa.ts
/** URL de la imagen de cada EAN que tiene una (los que no tienen no están en el mapa). Con caché por EAN */
export function getSepaImages(eans: string[]): Promise<Map<string, string>>;
/** 'off' si la URL es de Open Food Facts (lleva atribución); pura, con tests */
export function imageSource(url: string): 'off' | 'preciosclaros';

// src/components/useSepaImages.ts
/** Imágenes de varios EAN en una sola consulta. Sin EAN, sin Supabase, mientras carga o con error: mapa vacío */
export function useSepaImages(eans: readonly (string | undefined)[]): Map<string, string>;

// src/components/ProductImage.tsx
interface ProductImageProps {
  /** URL de la imagen; sin ella (o si falla la carga) se ve el marcador */
  src?: string;
  /** Nombre del producto: de acá sale la inicial del marcador */
  name: string;
  /** Lado del cuadro, en px */
  size: 40 | 48 | 64 | 160;
}
```

**No cambian** `SepaProduct`, `Product` ni `localStorage`: la imagen no se guarda en el dispositivo. La URL que
se muestra para un producto es `product.image ?? imágenes.get(product.ean)` (hoy ningún producto tiene `image`).

## Script — `scripts/sepa/images.ts`

`npm run sepa:images` (con `SUPABASE_DB_URL`, como el ETL):

1. **Open Food Facts, del export.** Lee en streaming (sin guardarlo) el export diario de todos sus productos
   (`https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz`, ~1,5 GB comprimido, separado por
   tabulaciones), con el `User-Agent` `ElChanguito/2.0 (https://elchanguito.vercel.app)` (la API pide que la app se
   identifique). De cada fila usa `code` e `image_small_url` (200 px) y guarda `url` y `fuente = 'off'` para los
   códigos que están en `sepa_productos` (normalizados con `toGtin13`), sin filtrar por país. Hasta 3 intentos; si
   no se puede leer entero, lo leído se guarda igual y las imágenes de Open Food Facts que ya estaban no se tocan.
   *Cambio al implementar (17/11/2026):* el borrador recorría la búsqueda de la API (`/api/v2/search`, ~171 páginas).
   La API admite 10 búsquedas por minuto por IP y tiene además un límite global: a un pedido por segundo y después a
   uno cada 6,5 s devolvió 503 y la ejecución se cortó en la página 4 y en la 8. Su documentación pide usar el export
   para más de unos cientos de productos.
2. **Precios Claros, de a uno.** Para los EAN sin imagen todavía, pedido `HEAD` a la URL del portal, de mayor a
   menor cantidad de banderas. Hasta **5.000 por ejecución**, 5 a la vez. `200` → guarda la URL; otro código →
   `url = null`.
3. No vuelve a revisar un EAN hasta pasados 90 días de `revisado`.
4. Termina con un resumen (revisados, con imagen por fuente, sin imagen, pendientes) en la consola y en
   `GITHUB_STEP_SUMMARY`. Código de salida 1 solo si no pudo conectarse a la base.

Con ~75.000 productos y 5.000 por ejecución, el portal se termina de recorrer en unas 15 ejecuciones: primero los
productos que están en más cadenas. El workflow se puede correr a mano para adelantar.

Workflow `.github/workflows/sepa-images.yml` (Node 24, secret `SUPABASE_DB_URL`): semanal (domingo) y a mano;
`concurrency` propia, sin cancelar; `timeout-minutes: 60`.

## Reglas

- **Prioridad de fuente:** Open Food Facts primero (imágenes más nuevas y con licencia clara); el portal completa
  lo que falta.
- **Tamaño:** de Open Food Facts se guarda la versión chica (200 px, `image_small_url`). La del portal se usa como viene.
- **Consulta:** `getSepaImages` lee `sepa_imagenes` (`ean`, `url`, con `url` no nula) con `in('ean', …)` de a 100
  EAN y `.retry(false)`. Caché de módulo por EAN durante la sesión, igual que `getSepaPrices`: guarda también los
  "sin imagen"; si la consulta falla, no se guarda. **Una consulta por pantalla**, no una por producto.
- **`useSepaImages`:** acumula las respuestas como `useSepaReferenceLookup` (al cambiar los EAN, solo se piden los
  nuevos). Mientras carga, sin Supabase o con error devuelve el mapa sin esos EAN: se ve el marcador, sin mensaje.
- **`ProductImage`:** `<img>` común (no `next/image`), con `loading="lazy"`, `decoding="async"`,
  `referrerPolicy="no-referrer"`, `width` y `height` fijos, `object-contain` sobre fondo blanco y `alt=""` (el
  nombre ya está al lado). Sin `src`, o si la carga falla (`onError`), muestra el **marcador**: un cuadro
  `primary-50` con la inicial del nombre en Rubik (`font-display`), `primary-700`, con `aria-hidden="true"`. La
  inicial es la primera letra o número del nombre, en mayúscula; si no tiene ninguno, el cuadro va vacío.
- El marcador y la imagen ocupan **el mismo espacio**: la lista no salta cuando una imagen llega, carga o falla.
- Si cambia el `src` (otro producto en la misma fila), se olvida el fallo anterior.
- **Productos sin EAN** y **sin Supabase**: siempre el marcador. La app se ve igual de ordenada con y sin catálogo.
- **Historial:** la imagen sale del EAN del producto propio del ítem (`productId`); si el producto ya no existe,
  el marcador con la inicial de `productName`. Solo se piden las imágenes de las compras expandidas.
- **Atribución** en el detalle, debajo de la imagen, cuando es de Open Food Facts (`imageSource`): "Imagen: Open
  Food Facts (CC-BY-SA)".
- **Privacidad:** las imágenes se cargan desde el sitio de origen, así que Open Food Facts o el portal ven la IP
  del dispositivo y qué imagen pide. No viaja la dirección de la app (`no-referrer`) ni ningún otro dato.

## UI/UX

| Dónde | Tamaño | Posición |
|---|---|---|
| Resultados del catálogo (`SepaResults`: Buscar, Agregar producto, modal de vincular) | 48 px | A la izquierda de la descripción |
| Oferta del lector en Buscar | 48 px | A la izquierda de la descripción |
| Tarjetas de Buscar | 64 px | A la izquierda del nombre y la categoría |
| Detalle de producto | 160 px | Arriba, junto al nombre; en 375 px, centrada arriba |
| Carrito | 40 px | A la izquierda del nombre del ítem |
| Historial (compra expandida) | 40 px | A la izquierda del nombre del ítem |

- Esquinas `rounded-xl` y borde `gray-200`, como los inputs y botones de la spec 19; en el detalle, `rounded-2xl`.
- La inicial ocupa cerca del 45 % del lado del cuadro.
- `SepaResults` pide las imágenes de sus resultados: los tres lugares que lo usan no cambian su código.
- Diseño con `/frontend-design` y `/ui-ux-pro-max` al implementar.

## Plan de implementación

1. **Migración** `sepa_imagenes`, aplicada con `npx supabase db push --linked`. Verificar: lectura con la clave
   publishable y escritura rechazada.
2. **Script + tests** de las partes puras (armado de URL, lectura de una página de Open Food Facts, elección de
   fuente, qué EAN toca revisar). Primera ejecución local. Verificar: el resumen informa la cobertura real sobre
   todo el catálogo.
3. **Consulta:** `getSepaImages` e `imageSource` con tests (caché, "sin imagen" guardado, fallo no guardado,
   lotes de 100) y el hook `useSepaImages`.
4. **`ProductImage`** y su uso en `SepaResults` y en la oferta del lector. Verificar en `localhost`: con imagen,
   sin imagen y con una URL rota.
5. **Productos propios:** tarjetas de Buscar, detalle (con la atribución), carrito e historial. Verificar: una
   sola consulta de imágenes por pantalla (pestaña Network).
6. **Workflow** semanal.
7. **Documentación.** `CLAUDE.md` (tabla, script, workflow, componente, hook, *Arquitectura*, *Funcionalidades*,
   *Estado Actual*), [feature 07](../docs/features/07-precios-cercanos-sepa.md) y `docs/README.md`; estado de esta
   spec.

## Criterios de aceptación

- [x] `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.
- [x] Después de la primera ejecución, `sepa_imagenes` tiene imagen para Coca-Cola (`7790895000997`) y el resumen informa cuántos productos tienen imagen.
- [x] Una segunda ejecución del script el mismo día no vuelve a pedir los EAN ya revisados.
- [x] Buscar "coca cola" muestra la imagen en los resultados del catálogo; buscar "pañal" muestra el cuadro con la inicial, sin íconos de imagen rota.
- [ ] Los resultados de "Buscar en Precios Claros" en Agregar producto y en el modal de vincular muestran la imagen o el marcador.
- [ ] Leer el código de barras de un producto del catálogo con imagen la muestra en la oferta.
- [x] Un producto propio con EAN creado **antes** de esta spec muestra su imagen en la tarjeta de Buscar, el detalle y el carrito, sin volver a vincularlo.
- [x] Vincular un producto propio con el catálogo hace aparecer su imagen; quitar el vínculo la saca (vuelve el marcador).
- [ ] Una compra expandida del historial muestra la imagen de cada ítem; un ítem cuyo producto se borró muestra el marcador.
- [x] El detalle de un producto con imagen de Open Food Facts dice "Imagen: Open Food Facts (CC-BY-SA)".
- [x] Con una URL de imagen rota se ve el marcador y la fila no cambia de alto.
- [x] Cada pantalla hace una sola consulta a `sepa_imagenes`; volver a la misma búsqueda no la repite (pestaña Network).
- [x] Las imágenes fuera de la pantalla no se piden hasta desplazarse, y el pedido no lleva `Referer` (pestaña Network).
- [x] Sin las variables de Supabase, todos los productos muestran el marcador y no hay errores en consola.
- [x] `localStorage` no cambia: ninguna clave `preciolocal_*` guarda URLs de imágenes.
- [x] En 375 px no hay scroll horizontal.

## Decisiones

- **Sí:** resolver las imágenes en un script y guardarlas en la base. Probar en el navegador una URL por resultado llenaría la consola de errores 403 (70 % de los casos) y Open Food Facts no permite 20 consultas por búsqueda.
- **Sí:** buscar la imagen por EAN al mostrar, sin copiarla al producto. Cubre los productos ya creados (los de la spec 18 incluidos), toma solas las imágenes que se suman cada semana y no deja URLs vencidas en `localStorage`.
- **Sí:** una consulta aparte (`getSepaImages`) en lugar de una vista con `sepa_productos`. Sirve igual para el catálogo y para los productos propios, no toca `searchSepaProducts` ni su orden, y si falla no rompe la búsqueda.
- **Sí:** enlazar a la imagen de origen con `no-referrer` en lugar de copiarla. Sin almacenamiento propio ni costo; el sitio de origen ve la IP y la imagen pedida, que se acepta y queda documentado. El marcador cubre el caso de que una deje de existir.
- **Sí:** el export de Open Food Facts en lugar de su API de búsqueda (cambio al implementar). La búsqueda devuelve 503 por su límite global aun a un pedido cada 6,5 s; el export trae todo en una descarga y no compite con otros usuarios de la API. Cuesta ~1,5 GB de descarga por semana en Actions.
- **Sí:** las dos fuentes. El portal no publica licencia, pero aporta productos que Open Food Facts no tiene; va segundo.
- **Sí:** marcador con la inicial siempre, también sin EAN y sin Supabase. Las filas quedan alineadas y cada producto se distingue; un ícono genérico repetiría el mismo dibujo en casi toda la lista.
- **Sí:** tabla aparte de `sepa_productos`. La carga diaria no la toca y las imágenes sobreviven a un producto que desaparece unos días.
- **Sí:** `<img>` común. `next/image` pasaría cada imagen por el optimizador de Vercel (con cuota) y obliga a declarar los dominios.
- **Sí:** tope de 5.000 pedidos al portal por ejecución. Es un servidor público: el catálogo se completa en unas 15 ejecuciones sin cargarlo.
- **Sí:** imagen en el historial, la oferta del lector y los buscadores de Cargar y de vincular, que no estaban en el borrador.
- **No:** copiar la URL a `Product.image` al agregar o vincular (la versión anterior de esta spec). Dejaba sin imagen a los productos ya creados y guardaba URLs que pueden vencer. `image` queda para la foto propia de la Fase 2.
- **No:** copiar las imágenes a Supabase Storage. Más trabajo y espacio, y redistribuir las del portal sin licencia es peor que enlazarlas.
- **No:** sitios de las cadenas. No tienen API pública ni licencia para reutilizar las imágenes.
- **No:** imagen en "Cambiar comercio", las listas de comercios y el mapa. Ahí el dato es el comercio, no el producto.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Cobertura baja (ninguna imagen fuera de alimentos conocidos) | Marcador con la inicial cuidado; el paso 2 mide la cobertura real antes de seguir |
| El portal no publica una licencia para sus imágenes y puede cerrar el acceso | Open Food Facts va primero; si el portal deja de responder, esas filas pasan a `null` en la revisión de los 90 días |
| Imagen que no corresponde al producto (código reutilizado) | Imagen chica y secundaria; el nombre y la marca siguen siendo lo principal |
| Una imagen pesada frena la lista | `loading="lazy"`, tamaño fijo y la versión de 200 px cuando existe |
| Límite de uso de Open Food Facts | Se usa el export diario (lo que pide su documentación para pedidos masivos), no la API de búsqueda; una vez por semana, con `User-Agent` propio |
| Una consulta más por pantalla | Una sola por pantalla, con caché por EAN; si falla, la pantalla queda con los marcadores |
| El sitio de origen ve la IP y las imágenes que pide cada usuario | `no-referrer`; documentado en *Reglas* y en `CLAUDE.md`; si deja de ser aceptable, se copian a un almacenamiento propio sin tocar la app |
