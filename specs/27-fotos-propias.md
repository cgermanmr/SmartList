# SPEC 27 — Fotos propias

> **Estado:** Aprobado
> **Depende de:** [SPEC 17](17-imagenes-de-productos.md), [SPEC 21](21-cuenta-y-sincronizacion.md), [SPEC 26](26-cargar-precio-en-el-comercio.md)
> **Fecha:** 2026-11-22
> **Objetivo:** Sacar o elegir una foto de un producto propio, guardarla comprimida en el teléfono y, con cuenta, en un bucket privado de Supabase, y mostrarla antes que la imagen del catálogo, solo para quien la cargó.

## Por qué existe esta spec

Los productos que se crean en Cargar precio sin estar en Precios Claros (casos B y C de la
[spec 26](26-cargar-precio-en-el-comercio.md)) no tienen imagen: el catálogo de la [spec 17](17-imagenes-de-productos.md)
las busca por EAN y un producto sin código o con un código desconocido queda con la inicial. Tampoco hay forma de
corregir una imagen del catálogo que no corresponde. `Product.image` está reservado para una foto propia desde la
spec 17, pero nunca se usó.

Las fotos son **privadas**, como los precios: las ve solo quien las cargó, en todos sus teléfonos. Compartirlas con
la comunidad necesita una supervisión (foto que no es el producto, contenido inapropiado), que es la
[spec 28](../docs/features/08-consulta-y-aportes.md). Hasta entonces la app dice **"Solo la ves vos"**: no promete
una supervisión que todavía no existe (como el aviso de guardado de la spec 26).

## Alcance

**Incluye:**

- Una foto por producto propio, opcional: **Agregar foto**, **Cambiar** y **Quitar**.
- Dónde se agrega: el formulario de producto nuevo de **Cargar precio** (casos B y C), la pestaña **Agregar
  producto** y el **detalle del producto** (cualquier producto propio, también los que tienen imagen del catálogo).
- Un solo botón que abre el selector del sistema (`<input type="file" accept="image/*">`): en el celular ofrece
  cámara o galería.
- Compresión en el teléfono: JPEG de 800 px de lado mayor y hasta 200 KB, sin EXIF (ni ubicación ni modelo de
  cámara).
- Guardado en **IndexedDB**, con o sin cuenta.
- Con cuenta: subida a un bucket **privado** de Supabase Storage (`fotos-propias/<user_id>/<foto>.jpg`); en otro
  teléfono de la misma cuenta se baja la primera vez que se muestra y queda guardada.
- Sin cuenta: la foto queda en el teléfono y se sube al iniciar sesión, como los precios.
- La foto propia se muestra **antes** que la imagen del catálogo en todas las pantallas que muestran un producto
  propio. Quitarla vuelve a la del catálogo (o a la inicial).
- Leyenda **"Solo la ves vos"** junto a la foto en el formulario y en el detalle.
- Cerrar sesión borra las fotos del teléfono; **Borrar mi cuenta** borra también las del bucket.
- Texto nuevo en `/privacidad`.

**Fuera de alcance:**

- Supervisión automática y manual, bucket público y fotos de la comunidad (spec 28). La leyenda de supervisión
  llega con ella.
- Compartir fotos con un grupo (spec 22).
- Varias fotos por producto, recortar o rotar la foto en la app.
- Foto en el caso A de Cargar precio (producto del catálogo): ya tiene imagen o se agrega después desde el detalle.
- Fotos de precios, tickets o góndolas.
- Un límite de fotos por usuario (ver *Riesgos*).

## Reglas

### Elegir la foto

- Botón **Agregar foto** (ícono `Camera`, `.btn-secondary`) que abre un `<input type="file" accept="image/*">`
  oculto, sin `capture`: el sistema ofrece sacar una foto o elegir una de la galería.
- Mientras se comprime: "Preparando la foto…" (`role="status"`), el botón deshabilitado.
- Con la foto lista: la vista previa de 64 px, **Cambiar** (abre el selector otra vez), **Quitar** y debajo
  "Solo la ves vos.".
- Un archivo que no se puede leer (no es una imagen, formato que el navegador no decodifica) → "No se pudo leer la
  imagen. Probá con otra." (`role="alert"`) y queda la foto anterior, si había.

### Compresión (`compressPhoto`)

1. Se decodifica con `createImageBitmap(file, { imageOrientation: 'from-image' })`: la orientación del EXIF se
   aplica antes de dibujar.
2. Se dibuja en un canvas con el lado mayor en **800 px** como máximo (`fitWithin`; una foto más chica no se agranda).
3. Se exporta como `image/jpeg` con calidad 0,82; si pasa de **200 KB**, se prueba con 0,7, 0,6 y 0,5. Si con 0,5
   sigue pasando, se acepta hasta **300 KB** (el límite del bucket); si no, se achica el lado mayor a 600 px y se
   repite.
4. Volver a codificar en el canvas descarta todo el EXIF (ubicación, fecha, cámara).

### Formularios (Cargar precio B y C, Agregar producto)

- Campo **Foto (opcional)** después de Marca.
- La foto vive en memoria (un `Blob`) hasta guardar: nada se escribe en IndexedDB antes. Cambiar de producto o
  "Cambiar" en Cargar precio la descarta.
- Al guardar: primero la foto en IndexedDB y después el producto con `photo`. Si IndexedDB falla, se guarda el
  producto **sin foto** y el aviso suma "No se pudo guardar la foto.".
- Después de guardar, el campo queda vacío (en Cargar precio, junto con producto y monto).

### Detalle del producto

- Debajo de la imagen de 160 px:
  - Con foto propia: "Tu foto · Solo la ves vos", **Cambiar foto** y **Quitar foto**. Quitar pide confirmación
    (`confirm('¿Quitar la foto?')`, como "Quitar vínculo").
  - Sin foto propia: **Agregar foto**, y la atribución de Open Food Facts si la imagen es de ahí (como hoy).
- Cambiar o agregar guarda enseguida (no hay botón Guardar en el detalle).

### Qué imagen se muestra

`productImageSrc(product, photoUrl, catalogUrl)`, en este orden:

1. La foto propia (`product.photo`), como object URL del `Blob` de IndexedDB.
2. `product.image` (reservado; hoy ningún producto lo tiene).
3. La imagen del catálogo por EAN (spec 17).
4. Sin ninguna, el cuadro con la inicial (`ProductImage`).

Aplica en Buscar, la oferta del lector, el detalle, el carrito, el historial y los resultados propios de Cargar
precio. Los resultados del catálogo (`SepaResults`) no cambian: no son productos propios.

### Guardado y sincronización

- **Cada foto nueva tiene un `id` nuevo** (`uniqueId()`): cambiar la foto no pisa un archivo, crea otro y borra el
  anterior. Así una caché vieja nunca muestra la foto equivocada.
- IndexedDB: base `el-changuito`, almacén `photos`, una entrada por foto: `{ id, blob, uploaded }`. Almacén
  `photo_deletes`: los `id` de fotos de la cuenta que hay que borrar del bucket.
- **Sin cuenta en el teléfono** (`preciolocal_sync` sin `userId`): las fotos quedan con `uploaded: false`.
- **Con cuenta y sesión**, en cada vuelta de `syncNow`, después de subir y bajar los registros:
  1. sube las fotos con `uploaded: false` que usa algún producto a `fotos-propias/<userId>/<id>.jpg` y las marca
     `uploaded: true`;
  2. borra del bucket las de `photo_deletes`;
  3. borra del teléfono las fotos que ya no usa ningún producto (`unreferencedPhotos`): las reemplazadas o quitadas
     acá y las que se cambiaron en otro teléfono.
- Un error de Storage no frena la sincronización de los registros: la foto se reintenta en la vuelta siguiente.
- **Quitar o cambiar** en este teléfono: el `id` viejo pasa a `photo_deletes` si ya estaba subido; si no, solo se
  borra del teléfono. Otro teléfono, al recibir el producto sin esa foto, solo borra su copia (el borrado del
  bucket lo hace quien la quitó).
- **Otro teléfono de la misma cuenta**: un producto con `photo` cuyo `id` no está en IndexedDB se baja al
  mostrarlo (URL firmada de 60 s, `fetch`, y se guarda con `uploaded: true`). Mientras tanto, la imagen del catálogo
  o la inicial. Si falla (sin conexión, o la foto todavía no se subió desde el otro teléfono), no se guarda el
  fallo: se reintenta la próxima vez que se muestre. Sin sesión no se pide.
- **Cerrar sesión** (`signOutEverywhere`, y el caso de otro usuario que el guardado): vacía los dos almacenes.
- **Borrar mi cuenta**: antes de `delete_my_account`, se listan y se borran todos los archivos de
  `fotos-propias/<userId>/`. Si eso falla, la cuenta **no** se borra y aparece el error de siempre ("No se pudo
  borrar la cuenta"): así no quedan fotos sin dueño. Después, se vacían los almacenes.
- Una cuenta borrada desde otro dispositivo (spec 21: los datos quedan sin cuenta): las fotos quedan en el teléfono
  con `uploaded: false`, para subirse si se entra con otra cuenta.

## Modelo de datos

```typescript
// src/lib/models.ts
/** Foto propia de un producto (spec 27): el archivo está en IndexedDB y, con cuenta, en el bucket privado */
export interface ProductPhoto {
  id: string;        // uniqueId(); cambia con cada foto nueva
  takenAt: string;   // ISO, al elegirla
}

export interface Product {
  // … lo de hoy
  image?: string;         // reservado (spec 17); no se usa para la foto propia
  photo?: ProductPhoto;   // nuevo
}
```

- Opcional: los productos guardados antes siguen sirviendo y no hace falta migrar `preciolocal_products`.
- `photo` viaja dentro del JSON del producto en `user_records` (spec 21): no hay tabla nueva. Una versión vieja de la
  app conserva el campo al editar el producto (las acciones copian con spread).

```typescript
// src/lib/photo-store.ts — IndexedDB, sin dependencias
interface StoredPhoto { id: string; blob: Blob; uploaded: boolean }

putPhoto(photo: StoredPhoto): Promise<void>;
getPhoto(id: string): Promise<StoredPhoto | undefined>;
listPhotos(): Promise<StoredPhoto[]>;
deletePhoto(id: string): Promise<void>;
markUploaded(id: string): Promise<void>;
queueRemoteDelete(id: string): Promise<void>;
takeRemoteDeletes(): Promise<string[]>;
clearPhotos(): Promise<void>;   // los dos almacenes
```

Funciones puras nuevas, con tests:

```typescript
// src/lib/photo.ts
export const PHOTO_MAX_SIDE = 800;
export const PHOTO_TARGET_BYTES = 200 * 1024;
export const PHOTO_LIMIT_BYTES = 300 * 1024;   // igual al límite del bucket

/** Tamaño que entra en `max` px de lado mayor, sin agrandar */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number };

/** Ruta del archivo en el bucket */
export function photoPath(userId: string, photoId: string): string;   // "<userId>/<photoId>.jpg"

/** Fotos guardadas que ya no usa ningún producto */
export function unreferencedPhotos(products: Product[], storedIds: string[]): string[];

/** Qué imagen se muestra: foto propia, image, catálogo */
export function productImageSrc(product: Product, photoUrl?: string, catalogUrl?: string): string | undefined;

/** Comprime en el navegador (canvas); rechaza si no se puede decodificar */
export function compressPhoto(file: Blob): Promise<Blob>;
```

### Supabase (migración nueva `supabase/migrations/<fecha>_fotos_propias.sql`)

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-propias', 'fotos-propias', false, 307200, array['image/jpeg']);

-- Cada usuario ve, sube y borra solo su carpeta (<user_id>/…); sin update: cada foto nueva es un archivo nuevo
create policy "fotos propias: leer" on storage.objects for select to authenticated
  using (bucket_id = 'fotos-propias' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "fotos propias: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos-propias' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "fotos propias: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos-propias' and (storage.foldername(name))[1] = (select auth.uid())::text);
```

## UI/UX

```
Formulario (Cargar precio B/C, Agregar producto):
│ Foto (opcional)                       │
│ [ 📷 Agregar foto ]                   │
│                                       │
│ con foto:                             │
│ ┌────┐  Cambiar   Quitar              │
│ │ img│                                │
│ └────┘  Solo la ves vos.              │

Detalle:
│ ┌──────────┐                          │
│ │  160 px  │  Yerba                   │
│ └──────────┘  PLAYADITO · 500 g       │
│ Tu foto · Solo la ves vos             │
│ [Cambiar foto]  [Quitar foto]         │
```

- Íconos de `lucide-react` (`Camera`, `ImageOff` para Quitar), con `aria-hidden="true"`; botones de 44 px.
- El `<input type="file">` queda oculto y lo abre el botón (el botón es el que tiene el foco y el nombre accesible).
- La vista previa usa `ProductImage` (64 px en el formulario), con `alt=""`: el nombre del producto ya está al lado.
- "Preparando la foto…" y los errores junto al campo; 375 px sin scroll horizontal.
- Diseño con `/frontend-design` y `/ui-ux-pro-max` al implementar.

## Plan de implementación

1. **Modelo y funciones puras (TDD)**: `ProductPhoto` y `Product.photo` en `models.ts`; `src/lib/photo.ts` con
   `fitWithin` (vertical, horizontal, más chica que el máximo), `photoPath`, `unreferencedPhotos` y
   `productImageSrc` (los cuatro casos), con tests en `photo.test.ts`. `compressPhoto` sin test automático.
2. **Almacén en el teléfono**: `src/lib/photo-store.ts` sobre IndexedDB (dos almacenes; si IndexedDB no existe o
   falla, las funciones rechazan y la app sigue sin fotos). Verificar en el navegador: guardar, leer, listar y
   vaciar.
3. **Bucket y políticas**: migración `supabase/migrations/<fecha>_fotos_propias.sql`. **La aplica el usuario** con
   `npx supabase db push --linked`. Verificar con el MCP: el bucket existe, es privado, y un usuario no puede listar
   la carpeta de otro.
4. **Sincronización de fotos**: `src/lib/photo-sync.ts` (subir pendientes, borrar las de `photo_deletes`, limpiar
   las sin uso, bajar una foto que falta) enganchado en `syncNow` (`sync-engine.ts`), en cerrar sesión, en el
   cambio de usuario y en `deleteAccountData` (`auth.ts`: borra los archivos antes de la RPC).
5. **Mostrar la foto**: hook `useProductPhotos(products)` (`src/components/useProductPhotos.ts`: object URLs con
   caché de módulo por `id`, baja las que faltan con sesión) y `productImageSrc` en Buscar, la oferta del lector,
   el detalle, el carrito, el historial y `PriceProductPicker`.
6. **Campo de foto**: `src/components/PhotoField.tsx` (botón, input oculto, compresión, vista previa, Cambiar,
   Quitar, leyenda, errores). En `PriceProductPicker` (casos B y C) y en la pestaña Agregar producto; al guardar,
   la foto en IndexedDB antes que el producto.
7. **Detalle**: Agregar / Cambiar / Quitar foto en `ProductDetail.tsx`, con "Tu foto · Solo la ves vos" y la
   confirmación al quitar.
8. **Privacidad y docs**:
   - `/privacidad`: las fotos se guardan en el teléfono y, con cuenta, en un almacenamiento privado que solo ve
     quien las cargó; se guardan sin la ubicación ni los datos de la cámara; se borran al borrar la cuenta.
   - `CLAUDE.md`: Estructura, Modelos (`Product.photo`), Persistencia (IndexedDB), tabla de Supabase (bucket),
     Funcionalidades (Cargar, Detalle, imágenes) y Estado Actual.
   - `docs/features/08-consulta-y-aportes.md`: spec 27 hecha, la leyenda "Solo la ves vos" y el orden 27 → 22 → 23 → 28.

**A revisar (sin test automático):**

- Sacar una foto con la cámara en Android y en iPhone (incluida una foto vertical: la orientación del EXIF).
- Una foto HEIC elegida de la galería del iPhone.
- La misma cuenta en dos teléfonos: la foto aparece en el otro y, al quitarla, desaparece de los dos.
- Cargar una foto sin cuenta y después iniciar sesión: se sube.
- Sin conexión: agregar una foto y verla; al volver la señal, se sube.

## Criterios de aceptación

- [ ] En Cargar precio (caso C), elegir una foto, guardar y ver el producto con esa foto en Buscar y en el detalle.
- [ ] La pestaña Agregar producto guarda el producto con su foto.
- [ ] Desde el detalle se agrega, se cambia y se quita la foto de un producto propio; quitar pide confirmación.
- [ ] Un producto con imagen del catálogo y foto propia muestra la propia; al quitarla vuelve la del catálogo.
- [ ] La foto guardada es JPEG, de 800 px de lado mayor como máximo, de 200 KB o menos (300 KB como mucho) y sin EXIF.
- [ ] Un archivo que no es una imagen muestra "No se pudo leer la imagen. Probá con otra." y no cambia nada.
- [ ] "Solo la ves vos" aparece junto a la foto en el formulario y en el detalle.
- [ ] Elegir una foto y cambiar de producto (o "Cambiar") antes de guardar no deja nada en IndexedDB.
- [ ] Sin cuenta, la foto se guarda y se ve después de recargar la página.
- [ ] Con cuenta, la foto queda en `fotos-propias/<user_id>/<id>.jpg` y otro usuario no puede leerla.
- [ ] Cambiar la foto borra del bucket el archivo anterior.
- [ ] En otro teléfono con la misma cuenta la foto aparece y después se ve sin conexión.
- [ ] Cerrar sesión borra las fotos del teléfono.
- [ ] Borrar mi cuenta borra los archivos del bucket; si no se pueden borrar, la cuenta no se borra.
- [ ] Un producto guardado antes de esta spec (sin `photo`) se ve igual que antes.
- [ ] `/privacidad` explica dónde se guardan las fotos y que no llevan ubicación.
- [ ] 375 px sin scroll horizontal; `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.

## Decisiones

- **"Solo la ves vos"** (elegido) en lugar de "Se supervisará para compartirla con la comunidad": la supervisión es
  la spec 28. El orden del feature 08 queda 27 → 22 → 23 → 28. Descartado: adelantar la 28.
- **Sin cuenta también se puede** (elegido): la foto queda en el teléfono y se sube al iniciar sesión, como los
  precios. Descartado: pedir cuenta (cortaría el flujo de la góndola y rompería "la cuenta es optativa").
- **Desde Cargar precio (B y C), Agregar producto y el detalle** (elegido por el usuario). El caso A no lleva foto:
  ya tiene imagen o se agrega desde el detalle.
- **`Product.photo` dentro del producto** (elegido) en lugar de una tabla `product_photos`: viaja con la
  sincronización de la spec 21 sin código nuevo de push/pull. La tabla de estados de moderación es de la spec 28.
- **`photo` y no `image`**: `image` es una URL; la foto propia es un archivo en IndexedDB y en un bucket privado,
  que no tiene URL fija. `image` queda reservado como estaba.
- **Un botón "Agregar foto"** sin `capture` (elegido): el sistema ofrece cámara o galería, sin pedir permisos ni
  escribir código de cámara. Descartado: abrir la cámara directo (no deja elegir una foto sacada antes).
- **En otro teléfono se baja y se guarda** (elegido): se ve sin conexión y no se piden URLs firmadas en cada
  pantalla. Descartado: URL firmada cada vez.
- **La foto propia primero** (elegido), después la del catálogo.
- **JPEG y no WebP**: Safari no exporta WebP desde un canvas; JPEG se codifica y decodifica en todos lados.
- **800 px y 200 KB**: alcanza para la tarjeta de 160 px del detalle en pantallas de alta densidad; con 1 GB del
  plan gratis entran unas 5.000 fotos.
- **Un archivo nuevo por cada foto** (sin `update` en el bucket): evita cachés con la foto vieja y hace simple el
  borrado ("borrar el `id` anterior").
- **El borrado del bucket lo hace el teléfono que quitó la foto**; los demás solo borran su copia.
- **Borrar la cuenta borra antes los archivos**, y si falla no se borra la cuenta: Postgres no puede borrar los
  archivos de Storage desde `delete_my_account`, y una cuenta borrada sin sus fotos dejaría archivos sin dueño.
- **Sin dependencia nueva para IndexedDB**: un envoltorio propio y chico (`photo-store.ts`) alcanza para dos
  almacenes.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Safari borra el almacenamiento de un sitio no instalado tras 7 días sin uso (también `localStorage`) | Con cuenta, la foto vuelve desde el bucket; sin cuenta se pierde como el resto de los datos (ya pasa hoy) |
| Una foto HEIC del iPhone que el navegador no decodifica | Safari decodifica HEIC y el selector del iPhone suele entregar JPEG; si falla, "No se pudo leer la imagen" |
| El plan gratis de Storage (1 GB) se llena | 200 KB por foto, sin límite por usuario en esta spec; se mide antes de compartir fotos (spec 28) |
| Un producto llega a otro teléfono antes que su foto al bucket | La baja falla sin guardar el fallo y se reintenta al volver a mostrarla; mientras, el catálogo o la inicial |
| Fotos que quedan en el bucket sin producto (un teléfono que quitó la foto sin conexión y no volvió a sincronizar) | `photo_deletes` persiste en IndexedDB y se procesa en la próxima vuelta; Borrar mi cuenta limpia la carpeta entera |
| IndexedDB no disponible (modo privado de algunos navegadores) | El campo de foto muestra el error y el producto se guarda sin foto; el resto de la app no cambia |

## Qué **no** entra en esta spec

- Supervisión, bucket público y fotos de la comunidad (spec 28).
- Compartir fotos con un grupo (spec 22).
- Varias fotos por producto; recortar o rotar.
- Foto en el caso A de Cargar precio.
- Fotos de precios o tickets.
- Límite de fotos por usuario.
