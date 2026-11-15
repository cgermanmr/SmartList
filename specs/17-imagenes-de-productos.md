# SPEC 17 — Imágenes de productos

> **Estado:** Borrador
> **Depende de:** [SPEC 10](10-productos-con-codigo-de-barras.md)
> **Fecha:** 2026-11-15
> **Objetivo:** Mostrar la imagen del producto cuando existe: en los resultados del catálogo, en las tarjetas de Buscar, en el detalle y en el carrito.

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

## Alcance

**Incluye:**

- Tabla `sepa_imagenes` en Supabase con la URL de la imagen de cada EAN que tiene una.
- Script `npm run sepa:images` que la completa desde las dos fuentes, y su workflow semanal.
- `SepaProduct.image`; al agregar o vincular un producto del catálogo, la URL se copia a `Product.image`.
- Componente `ProductImage` con marcador de posición cuando no hay imagen o no carga.
- Imagen en: resultados del catálogo, tarjetas de Buscar, detalle y carrito.

**Fuera de alcance:**

- Sacar o subir una foto propia (necesita almacenamiento; Fase 2).
- Copiar las imágenes a un almacenamiento propio.
- Imágenes para productos sin código de barras.
- Otras fuentes (sitios de las cadenas).

## Modelo de datos

```sql
create table public.sepa_imagenes (
  ean        text primary key check (ean ~ '^[0-9]{13}$'),
  url        text,                    -- null = se buscó y no hay
  fuente     text check (fuente in ('off', 'preciosclaros')),
  revisado   date not null
);
-- Permisos y RLS como las demás tablas sepa_*: lectura pública, sin escritura
```

Sin clave foránea a `sepa_productos`: un producto puede faltar del catálogo unos días y la imagen no tiene que
perderse por eso.

```typescript
// src/lib/sepa.ts
export interface SepaProduct {
  // ...
  image: string | null;
}
```

`searchSepaProducts` y `getSepaProduct` traen la imagen en la misma consulta (vista `sepa_productos_img`:
`sepa_productos` con `left join sepa_imagenes`, o una segunda consulta `in('ean', …)` si la vista complica el
orden; se decide en el paso 3).

`Product.image` ya existe: no cambia el modelo ni `localStorage`.

## Script — `scripts/sepa/images.ts`

`npm run sepa:images` (con `SUPABASE_DB_URL`, como el ETL):

1. **Open Food Facts, en bloque.** Recorre el listado de productos de Argentina
   (`/api/v2/search?countries_tags_en=argentina&fields=code,image_front_small_url&page_size=100`, ~171 páginas),
   con 1 pedido por segundo y un `User-Agent` que identifica a la app (lo pide la API). Guarda `url` y
   `fuente = 'off'` para los códigos que están en `sepa_productos`.
2. **Precios Claros, de a uno.** Para los EAN sin imagen todavía, pedido `HEAD` a la URL del portal, de mayor a
   menor cantidad de banderas. Hasta **5.000 por ejecución**, 5 a la vez. `200` → guarda la URL; otro código →
   `url = null`.
3. No vuelve a revisar un EAN hasta pasados 90 días de `revisado`.
4. Termina con un resumen (revisados, con imagen por fuente, sin imagen) en la consola y en
   `GITHUB_STEP_SUMMARY`. Código de salida 1 solo si no pudo conectarse a la base.

Workflow `.github/workflows/sepa-images.yml`: semanal (domingo) y a mano; `concurrency` propia.

## Reglas

- **Prioridad de fuente:** Open Food Facts primero (imágenes más nuevas y con licencia clara); el portal completa
  lo que falta.
- **Tamaño:** de Open Food Facts se guarda la versión chica (200 px). La del portal se usa como viene.
- **Copiar al producto propio:** `formFromSepa` / `productFromForm`, `productFromSepa` (spec 15) y
  `sepaLinkChanges` copian `image`. Al **vincular**, solo si el producto no tiene imagen; al **cambiar vínculo**,
  se reemplaza; al **quitar vínculo**, la imagen queda (igual que marca y presentación).
- **`ProductImage`:** `<img>` común (no `next/image`), con `loading="lazy"`, `decoding="async"`, `width` y `height`
  fijos, `object-contain` sobre fondo blanco y `alt=""` (el nombre ya está al lado). Sin `src`, o si la carga falla
  (`onError`), muestra el marcador de posición: un cuadro `primary-50` con la inicial del nombre.
- El marcador y la imagen ocupan **el mismo espacio**: la lista no salta cuando una imagen carga o falla.
- Sin Supabase, los productos propios que ya tienen `image` la siguen mostrando.
- Atribución en el pie del detalle cuando la imagen es de Open Food Facts: "Imagen: Open Food Facts (CC-BY-SA)".
  Para saberlo alcanza con el dominio de la URL.

## UI/UX

| Dónde | Tamaño | Posición |
|---|---|---|
| Resultados del catálogo (`SepaResults`) | 48 px | A la izquierda de la descripción |
| Tarjetas de Buscar | 64 px | A la izquierda del nombre y la categoría |
| Detalle de producto | 160 px | Arriba, junto al nombre; en 375 px, centrada arriba |
| Carrito | 40 px | A la izquierda del nombre del ítem |

- Esquinas redondeadas y borde gris claro, como `.card`.
- Diseño con `/frontend-design` y `/ui-ux-pro-max` al implementar.

## Plan de implementación

1. **Migración** `sepa_imagenes` (+ vista si se usa). Verificar permisos con la clave publishable.
2. **Script + tests** de las partes puras (armado de URL, lectura de una página de Open Food Facts, elección de
   fuente). Primera ejecución local. Verificar: el resumen informa la cobertura real sobre todo el catálogo.
3. **Consulta:** `image` en `SepaProduct`, `toSepaProduct` y sus tests.
4. **`ProductImage`** y su uso en los cuatro lugares. Verificar: con imagen, sin imagen y con una URL rota.
5. **Copia a `Product.image`** al agregar, vincular y cambiar vínculo, con tests de `product-form.ts`.
6. **Workflow** semanal.
7. **Documentación.** `CLAUDE.md` (tabla, script, workflow, componente, Funcionalidades), feature 06.

## Criterios de aceptación

- [ ] `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.
- [ ] Después de la primera ejecución, `sepa_imagenes` tiene imagen para Coca-Cola (`7790895000997`) y el resumen informa cuántos productos tienen imagen.
- [ ] Buscar "coca cola" muestra la imagen en los resultados del catálogo; buscar "pañal" muestra el marcador de posición, sin íconos de imagen rota.
- [ ] Agregar un producto del catálogo con imagen la deja en la tarjeta de Buscar, el detalle y el carrito.
- [ ] Vincular un producto propio sin imagen se la agrega; quitar el vínculo no la borra.
- [ ] Con una URL de imagen rota se ve el marcador de posición y la fila no cambia de alto.
- [ ] Las imágenes fuera de la pantalla no se piden hasta desplazarse (pestaña Network).
- [ ] Los productos guardados antes de esta spec (sin `image`) se ven con el marcador, sin errores.
- [ ] Una segunda ejecución del script el mismo día no vuelve a pedir los EAN ya revisados.
- [ ] En 375 px no hay scroll horizontal.

## Decisiones

- **Sí:** resolver las imágenes en un script y guardarlas en la base. Probar en el navegador una URL por resultado llenaría la consola de errores 403 (70 % de los casos) y Open Food Facts no permite 20 consultas por búsqueda.
- **Sí:** enlazar a la imagen de origen en lugar de copiarla. Sin almacenamiento propio ni costo; el marcador de posición cubre el caso de que una deje de existir.
- **Sí:** tabla aparte de `sepa_productos`. La carga diaria no la toca y las imágenes sobreviven a un producto que desaparece unos días.
- **Sí:** `<img>` común. `next/image` pasaría cada imagen por el optimizador de Vercel (con cuota) y obliga a declarar los dominios.
- **Sí:** tope de 5.000 pedidos al portal por ejecución. Es un servidor público: el catálogo se completa en algunas semanas sin cargarlo.
- **No:** sitios de las cadenas. No tienen API pública ni licencia para reutilizar las imágenes.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Cobertura baja (ninguna imagen fuera de alimentos conocidos) | Marcador de posición cuidado; el paso 2 mide la cobertura real antes de seguir |
| El portal no publica una licencia para sus imágenes y puede cerrar el acceso | Open Food Facts va primero; si el portal deja de responder, esas filas pasan a `null` en la revisión de los 90 días |
| Imagen que no corresponde al producto (código reutilizado) | Imagen chica y secundaria; el nombre y la marca siguen siendo lo principal |
| Una imagen pesada frena la lista | `loading="lazy"`, tamaño fijo y la versión de 200 px cuando existe |
| Límite de uso de Open Food Facts | Un pedido por segundo, una vez por semana, con `User-Agent` propio |

## Lo que **no** incluye esta spec

- Foto propia del producto.
- Almacenamiento propio de imágenes.
- Productos sin código de barras.
- Imágenes de los sitios de las cadenas.
