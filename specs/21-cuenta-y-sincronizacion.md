# SPEC 21 — Cuenta y sincronización

> **Estado:** Aprobada
> **Depende de:** [SPEC 06](06-migracion-nextjs-vercel.md), [SPEC 08](08-base-sepa-supabase.md)
> **Fecha:** 2026-11-17
> **Objetivo:** Iniciar sesión con Google o con un link por mail y guardar en la base todo lo que cada uno carga, para tenerlo en cualquier teléfono; sin sesión, la app sigue funcionando como hoy.

## Por qué existe esta spec

Hoy todo vive en el `localStorage` del teléfono: si alguien cambia de teléfono, borra los datos del navegador o
usa la app en dos dispositivos, pierde (o no ve) su historial de precios y de compras. Esta spec es el primer paso
de la Fase 2 ([roadmap](../docs/roadmap.md)): cuenta, datos en Supabase y sincronización entre dispositivos.

Es la base de las dos que siguen, que **no** forman parte de esta:

- **Spec 22 — Grupos:** crear un grupo, invitar con un link y compartir con él los precios de productos con
  código de barras ("Cargado por Ana · 12/11"). La misma noción de grupo servirá para la lista compartida
  ([feature 03](../docs/features/03-lista-compartida.md)).
- **Spec 23 — Validación:** un apartado "Por validar" donde los integrantes del grupo dan el ok ("Está bien" /
  "No coincide") a los precios que cargaron otros; con 2 ok, el precio queda *Validado*.

## Alcance

**Incluye:**

- Login **optativo** con **Google** y con **mail** (código de 6 dígitos o link, sin contraseña), con Supabase Auth.
- Página `/cuenta` y un ícono de cuenta en el header.
- Tabla en Supabase con los datos de cada usuario, con RLS: cada uno lee y escribe solo lo suyo.
- Sincronización **local primero**: el store sigue guardando en `localStorage`; cada cambio se encola y se sube
  cuando hay conexión; al abrir la app y al volver a ella se bajan los cambios de los otros dispositivos.
- Primera sesión: lo que el teléfono tiene se sube a la cuenta y se junta con lo que la cuenta ya tenía.
- Cerrar sesión (borra los datos del teléfono) y **Borrar mi cuenta** (borra la cuenta y todos sus datos).
- Página `/privacidad` con qué se guarda, dónde y cómo borrarlo (la pide la pantalla de consentimiento de Google).
  Responsable y mail de contacto en una constante (`PRIVACY_CONTACT`): El Changuito, `elchanguito.app@gmail.com`.
- **Sacar los datos de ejemplo**: una instalación nueva arranca vacía.

**Fuera de alcance:**

- Apple como proveedor (exige cuenta de desarrollador paga; vuelve con la app nativa, Fase 3).
- Grupos, precios compartidos y validación (specs 22 y 23).
- Tiempo real (Supabase Realtime): alcanza con sincronizar al abrir, al volver a la app y después de cada cambio.
- Pantalla para resolver conflictos: gana el último cambio.
- Service worker / modo offline completo.

## Decisiones del usuario

- Login optativo; sin sesión la app es la de hoy. (Opción A frente a login obligatorio.)
- Proveedores: Google y mail con código de 6 dígitos y link (el código funciona en la app instalada del iPhone);
  Apple más adelante.
- Precios **privados** en esta spec; compartir con grupos y validar por varias personas en las specs 22 y 23.
- Sin señal en dos teléfonos: **se suma todo**; si se editó lo mismo en los dos, **gana el último cambio**.
- Sacar los productos y precios de ejemplo de la app.
- Arquitectura: **copia en el teléfono + sincronización propia** (opción A, abajo).

## Enfoques considerados

| Enfoque | A favor | En contra |
|---|---|---|
| **A. Local primero con cola propia** (elegido) | La app sigue igual de rápida y anda sin señal; un registro por fila hace que "se suma todo" salga solo; la base ve cada precio, lo que necesita la spec 22 | La cola, los reintentos y los borrados marcados son código propio, la parte más delicada |
| B. Un bloque JSON por colección | Lo más rápido de hacer | La base no ve precios sueltos: compartir por grupo (spec 22) obligaría a rehacerlo |
| C. Motor externo (PowerSync, ElectricSQL) | Offline resuelto y probado | Otro servicio con su plan pago y su configuración, desproporcionado para el tamaño de la app |

## Modelo de datos

### Supabase (migración nueva `supabase/migrations/<fecha>_user_records.sql`)

Una sola tabla para todas las colecciones; cada registro de la app es una fila con su JSON tal cual lo guarda hoy
`localStorage` (mismo formato: no hay conversión).

```sql
create table public.user_records (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  collection  text        not null check (collection in ('products', 'prices', 'cart', 'purchases', 'settings')),
  id          text        not null,           -- el id del registro en la app
  data        jsonb,                          -- null si está borrado
  deleted     boolean     not null default false,
  modified_at timestamptz not null,           -- reloj del dispositivo: decide quién gana (último cambio)
  synced_at   timestamptz not null default now(),  -- reloj del servidor: cursor para bajar cambios
  primary key (user_id, collection, id)
);
create index on public.user_records (user_id, synced_at);
alter table public.user_records enable row level security;
-- Cada usuario lee, crea y modifica solo sus filas (select / insert / update con user_id = auth.uid())
```

- **Trigger `before insert or update`:** pone `synced_at = now()` y, en un update, si `new.modified_at <
  old.modified_at` conserva la fila vieja (devuelve `old` con `synced_at` sin cambiar): un cambio viejo que llega
  tarde no pisa uno nuevo.
- **`delete_my_account()`** (`security definer`, `search_path` fijo): borra `auth.users` donde `id = auth.uid()`;
  el `on delete cascade` borra sus filas. Ejecutable solo por `authenticated`.
- `settings` guarda un solo registro, `id = 'calculator'` (el `CalculatorState`).
- La **ubicación no se sincroniza** (`preciolocal_location` queda en el teléfono): se mantiene la regla "la
  ubicación no sale del dispositivo".
- Espacio: los datos de un usuario son KB; el plan gratis (500 MB) tiene hoy 175 MB del SEPA.

### En el teléfono (claves nuevas)

| Clave | Contenido |
|---|---|
| `preciolocal_outbox` | Cola de cambios sin subir: `{ collection, id, data \| null, deleted, modifiedAt }[]`; un solo pendiente por `collection + id` (el último reemplaza al anterior) |
| `preciolocal_sync` | `{ userId, cursor }`: dueño de los datos del teléfono y último `synced_at` bajado |

La sesión de Supabase la guarda supabase-js en su propia clave de `localStorage`.

## Reglas

### Sesión y cliente

- `lib/supabase.ts` pasa a crear el cliente **con sesión** (`persistSession: true`, `detectSessionInUrl: true`,
  `flowType: 'pkce'`). Es el mismo cliente para el catálogo: sus políticas ya permiten `authenticated`.
- Sin variables de Supabase (`supabase === null`) no hay cuenta: no se muestran el ícono ni `/cuenta` ofrece login
  (dice que la cuenta no está disponible) y la app funciona como hoy.
- **Google:** `signInWithOAuth({ provider: 'google', options: { redirectTo: <origin>/cuenta } })`.
- **Mail con código y link:** `signInWithOtp({ email, options: { emailRedirectTo: <origin>/cuenta } })`. La
  plantilla del mail (Authentication → Email Templates → Magic Link) lleva el **código de 6 dígitos**
  (`{{ .Token }}`) y el link. Después de pedirlo, `/cuenta` muestra "Te mandamos un mail a <mail>" con el campo
  **Código** (6 dígitos, `inputMode="numeric"`, `autocomplete="one-time-code"`) y **Entrar**
  (`verifyOtp({ email, token, type: 'email' })`), y "Reenviar el mail" (habilitado a los 60 s). Desde el
  navegador se puede tocar el link; desde la app instalada en el iPhone (que no comparte datos con Safari) hay
  que usar el código. Mail inválido → "Revisá el mail"; código incorrecto o vencido → "El código no es válido o
  venció. Pedí uno nuevo."
- **Google en la app instalada del iPhone** puede abrir el login fuera de la app y dejar la sesión en Safari: en
  ese caso (iOS + `display-mode: standalone`) `/cuenta` aclara debajo del botón "Si no vuelve a la app, entrá con
  tu mail".
- Todo el código de auth y sync corre en el cliente (después de `hydrate`), nunca en el prerender.

### Qué se sube

- Colecciones: `products`, `prices`, `cart`, `purchases` (un registro por elemento, por su `id`) y `settings`
  (la calculadora).
- **Detección de cambios sin tocar las acciones:** la suscripción de persistencia del store ya compara cada
  colección con la anterior; como las acciones nunca mutan, un elemento cambiado es un objeto nuevo. Una función
  pura `diffCollection(prev, next)` devuelve los `id` agregados o cambiados (referencia distinta) y los quitados;
  cada uno entra en la cola con `modifiedAt = new Date().toISOString()`. Solo con sesión.
- Los cambios que vienen de bajar (merge) **no** vuelven a la cola.

### Subir y bajar

- **Subir** (`push`): manda la cola en tandas de hasta 500 con `upsert` sobre `user_records`; lo que el servidor
  confirmó sale de la cola. Si falla (sin conexión, error), queda para el próximo intento.
- **Bajar** (`pull`): filas con `synced_at > cursor - 5 min` (el margen cubre transacciones que confirman fuera
  de orden; aplicar dos veces la misma fila no cambia nada), ordenadas por `synced_at`, de a 1.000; el cursor pasa
  al mayor `synced_at` recibido.
- **Merge** de cada fila bajada contra el estado local: si hay un pendiente en la cola para ese registro con
  `modifiedAt` mayor, gana el local; si no, gana el remoto (con `deleted`, se quita del estado). Función pura
  `mergeRemote(state, rows, outbox)`.
- **Cuándo:** después de `hydrate` si hay sesión (primero `push`, después `pull`); al volver la conexión
  (`online`); al volver a la app (`visibilitychange` a visible); y 2 s después del último cambio local (`push`).
  Nunca dos sincronizaciones a la vez.
- **Productos con el mismo código de barras:** si después del merge hay dos productos propios con el mismo `ean`
  (dos teléfonos que agregaron el mismo producto sin señal), queda el de `id` menor (así los dos teléfonos eligen
  el mismo); los precios, ítems del carrito y compras que apuntaban al otro pasan a este, y el otro se borra.
  Función pura `dedupeByEan(state)`; sus cambios sí entran en la cola.
- **Un producto, un ítem en el carrito:** si después del merge (o de `dedupeByEan`) quedan dos ítems del carrito con
  el mismo `productId`, queda uno solo: el de `modifiedAt` más reciente, con su cantidad, precio y comercio (como
  editar lo mismo en dos teléfonos: gana el último). El otro se borra y entra en la cola. *(Decisión del
  constructor de la spec, al revisarla.)*
- Los `id` nuevos se generan con `uniqueId()` (con sufijo aleatorio) en vez de `newId()`, para que dos
  teléfonos no generen el mismo `id` en el mismo milisegundo.

### Primera sesión en un teléfono

- Si `preciolocal_sync.userId` no existe (nunca hubo sesión en este teléfono): se encola **todo** lo local
  (salvo los datos de ejemplo, abajo), se sube y se baja la cuenta entera (`cursor` vacío). Las dos partes se
  juntan con las reglas de merge y `dedupeByEan`.
- **Sesión perdida sin cerrar sesión** (token vencido o revocado): mientras exista `preciolocal_sync.userId`, los
  cambios se siguen encolando aunque no haya sesión; al volver a entrar con el mismo usuario se suben. `/cuenta`
  muestra "Tu sesión venció. Entrá de nuevo para sincronizar".
- **Cuenta borrada desde otro dispositivo:** si una sincronización detecta que el usuario ya no existe, se cierra
  la sesión, se borran `preciolocal_outbox` y `preciolocal_sync` y **se conservan** los datos del teléfono, como
  si nunca hubiera habido cuenta: entrar de nuevo los sube como primera sesión. *(Decisión del constructor.)*
- Si `userId` es de **otro** usuario (no debería pasar, porque cerrar sesión borra todo): se descarta lo local
  sin subirlo y se baja la cuenta nueva.

### Datos de ejemplo

- Se quitan `DEFAULT_PRODUCTS` y `defaultPrices()`: `hydrate` arranca con `[]` en productos y precios.
- Quien ya los tiene guardados los conserva. Al subir por primera vez, un producto de ejemplo (`id` de `'1'` a
  `'8'`) se sube solo si lo usa algo que no es de ejemplo: un precio con otro `id` que `'1'`, `'2'`, `'3'`, un
  ítem del carrito o una compra. Los precios `'1'` a `'3'` no se suben. Función pura `withoutSamples(state)`.
- Buscar sin productos propios muestra un estado vacío: "Todavía no tenés productos" con "Buscá un producto en
  Precios Claros o leé su código de barras" (y no "No tenés productos con ese nombre").

### Cerrar sesión y borrar la cuenta

- **Cerrar sesión:** intenta un `push`; si quedan cambios sin subir (sin conexión), confirma "Hay N cambios sin
  subir. Si cerrás sesión, se pierden." Después: `signOut()`, y se borran del teléfono productos, precios,
  carrito, compras, calculadora (al estado inicial), `preciolocal_outbox` y `preciolocal_sync`. La ubicación queda.
- **Borrar mi cuenta:** confirma "Se borran tu cuenta y todos tus datos, en todos tus dispositivos. No se puede
  deshacer."; llama a `delete_my_account()`, cierra la sesión y limpia el teléfono igual que arriba.

## UI/UX

- **Header:** a la derecha (antes del total del carrito), botón de solo ícono `CircleUser` (lucide) con
  `aria-label="Cuenta"`, link a `/cuenta`; con sesión, la inicial del nombre en un círculo `primary-100` y
  `aria-label="Cuenta de <nombre>"`. Si la última sincronización falló hace más de 1 h, un punto ámbar.
- **`/cuenta` sin sesión:** "Guardá tus datos y usalos en cualquier teléfono", **Continuar con Google**, "o",
  campo "Tu mail" + **Enviarme el código**; debajo, "Sin cuenta, tus datos quedan solo en este teléfono." y link a
  `/privacidad`.
- **`/cuenta` con sesión:** nombre y mail; estado ("Sincronizado hace 1 min", "Sincronizando…", "N cambios sin
  subir · Sin conexión", "No se pudo sincronizar" con **Reintentar**); **Cerrar sesión**; abajo, separado,
  **Borrar mi cuenta** en rojo; link a `/privacidad`.
- `/cuenta` y `/privacidad` no están en la barra de navegación; ninguna pestaña queda activa.
- Diálogos de confirmación con `<dialog>` propio (no `confirm()`), como el resto de los modales nuevos.

## Configuración (la hace el dueño del proyecto)

1. **Google Cloud Console:** pantalla de consentimiento (nombre "El Changuito", URL de la app, de `/privacidad`) y
   un cliente OAuth "Aplicación web" con el redirect `https://bjzeknajhrbtormkuunj.supabase.co/auth/v1/callback`.
   Client ID y secret van en Supabase → Authentication → Providers → Google.
2. **Supabase → Authentication → URL Configuration:** Site URL `https://elchanguito.vercel.app`; Redirect URLs
   `http://localhost:4200/**`, `https://elchanguito.vercel.app/**` y el patrón de las previews de Vercel.
3. **Mail:** el SMTP de Supabase por defecto manda muy pocos mails por hora (sirve para probar). Para producción,
   SMTP propio (por ejemplo Resend, plan gratis) en Authentication → SMTP Settings.
4. `npx supabase db push --linked` con la migración nueva.

Sin variables de entorno nuevas: se usan `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Plan de implementación (orden sugerido)

1. Migración `user_records` + trigger + `delete_my_account()`; probar RLS con dos usuarios.
2. Funciones puras con tests (`src/lib/sync.ts`): `diffCollection`, `mergeRemote`, `dedupeByEan`,
   `withoutSamples`, manejo de la cola (agregar reemplazando por `collection + id`, sacar lo confirmado).
3. Sacar los datos de ejemplo + estado vacío de Buscar; `uniqueId()` para los `id` nuevos.
4. Cliente con sesión, `useAuth` (sesión actual vía `onAuthStateChange`), `/cuenta` y el ícono del header.
5. Motor de sincronización (`src/lib/sync-engine.ts` o similar): cola desde la suscripción del store, push, pull,
   disparadores, estado para `/cuenta`.
6. Primera sesión, cerrar sesión, borrar la cuenta.
7. `/privacidad`; actualizar `CLAUDE.md` (Fase 2 en curso, persistencia, rutas, estructura) y `docs/roadmap.md`.

## Criterios de aceptación

- [ ] Sin sesión la app funciona igual que antes (salvo que una instalación nueva arranca vacía).
- [ ] Sin variables de Supabase no aparece nada de la cuenta y el build pasa.
- [ ] Entrar con Google y con el link por mail lleva a `/cuenta` con la sesión iniciada.
- [ ] Al entrar por primera vez, lo que tenía el teléfono aparece en otro dispositivo con la misma cuenta.
- [ ] Un precio cargado en el teléfono A aparece en el B al abrir la app o volver a ella.
- [ ] Sin señal en A y en B, cada uno carga un precio distinto: al conectarse, los dos teléfonos tienen los dos.
- [ ] Mismo ítem del carrito editado en A y después en B: queda la cantidad de B en los dos.
- [ ] Un ítem quitado del carrito en A desaparece en B.
- [ ] Mismo producto (mismo EAN) agregado en A y en B sin señal: queda uno solo, con los precios de los dos.
- [ ] Los productos y precios de ejemplo sin usar no se suben.
- [ ] Un usuario no puede leer ni escribir filas de otro (probado con dos cuentas contra la API).
- [ ] Cerrar sesión deja el teléfono vacío; volver a entrar lo trae todo de nuevo.
- [ ] Borrar mi cuenta elimina la cuenta y sus filas; volver a entrar con el mismo Google crea una cuenta vacía.
- [ ] La ubicación no viaja a `user_records`.
- [ ] `npm run lint`, `npm test` y `npm run build` sin errores; 375 px sin scroll horizontal.

## Riesgos

- **Relojes de los teléfonos:** "gana el último cambio" usa la hora del dispositivo; un teléfono con la hora mal
  puede ganar o perder un cambio. Aceptable para una lista personal; el cursor de bajada usa la hora del servidor.
- **Cola grande en la primera subida:** años de precios son miles de registros; van en tandas de 500.
- **Cache Components (`<Activity>`):** `/cuenta` puede quedar oculta y no desmontada; los diálogos se cierran al
  ocultarse, como los demás.
