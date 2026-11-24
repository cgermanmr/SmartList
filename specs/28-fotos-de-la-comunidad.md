# SPEC 28 — Fotos de la comunidad

> **Estado:** Postergada (24/11/2026, ver [Por qué se posterga](#por-qué-se-posterga))
> **Depende de:** [SPEC 17](17-imagenes-de-productos.md), [SPEC 21](21-cuenta-y-sincronizacion.md), [SPEC 27](27-fotos-propias.md)
> **Fecha:** 2026-11-24
> **Objetivo:** Que el autor de una foto propia de un producto con código de barras pueda compartirla, que alguien con rol de administrador la apruebe o la rechace a mano y que las aprobadas se muestren a todos los usuarios antes que la imagen del catálogo.

## Por qué se posterga

Decidido el 24/11/2026, antes de implementar nada: las fotos compartidas se retoman con los comercios adheridos
([feature 04](../docs/features/04-promociones-comercios.md)), no con los vecinos.

- **No hay quién comparta ni quién vea las fotos.** Ese día había 1 cuenta, 0 productos sincronizados y 0 fotos
  propias subidas.
- **El costo es permanente.** Publicar contenido de desconocidos obliga a revisar, responder reclamos y sacar lo
  inapropiado, además del bucket público, el rol, las funciones y el retiro.
- **Aporta poco a la consulta de precios.** El precio y el comercio ya se comparten con el grupo (specs 22 y 23).
- **Con los comercios rinde más:** cubre lo que el SEPA no tiene (pan, fiambre, verdura, comidas, promociones), hay un
  responsable identificado y la foto queda en el producto o la promoción de ese comercio, sin reemplazar la imagen del
  catálogo para todos.

Mientras tanto, la foto propia (spec 27) sigue privada: "Solo la ves vos". Si faltan imágenes del catálogo, hay una
alternativa sin moderación propia: un link "Agregar foto en Open Food Facts" en el detalle; `sepa:images` la trae
después.

De esta spec se puede reusar el rol en `app_metadata`, la cola de revisión, el bucket público y la vista
`imagenes_productos`.

## Revisión pendiente

Problemas encontrados el 24/11/2026 al revisar la spec contra el código. El texto de más abajo **no** los corrige: hay
que resolverlos antes de aprobarla.

**Rompen algo:**

1. **Otro teléfono puede retirar una foto recién compartida.** `syncNow` baja los registros y después corre
   `syncPhotos`, que puede tardar: si en el medio el teléfono A comparte, B ve la fila nueva con productos viejos y
   `sharesToWithdraw` la retira. Lo mismo si A comparte antes de subir el vínculo con el EAN. *Propuesta:* que lo decida
   la base con `user_records`: `share_photo` exige el producto sincronizado con esa foto y ese EAN (la app llama antes a
   `syncNow`) y `withdraw_unused_photos()` reemplaza a `sharesToWithdraw`. Nombre, marca y presentación se leen de
   `user_records`: no viajan desde la app ni quedan copiados.
2. **Aprobar desde una pantalla vieja puede borrar una foto publicada.** Con dos pestañas o dos administradores, el
   paso 1 borra y vuelve a subir el archivo ya aprobado; el paso 2 responde `share_not_found` y la app lo borra.
   *Propuesta:* la política de Storage no deja borrar, a nadie, un archivo que figura en `fotos_productos`, y solo deja
   subir con una fila `pendiente` para esa ruta.
3. **El retiro puede no ocurrir nunca.** Va al final de `syncPhotos`, donde no llega si falla una subida o no hay
   IndexedDB. *Propuesta:* `syncPhotoShares` aparte, llamado desde `syncNow`, con su propio `try` y antes de borrar los
   archivos privados.

**A precisar:**

4. **Vínculo cambiado sin sincronizar:** `shareState` tiene que comparar también el EAN, y compartir retirar antes lo
   anterior (hoy `share_photo` no haría nada).
5. **Contenido de la foto:** la compresión corre en el teléfono y por la API se puede subir cualquier archivo declarado
   JPEG, con EXIF. Quien revisa lo pasa por `compressPhoto`, y ve y publica ese resultado.
6. **Texto de `reemplazada`:** "hay una foto más nueva" deja de ser cierto si esa otra se retira. Mejor "Se reemplazó
   por otra foto de la comunidad".
7. **Foto sin subir:** `useProductPhotos` solo da la URL; falta definir de dónde sale `uploaded` en el detalle.
8. **Cambiar y Quitar foto:** falta decir si confirman con `ConfirmDialog` o `confirm()`. *Propuesta:* `ConfirmDialog`.
9. **Orden de despliegue:** la migración va antes que la app; sin la vista no se ve ninguna imagen del catálogo.
10. **Cola:** de a 10 y "Ver N más", no 50 fotos de una vez; "Hoy se muestra" queda viejo por la caché al aprobar.
11. **Sacar una foto publicada:** "con SQL" es vago; falta el SQL exacto y el borrado del archivo desde el panel (no
    hace falta si la decisión C es que sí).

**Decisiones abiertas:**

- **A.** Si una foto se rechazó por estar mal vinculada, ¿se puede compartir con otro EAN? Sugerido: sí (único por
  `user_id, photo_id, ean`).
- **B.** Si la foto que reemplazó a otra se retira, ¿el autor de la primera puede volver a compartirla? Sugerido: no.
- **C.** ¿Quien administra puede quitar una foto publicada desde `/admin/fotos`? Sugerido: sí, con un botón mínimo.

## Por qué existe esta spec

Desde la [spec 27](27-fotos-propias.md) cada usuario puede ponerle una foto a sus productos, pero solo la ve él ("Solo
la ves vos"). Mientras tanto la mayoría de los productos del catálogo no tiene imagen ([spec 17](17-imagenes-de-productos.md))
y no hay forma de corregir una imagen que no corresponde. Las fotos de los usuarios pueden llenar ese hueco, pero no
se pueden publicar sin mirarlas: una foto puede no ser el producto, verse mal o ser inapropiada.

El [feature 08](../docs/features/08-consulta-y-aportes.md) planeó para esta spec una moderación automática (Edge
Function con un servicio de visión), una cola manual y la publicación. Esta spec hace **la cola manual y la
publicación**: con pocos usuarios alcanza con revisar todas a mano (el feature ya lo preveía "al principio"), y evita
el primer backend con secretos, el costo por imagen y elegir el servicio. La moderación automática queda para otra
spec, que va a alimentar esta misma cola.

## Alcance

**Incluye:**

- **Compartir con la comunidad** una foto propia desde el **detalle del producto**: solo con cuenta, en un producto
  con código de barras y con la foto ya subida al bucket privado. Cada foto se confirma con un `ConfirmDialog` que
  explica qué se publica y el permiso que se da.
- **Estados que ve el autor** en el detalle: en revisión, compartida, rechazada (con el motivo) y reemplazada, y
  **Dejar de compartir**.
- **Retiro automático:** quitar la foto, cambiarla, cambiar o quitar el código de barras, borrar el producto o borrar
  la cuenta retira la foto de la revisión o borra la copia pública.
- **Revisión manual** en la página nueva `/admin/fotos`, solo para usuarios con `role = 'admin'` en `app_metadata`:
  la foto, el producto que dice el autor, el producto del catálogo y la imagen que se muestra hoy; **Aprobar** o
  **Rechazar** con uno de tres motivos.
- Link **Fotos por revisar (N)** en `/cuenta`, solo para quien administra.
- **Publicación** en un bucket público nuevo, `fotos-productos`: una foto por EAN, la última aprobada.
- **Qué imagen se muestra:** foto propia → foto de la comunidad → Open Food Facts o el portal → inicial, en todas las
  pantallas que muestran imágenes por EAN (también los resultados del catálogo). En el detalle, "Foto de la
  comunidad" debajo de la imagen.
- Hasta **10 fotos en revisión** a la vez por autor.
- Texto nuevo en `/privacidad`.

**Fuera de alcance (para otras specs):**

- Moderación automática (Edge Function, clasificador de contenido, comparación con el producto).
- **Denunciar foto** y quitar una foto ya publicada desde la app (por ahora, quien administra la quita con SQL).
- Compartir desde los formularios (Cargar precio, Agregar producto): solo el detalle.
- Fotos de productos sin código de barras: no hay cómo mostrárselas a otro usuario.
- Nombre o apodo del autor en la foto publicada.
- Notificaciones a quien administra o al autor.
- Varias fotos públicas por EAN o elegir cuál se muestra.
- Compartir fotos solo con el grupo (spec 22).
- Una pantalla para dar o sacar el rol de administrador.

## Reglas

### Compartir

- En el detalle de un producto propio con foto propia, debajo de "Tu foto · Solo la ves vos":
  - **Sin cuenta:** sin botón; nada cambia respecto de la spec 27.
  - **Sin EAN:** sin botón.
  - **Con cuenta, con EAN y la foto todavía sin subir** (`uploaded: false`): el botón **Compartir con la comunidad**
    deshabilitado y "Se puede compartir cuando termine de subirse."
  - **Con cuenta, con EAN y la foto subida:** **Compartir con la comunidad** (`.btn-secondary`, ícono `Users`).
- Tocar el botón abre un `ConfirmDialog`:
  - Título: "¿Compartir esta foto?"
  - Texto: "Alguien de El Changuito la revisa y, si corresponde al producto, la ve cualquiera que use la app, sin tu
    nombre. Le das permiso a El Changuito para mostrarla mientras la compartas. Podés dejar de compartirla cuando
    quieras."
  - Botones: **Compartir** y **Cancelar**.
- Confirmar llama a `share_photo` con el `id` de la foto, el EAN y el nombre, la marca y la presentación del producto
  propio (lo que ve quien revisa). La base comprueba que el archivo esté en `fotos-propias/<user_id>/<id>.jpg`.
- Errores junto al botón (`role="alert"`):
  - `too_many_pending`: "Tenés 10 fotos esperando revisión. Probá cuando se revisen."
  - `photo_not_uploaded`: "Se puede compartir cuando termine de subirse."
  - `already_reviewed`: "Esta foto ya se revisó. Para compartir otra, cambiala."
  - `withdrawing`: "Todavía se está retirando. Probá en un rato."
  - Sin conexión u otro: "No se pudo compartir. Revisá la conexión."
- Mientras se guarda, el botón queda deshabilitado (`aria-busy`).

### Estados del autor

El estado sale de `my_photo_shares()` para el `id` de la foto propia del producto. En el detalle reemplaza a "Solo la
ves vos":

| Estado (`status`) | Texto | Acción |
|---|---|---|
| Sin fila | "Tu foto · Solo la ves vos" | Compartir con la comunidad (según las reglas de arriba) |
| `pendiente` | "Tu foto · En revisión para compartir con la comunidad" (ícono `Clock`) | Dejar de compartir |
| `aprobada` | "Tu foto · Compartida con la comunidad" (ícono `Users`, verde) | Dejar de compartir |
| `rechazada` | "Tu foto · No se pudo compartir (<motivo>)" (ícono `CircleX`, ámbar) | Ninguna |
| `reemplazada` | "Tu foto · Ya no se muestra: hay una foto más nueva de la comunidad" | Ninguna |
| `retirada` | Igual que sin fila (la fila dura hasta que se borra el archivo público, ver *Retiro*) | Compartir con la comunidad |

- Motivos (`reason`) y su texto: `no_es_el_producto` → "no es el producto", `no_se_ve_bien` → "no se ve bien",
  `no_es_apropiada` → "no es apropiada".
- Una foto rechazada o reemplazada no se puede volver a compartir: para compartir otra hay que cambiarla.
- **Dejar de compartir** confirma con `ConfirmDialog` ("¿Dejar de compartir esta foto? Se borra de la comunidad.") y
  retira la foto (ver *Retiro*). La foto propia no cambia y el estado vuelve a "Solo la ves vos".
- "Cambiar foto" y "Quitar foto" siguen como en la spec 27; si la foto estaba compartida o en revisión, su
  confirmación suma "También se deja de compartir." (Cambiar foto hoy no confirma: con una foto compartida, pasa a
  confirmar con ese texto.)
- Los formularios (Cargar precio, Agregar producto) siguen diciendo "Solo la ves vos.": al guardar, una foto nunca está
  compartida.

### Retiro

Una fila de `photo_shares` en `pendiente` o `aprobada` se retira cuando **ningún producto propio** tiene esa foto
(`photo.id`) con ese EAN. Eso cubre quitar o cambiar la foto, cambiar o quitar el vínculo con el catálogo y borrar el
producto, en este teléfono o en otro de la misma cuenta.

- **Retirar** (`withdrawShare`), en tres pasos:
  1. `withdraw_photo(photo_id)`: la fila pasa a `retirada` y se borra la de `fotos_productos`. Desde ahí la foto no se
     muestra en ninguna pantalla nueva y ya no se puede aprobar;
  2. la app borra el archivo `<ean>/<share_id>.jpg` de `fotos-productos` (si nunca se aprobó no existe, y borrarlo no
     es un error);
  3. `forget_photo_share(photo_id)` borra la fila, solo si está `retirada`.
- Las filas `rechazada` y `reemplazada` **no se retiran ni se borran** hasta que se borra la cuenta: borrarlas
  permitiría volver a mandar a la cola una foto que ya se revisó.
- **Compartir otra vez una foto retirada:** la app termina antes los pasos 2 y 3 que hayan quedado pendientes; si no
  puede, `share_photo` responde `withdrawing`. La fila nueva tiene otro `id`, así que el archivo público también.
- **Dónde se chequea:** en cada vuelta de `syncPhotos` (spec 27), después de subir y borrar archivos, con
  `my_photo_shares()` y la función pura `sharesToWithdraw(products, shares)`. Ahí también se terminan los pasos 2 y 3
  de las filas `retirada`.
- **Dejar de compartir** retira enseguida, sin esperar la vuelta.
- Un error de Storage o de la base no cambia el estado de la sincronización: se reintenta en la vuelta siguiente
  (como las fotos de la spec 27). Hasta el paso 1 la foto sigue en la comunidad (por ejemplo, sin conexión).
- **Borrar mi cuenta:** `deleteAllRemotePhotos` retira primero (paso 1) las filas `pendiente` y `aprobada`, para que
  ninguna se apruebe mientras tanto, y borra los archivos de `fotos-productos` de las filas `retirada` y
  `reemplazada`, antes de los de `fotos-propias`. Si algo falla, la cuenta no se borra (regla de la spec 27). Después,
  `delete_my_account` borra las filas en cascada.
- **Cerrar sesión** no retira nada: la foto sigue compartida y el producto sigue en la cuenta.

### Revisión (`/admin/fotos`)

- Quien administra tiene `"role": "admin"` en `app_metadata` (lo carga a mano con SQL quien mantiene el proyecto;
  el usuario no puede cambiarlo). La app lo lee de la sesión (`session.user.app_metadata.role`) solo para mostrar el
  link y la página; la base lo controla siempre con `auth.jwt()`.
- No está en la barra de navegación. En `/cuenta`, debajo de la sección Grupo, el link **Fotos por revisar (N)** (con
  0, "Fotos por revisar" sin número), solo para quien administra.
- Estados de la página: sin Supabase, "No disponible"; sin sesión, "Entrá con tu cuenta" con **Entrar**; sin el rol,
  "No tenés acceso a esta página"; "Cargando…"; si falla, "No se pudo cargar" con **Reintentar**. Link "Cuenta" con
  flecha para volver.
- `pending_photo_shares()` devuelve las fotos `pendiente`, de la más vieja a la más nueva, hasta 50. Cada tarjeta:
  - La foto (160 px): se baja una vez con una URL firmada de 60 s y se muestra ese `Blob`, que queda en memoria para
    publicarlo. Si no se puede bajar, "No se pudo cargar la foto" y **Aprobar** deshabilitado.
  - Lo que dice el autor: nombre, marca y presentación.
  - El EAN y, si está en el catálogo, su descripción y marca (`getSepaProduct`).
  - La imagen que se muestra hoy para ese EAN (comunidad o catálogo, 64 px) o "Sin imagen".
  - La fecha en que se compartió ("Compartida el 24/11 16:05").
  - **Aprobar** (`.btn-primary`) y **Rechazar** (`.btn-secondary`).
- **Rechazar** despliega los tres motivos como botones de 44 px ("No es el producto", "No se ve bien", "No es
  apropiada") y **Cancelar**; tocar uno llama a `reject_photo_share(id, reason)`.
- **Aprobar**:
  1. borra `fotos-productos/<ean>/<share_id>.jpg`, por si quedó de un intento anterior, y sube ahí **el mismo `Blob`
     que se mostró**. No se copia el archivo del bucket privado: el autor puede borrarlo y volver a subir otro con el
     mismo nombre después de que se revisó;
  2. `approve_photo_share(id)`: la fila pasa a `aprobada`, `fotos_productos` apunta al archivo nuevo y la aprobada
     anterior de ese EAN, si había, pasa a `reemplazada`; devuelve la ruta del archivo anterior;
  3. borra el archivo anterior de `fotos-productos`.

  Si la base rechaza el paso 2, se borra el archivo del paso 1. Si no hay respuesta (sin conexión) no se borra nada,
  porque pudo haberse aprobado: se vuelve a pedir la lista antes de otro intento. Si el paso 3 falla, queda un archivo
  sin uso (ver *Riesgos*).
- Errores en la tarjeta (`role="alert"`): `share_not_found` ("El autor dejó de compartirla.", y la tarjeta sale),
  `not_admin` (la página pasa a "No tenés acceso"), sin conexión ("No se pudo guardar. Revisá la conexión.").
- Una tarjeta resuelta sale de la lista con el aviso fijo "Foto aprobada" / "Foto rechazada" (`role="status"`, 3 s).

### Qué imagen se muestra

- `getSepaImages(eans)` pasa a leer la vista `imagenes_productos` en lugar de `sepa_imagenes`: hasta **dos filas por
  EAN**, la de la comunidad (`foto`, la ruta en el bucket) y la del catálogo (`url`); `pickImages` se queda con la de la
  comunidad. Sigue siendo **una consulta** de a 100 EAN, con la misma caché de módulo (una foto aprobada aparece en la
  sesión siguiente).
- Con `foto`, la URL es la pública del bucket (`getPublicUrl`). Cada aprobación usa un archivo nuevo
  (`<share_id>.jpg`): una caché vieja del navegador nunca muestra la foto anterior.
- `productImageSrc` (spec 27) no cambia: foto propia, `product.image` y la imagen por EAN, que ahora puede ser de la
  comunidad.
- `imageSource(url)` suma `'comunidad'` para las URLs de `fotos-productos`. En el detalle, sin foto propia: "Foto de
  la comunidad" (en lugar de la atribución de Open Food Facts).
- `ProductImage` no cambia: un archivo borrado (retirado entre la consulta y la carga) cae a la inicial con `onError`.

## Modelo de datos

No hay datos nuevos en el teléfono: el estado de las fotos compartidas vive en la base y se consulta.

```typescript
// src/lib/photo-share.ts
export type PhotoShareStatus = 'pendiente' | 'aprobada' | 'rechazada' | 'reemplazada' | 'retirada';
export type PhotoRejectReason = 'no_es_el_producto' | 'no_se_ve_bien' | 'no_es_apropiada';

/** Una foto propia compartida (my_photo_shares) */
export interface PhotoShare {
  id: string;                 // uuid de photo_shares
  photoId: string;
  ean: string;
  status: PhotoShareStatus;
  reason: PhotoRejectReason | null;
}

/** Una foto en la cola de revisión (pending_photo_shares) */
export interface PendingPhotoShare {
  id: string;                 // uuid de photo_shares
  userId: string;
  photoId: string;
  ean: string;
  productName: string;
  brand: string | null;
  size: string | null;        // "500 g", armado con formatSize al compartir
  createdAt: string;
}

// Funciones puras, con tests
export function shareFromRow(row: unknown): PhotoShare | null;
export function pendingShareFromRow(row: unknown): PendingPhotoShare | null;
/** Ruta del archivo público: "<ean>/<id>.jpg" */
export function publicPhotoPath(share: { ean: string; id: string }): string;
/** Las pendientes y aprobadas que ningún producto usa con ese photo.id y ese EAN */
export function sharesToWithdraw(products: Product[], shares: PhotoShare[]): PhotoShare[];
/** Qué ve el autor en el detalle */
export function shareState(product: Product, share: PhotoShare | undefined, uploaded: boolean, signedIn: boolean):
  'none' | 'not_uploaded' | 'can_share' | Exclude<PhotoShareStatus, 'retirada'>;   // retirada → can_share
export function rejectReasonLabel(reason: PhotoRejectReason): string;
export function photoShareErrorMessage(error: unknown): string;
export function isAdmin(user: { app_metadata?: Record<string, unknown> } | null): boolean;

// src/lib/sepa.ts
export interface ProductImageRow { ean: string; foto: string | null; url: string | null }
/** Una imagen por EAN: la de la comunidad antes que la del catálogo. publicUrl arma la URL del bucket */
export function pickImages(rows: ProductImageRow[], publicUrl: (path: string) => string): Map<string, string>;
```

`AccountUser` (`src/lib/auth.ts`) suma `admin: boolean`, que `useAuth` completa con `isAdmin(session.user)`.

Llamadas (en `photo-share.ts`): `sharePhoto`, `withdrawShare`, `fetchMyPhotoShares`, `fetchPendingPhotoShares`,
`approvePhotoShare` (los tres pasos), `rejectPhotoShare`.

### Supabase (migración nueva `supabase/migrations/<fecha>_fotos_comunidad.sql`)

```sql
-- Fotos compartidas: una fila por foto propia compartida
create table public.photo_shares (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  photo_id     text not null check (photo_id ~ '^[A-Za-z0-9]{1,64}$'),   -- uniqueId()
  ean          text not null check (ean ~ '^[0-9]{13}$'),
  product_name text not null check (char_length(product_name) between 1 and 120),
  brand        text check (char_length(brand) <= 80),
  size         text check (char_length(size) <= 30),
  status       text not null default 'pendiente'
               check (status in ('pendiente', 'aprobada', 'rechazada', 'reemplazada', 'retirada')),
  reason       text check (reason in ('no_es_el_producto', 'no_se_ve_bien', 'no_es_apropiada')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  unique (user_id, photo_id)
);
-- RLS sin políticas ni permisos: solo las funciones

-- La foto pública de cada EAN (la última aprobada); sin user_id: lectura pública
create table public.fotos_productos (
  ean         text primary key check (ean ~ '^[0-9]{13}$'),
  share_id    uuid not null unique references public.photo_shares (id) on delete cascade,
  path        text not null unique,      -- "<ean>/<share_id>.jpg"
  approved_at timestamptz not null default now()
);
-- grant select a anon y authenticated, política de lectura pública

-- Lo que lee la app: hasta dos filas por EAN. union all y no un join: así el filtro por ean usa los dos índices
create view public.imagenes_productos with (security_invoker = true) as
  select ean, path as foto, null::text as url from public.fotos_productos
  union all
  select ean, null::text, url from public.sepa_imagenes where url is not null;
-- grant select a anon y authenticated

-- Reglas que usan las políticas de Storage: security definer, porque nadie tiene permisos sobre photo_shares.
-- En un esquema que la API no expone
create schema private;
grant usage on schema private to authenticated;
-- private.is_photo_admin(): el claim del JWT
-- private.can_review_photo(p_name): administra y hay una fila pendiente de '<user_id>/<photo_id>.jpg'
-- private.owns_public_photo(p_name): hay una fila propia de '<ean>/<id>.jpg' en aprobada, reemplazada o retirada
-- las tres con search_path = '', execute solo para authenticated
```

- **Bucket público** `fotos-productos`: `public = true`, `file_size_limit` 307200, `allowed_mime_types`
  `image/jpeg`. Políticas en `storage.objects`:
  - insertar: solo quien administra (`private.is_photo_admin()`);
  - leer y borrar: quien administra y el autor (`private.owns_public_photo(name)`). Storage pide permiso de lectura
    para borrar, aunque el bucket sea público. Nadie más puede listar el bucket; las URLs públicas no pasan por estas
    políticas;
  - sin `update`: un archivo no se pisa.
- **Bucket privado** `fotos-propias` (spec 27): una política de lectura más, `private.can_review_photo(name)`: quien
  administra ve **solo** los archivos con una fila `pendiente` (las demás fotos privadas siguen sin verse).
- "Quien administra" es `(select auth.jwt()) -> 'app_metadata' ->> 'role' = 'admin'`, en `private.is_photo_admin()`,
  que también usan las funciones.
- Funciones `security definer` con `search_path = ''`, que validan con `auth.uid()` y levantan un código (como las de
  la spec 22):

| Función | Quién | Qué hace | Códigos |
|---|---|---|---|
| `share_photo(p_photo_id, p_ean, p_name, p_brand, p_size)` | autor | Inserta la fila `pendiente`, si el archivo existe en `fotos-propias/<uid>/<id>.jpg` (consulta a `storage.objects`). Recorta los textos al máximo de la columna. Si ya está `pendiente` o `aprobada` no hace nada. Un bloqueo por usuario (`pg_advisory_xact_lock`) hace cumplir el límite con llamadas a la vez | `photo_not_uploaded`, `too_many_pending` (10), `already_reviewed` (`rechazada` o `reemplazada`), `withdrawing` (`retirada`), `invalid_share` |
| `withdraw_photo(p_photo_id)` | autor | Una fila propia `pendiente` o `aprobada` pasa a `retirada` y se borra la de `fotos_productos` | — (en otro estado o sin fila, no hace nada) |
| `forget_photo_share(p_photo_id)` | autor | Borra la fila propia, solo si está `retirada` | — |
| `my_photo_shares()` | autor | `id`, `photo_id`, `ean`, `status`, `reason` de las propias | — |
| `pending_photo_shares()` | admin | Las `pendiente`, de la más vieja, hasta 50 | `not_admin` |
| `pending_photo_count()` | admin | Cantidad de `pendiente` (para el link de `/cuenta`) | `not_admin` |
| `approve_photo_share(p_id)` | admin | Con la fila bloqueada (`for update`) y un bloqueo por EAN: `aprobada`, `decided_at`; upsert en `fotos_productos`; la anterior del EAN a `reemplazada`; devuelve su `path` | `not_admin`, `share_not_found` (no existe o no está `pendiente`), `photo_not_uploaded` (falta el archivo público) |
| `reject_photo_share(p_id, p_reason)` | admin | `rechazada`, `reason`, `decided_at` | `not_admin`, `share_not_found`, `invalid_reason` |

- Postgres no borra archivos de Storage (`storage.objects` está protegido): los archivos los borra la app, y las
  funciones solo tocan filas.

## UI/UX

```
Detalle (foto propia, con cuenta y EAN):
│ ┌──────────┐                                  │
│ │  160 px  │  Yerba                           │
│ └──────────┘  PLAYADITO · 500 g · EAN …       │
│ Tu foto · Solo la ves vos                     │
│ [Cambiar foto]  [Quitar foto]                 │
│ [ 👥 Compartir con la comunidad ]             │

en revisión:
│ 🕒 Tu foto · En revisión para compartir con   │
│    la comunidad                               │
│ [Cambiar foto] [Quitar foto] [Dejar de compartir] │

Detalle (sin foto propia, con foto de la comunidad):
│ ┌──────────┐                                  │
│ │  160 px  │  Yerba                           │
│ └──────────┘                                  │
│ Foto de la comunidad                          │
│ [ 📷 Agregar foto ]                           │

/admin/fotos:
│ ← Cuenta                                      │
│ Fotos por revisar (3)                         │
│ ┌───────────────────────────────────────────┐ │
│ │ ┌────────┐  Dice: Yerba                   │ │
│ │ │ 160 px │  PLAYADITO · 500 g             │ │
│ │ └────────┘  EAN 7790387000208             │ │
│ │ Catálogo: YERBA MATE PLAYADITO 500 GR     │ │
│ │ Hoy se muestra: [64 px] o "Sin imagen"    │ │
│ │ Compartida el 24/11 16:05                 │ │
│ │ [ Aprobar ]  [ Rechazar ]                 │ │
│ └───────────────────────────────────────────┘ │
```

- Íconos de `lucide-react` con `aria-hidden="true"`; botones de 44 px; los estados con ícono y texto (nunca solo
  color).
- En `/admin/fotos` las tarjetas van en una columna en el celular y en `md:grid-cols-2` desde `md`.
- La foto de la tarjeta lleva `alt` con lo que dice el autor ("Foto compartida de Yerba PLAYADITO 500 g"): ahí la
  imagen es el contenido que se juzga.
- 375 px sin scroll horizontal.
- Diseño con `/frontend-design` y `/ui-ux-pro-max` al implementar.

## Plan de implementación

1. **Funciones puras (TDD)**: `src/lib/photo-share.ts` con los tipos, `shareFromRow`, `pendingShareFromRow`,
   `sharesToWithdraw` (foto cambiada, EAN cambiado, producto borrado, foto en uso; las rechazadas y
   reemplazadas no), `publicPhotoPath`, `shareState` (los siete resultados y `retirada`),
   `rejectReasonLabel`, `photoShareErrorMessage` e `isAdmin`, con tests en `photo-share.test.ts`.
   `imageSource` con `'comunidad'` y `pickImages` (solo catálogo, solo comunidad, las dos), con tests en
   `sepa.test.ts`.
2. **Base y Storage**: migración `supabase/migrations/<fecha>_fotos_comunidad.sql` (tablas, vista, bucket,
   políticas y funciones). **La aplica el usuario** con `npx supabase db push --linked` y se da el rol a la cuenta de
   quien revisa (`update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where id = …`;
   vale desde el próximo token: cerrar sesión y volver a entrar). Verificar con el MCP: el bucket es público, un
   usuario sin rol no puede insertar en él, ni leer la foto privada de otro aunque esté compartida, ni llamar a
   `pending_photo_shares`; el autor puede borrar su archivo público y
   no el de otro; quien administra no lee una foto sin fila `pendiente`; `explain` de la vista usa los dos índices;
   `get_advisors` sin avisos nuevos.
3. **Imágenes por EAN**: `getSepaImages` lee `imagenes_productos` y arma la URL pública de `foto`; atribución "Foto de
   la comunidad" en el detalle. Sin fotos aprobadas, todo se ve igual que antes.
4. **Compartir y estados del autor**: llamadas de `photo-share.ts`, hook `usePhotoShares()`
   (`src/components/usePhotoShares.ts`: `my_photo_shares` con sesión, `refresh` después de compartir, retirar o cada
   vuelta de sincronización) y la sección del detalle (`ProductDetail.tsx`): botón, `ConfirmDialog`, estados, Dejar
   de compartir y la confirmación de Cambiar / Quitar foto.
5. **Retiro automático**: `sharesToWithdraw` + `withdrawShare` (tres pasos, y los que quedaron a medias) en
   `syncPhotos` (`photo-sync.ts`); retiro y archivos públicos en `deleteAllRemotePhotos`.
6. **Revisión**: `src/app/admin/fotos/page.tsx` (estados, tarjetas, Aprobar en tres pasos, Rechazar con motivos,
   avisos) y el link **Fotos por revisar (N)** en `/cuenta`.
7. **Privacidad y docs**:
   - `/privacidad`, sección *Fotos de tus productos*: compartir es optativo y foto por foto; alguien de El Changuito
     revisa la foto antes de publicarla; la publicada la ve cualquiera, sin nombre; se borra al dejar de compartirla,
     al quitarla o cambiarla y al borrar la cuenta (puede tardar hasta una hora en dejar de verse).
   - `CLAUDE.md`: Estructura (`photo-share.ts`, `usePhotoShares.ts`, `admin/fotos`, migración), Arquitectura
     (*Fotos de la comunidad*), Imágenes de productos (vista y orden), tablas y buckets de Supabase, Rutas,
     Funcionalidades (detalle, cuenta, admin) y Estado Actual.
   - `docs/features/08-consulta-y-aportes.md` y `docs/roadmap.md`: spec 28 hecha con revisión manual; la moderación
     automática queda como spec futura que alimenta la misma cola.

**A revisar (sin test automático):**

- Compartir desde un teléfono, aprobar desde otro con el rol, y ver la foto en un tercer usuario en Buscar (propio y
  catálogo), la oferta del lector, el carrito y el detalle.
- Quitar la foto desde otro teléfono de la cuenta del autor: después de su próxima sincronización, la foto pública ya
  no está.
- Aprobar dos fotos del mismo EAN: se ve la última; la primera dice "Ya no se muestra…" y su archivo ya no existe.
- Borrar la cuenta de un autor con una foto aprobada: el archivo público desaparece.

## Criterios de aceptación

- [ ] En el detalle de un producto propio con EAN, foto subida y cuenta, aparece **Compartir con la comunidad**;
      sin cuenta o sin EAN, no.
- [ ] Con la foto todavía sin subir, el botón está deshabilitado con "Se puede compartir cuando termine de subirse."
- [ ] Compartir pide confirmación con el texto del permiso y, al aceptar, el estado pasa a "En revisión para
      compartir con la comunidad".
- [ ] Con 10 fotos en revisión, compartir otra muestra "Tenés 10 fotos esperando revisión. Probá cuando se revisen."
- [ ] Un usuario sin el rol que abre `/admin/fotos` ve "No tenés acceso a esta página" y `pending_photo_shares`
      responde `not_admin`.
- [ ] Un usuario sin el rol no puede leer la foto privada de otro usuario, aunque esté en revisión.
- [ ] Quien administra ve el link **Fotos por revisar (N)** en `/cuenta` con la cantidad correcta; los demás, no.
- [ ] En `/admin/fotos` cada tarjeta muestra la foto, lo que dice el autor, el EAN, el producto del catálogo y la
      imagen de hoy.
- [ ] Aprobar publica la foto en `fotos-productos/<ean>/<share_id>.jpg` y, en la sesión siguiente, otro usuario la ve
      para ese EAN antes que la imagen de Open Food Facts o del portal, también en los resultados del catálogo.
- [ ] El detalle de un producto con foto de la comunidad (y sin foto propia) dice "Foto de la comunidad".
- [ ] El autor de una foto aprobada ve "Compartida con la comunidad"; el de una rechazada, "No se pudo compartir
      (no es el producto)" (o el motivo elegido), sin botón para volver a compartirla.
- [ ] Si el autor reemplaza su archivo privado por otro con el mismo nombre después de que se cargó la tarjeta, se
      publica la foto que se mostró.
- [ ] Una foto rechazada o reemplazada no vuelve a la cola: después de `withdraw_photo` y `forget_photo_share`,
      `share_photo` sigue respondiendo `already_reviewed`.
- [ ] Aprobar una foto que el autor acaba de retirar muestra "El autor dejó de compartirla." y no deja un archivo
      público.
- [ ] Consultar `imagenes_productos` por EAN no recorre `sepa_imagenes` entera (`explain`).
- [ ] Aprobar una segunda foto del mismo EAN la muestra en lugar de la primera, borra el archivo anterior y el autor
      de la primera ve "Ya no se muestra: hay una foto más nueva de la comunidad".
- [ ] **Dejar de compartir** pide confirmación, borra el archivo público y el estado vuelve a "Solo la ves vos".
- [ ] Quitar o cambiar una foto compartida avisa "También se deja de compartir." y, tras la sincronización, la copia
      pública ya no existe.
- [ ] Quitar el vínculo con el catálogo de un producto con foto compartida la retira en la sincronización siguiente.
- [ ] Borrar la cuenta de un autor borra sus archivos de `fotos-productos` y sus filas de `photo_shares`.
- [ ] La foto pública y `fotos_productos` no exponen el `user_id`, el nombre ni el mail del autor.
- [ ] Sin fotos aprobadas, las imágenes de la app se ven igual que antes de esta spec.
- [ ] `/privacidad` explica qué se publica al compartir, quién lo revisa y cuándo se borra.
- [ ] 375 px sin scroll horizontal; `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.

## Decisiones

- **Revisión manual y publicación en esta spec; la moderación automática, en otra** (elegido por el usuario). Con
  pocos usuarios alcanza con revisar todas; evita el primer backend con secretos, el costo por imagen y elegir entre
  Cloud Vision, Rekognition u omni-moderation. La spec futura deja en la misma cola solo las dudosas. Descartado:
  todo junto, y solo automática sin revisión.
- **El autor elige, foto por foto** (elegido por el usuario), con un `ConfirmDialog` cada vez. Nada se publica sin
  un toque explícito, y no hay aceptación que guardar. Descartado: mandar sola a revisión toda foto con EAN, y un
  interruptor general "Compartir mis fotos".
- **Solo desde el detalle** (elegido por el usuario): en la góndola no se frena para leer un permiso, y la foto
  tiene que estar subida antes de compartirla. Descartado: una casilla en los formularios.
- **Permiso para mostrarla mientras se comparta, no CC BY-SA** (elegido por el usuario): CC BY-SA es irrevocable y
  chocaría con borrar la copia pública al retirarla.
- **Retirar borra siempre la copia pública** (elegido por el usuario): quitar o cambiar la foto, cambiar el vínculo,
  borrar el producto, dejar de compartir y borrar la cuenta. Coherente con `/privacidad`: lo tuyo se va con tu
  cuenta. Descartado: que la foto quede publicada (licencia cedida).
- **Cambiar una foto compartida no comparte la nueva** (elegido por el usuario): cada foto publicada la eligió el
  autor y la vio quien revisa.
- **Comunidad antes que el catálogo** (elegido por el usuario, como el feature 08): permite corregir una imagen del
  catálogo que no corresponde (motivo de la spec 27). Descartado: usarla solo donde no hay imagen.
- **Una foto pública por EAN, la última aprobada** (elegido por el usuario): quien revisa ve la de hoy al lado y
  decide si la nueva es mejor. Descartado: no aceptar más fotos para un EAN con foto, y guardar todas.
- **Anónima** (elegido por el usuario): "Foto de la comunidad", sin nombre ni apodo; `fotos_productos` no tiene
  `user_id`. Los apodos son de los grupos.
- **Rol en `app_metadata`** (elegido por el usuario): viaja en el JWT, las políticas de Storage lo leen sin una
  consulta, y el usuario no puede cambiarlo (`user_metadata` sí). Descartado: una tabla de administradores.
- **Tres motivos fijos de rechazo** (elegido por el usuario): sin texto libre que también habría que moderar.
- **Hasta 10 en revisión por autor** (elegido por el usuario): protege la cola manual sin limitar a quien comparte
  de a poco. Descartado: límite por día y sin límite.
- **Quien revisa lee la foto del bucket privado, solo si está en revisión** (elegido): no hace falta subir otra
  copia para revisar, y las fotos que no se compartieron siguen sin verse. La política de lectura de quien
  administra se limita a las filas `pendiente`.
- **La app de quien revisa sube los mismos bytes que mostró** y no una Edge Function: no hay secretos ni backend
  nuevo. El costo es que subir y aprobar no son atómicos (ver *Riesgos*). Descartado: `storage.copy` entre buckets,
  porque copia lo que haya en el bucket privado en ese momento, que puede no ser lo revisado.
- **Retirar en tres pasos, con el estado `retirada`**: la foto deja de mostrarse antes de borrar el archivo, y lo que
  quede a medias se retoma. Descartado: borrar el archivo y después la fila (una aprobación en el medio dejaría un
  archivo público que el autor ya no puede borrar).
- **Las funciones de las políticas van en el esquema `private`**: `photo_shares` no da permisos a nadie y una
  política que la consultara directo fallaría.
- **Un archivo nuevo por aprobación** (`<ean>/<share_id>.jpg`): una URL pública nunca cambia de contenido, así que
  ninguna caché muestra una foto retirada o reemplazada por otra.
- **Una vista `imagenes_productos`** con `union all` en lugar de una segunda consulta: se mantiene "una consulta por
  pantalla" de la spec 17. Descartado: `full join`, que recorre `sepa_imagenes` entera (medido el 24/11/2026: 422 ms
  contra 4 ms). `security_invoker` para que respete la RLS de las dos tablas.
- **El retiro se decide comparando productos y filas en cada sincronización** (`sharesToWithdraw`), y no con un
  disparador en cada acción: cubre en una sola regla quitar, cambiar, desvincular y borrar, también desde otro
  teléfono o sin conexión.
- **Las fotos rechazadas no se pueden volver a compartir**: evita que vuelvan a la cola sin cambios. Para otra foto,
  se cambia.
- **Los formularios siguen diciendo "Solo la ves vos."**: el feature 08 preveía cambiar la leyenda por "Se supervisará
  para compartirla con la comunidad", pero compartir es optativo y se decide después, en el detalle.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Aprobar se corta entre subir el archivo y `approve_photo_share` | Si la base lo rechaza, la app borra el archivo. Si se corta la conexión, queda un archivo sin uso con una ruta que nadie conoce; volver a aprobar lo reemplaza |
| La foto retirada sigue en la caché de la red de Supabase o de un navegador | `cacheControl` de 1 hora al subirla; `/privacidad` avisa que puede tardar |
| No se puede borrar el archivo anterior después de reemplazarlo, o el de un retiro que quedó a medias | El archivo deja de estar en `fotos_productos` y ninguna pantalla lo pide; el retiro se retoma en cada sincronización y borrar la cuenta borra también los de las reemplazadas. Un archivo sin fila se puede limpiar a mano desde el panel de Supabase |
| Una foto inapropiada aprobada por error | Quien administra la borra con SQL y del bucket; "Denunciar foto" y quitar desde la app quedan para otra spec |
| La cola crece más de lo que una persona revisa | Límite de 10 en revisión por autor; la moderación automática de otra spec deja solo las dudosas |
| El rol de administrador se da y la sesión abierta no lo tiene | El claim viaja en el JWT: vale desde el próximo token. El paso 2 del plan lo dice |
| Un usuario hace pasar una foto de otro producto con un EAN cualquiera | Quien revisa ve el producto del catálogo para ese EAN al lado de la foto; "No es el producto" |
| El plan gratis de Storage (1 GB) entre los dos buckets | Una sola foto pública por EAN, 300 KB como máximo; las reemplazadas se borran |
| La foto pública revela algo del autor (una mano, la casa) | La compresión de la spec 27 ya saca el EXIF; el texto de compartir dice que la ve cualquiera y quien revisa rechaza con "No es apropiada" |

## Qué **no** entra en esta spec

- Moderación automática (Edge Function y servicio de visión).
- Denunciar una foto o quitarla desde la app.
- Compartir desde Cargar precio o Agregar producto.
- Fotos de productos sin código de barras.
- El nombre o el apodo del autor en la foto.
- Notificaciones.
- Varias fotos públicas por EAN.
- Compartir fotos solo con el grupo.
- Una pantalla para dar el rol de administrador.

Cada una, si llega, va en su propia spec.
