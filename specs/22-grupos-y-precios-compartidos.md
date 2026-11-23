# SPEC 22 — Grupos y precios compartidos

> **Estado:** Implementado
> **Depende de:** [SPEC 15](15-precios-y-comercios-cercanos.md), [SPEC 21](21-cuenta-y-sincronizacion.md), [SPEC 24](24-comercios-cercanos-en-el-lector.md), [SPEC 26](26-cargar-precio-en-el-comercio.md)
> **Fecha:** 2026-11-23
> **Objetivo:** Crear un grupo, invitar con un link y ver los precios que cargaron los demás integrantes en productos con código de barras ("Cargado por Ana · 12/11") en Comercios cercanos, "¿Cuánto sale acá?" y el detalle del producto.

## Por qué existe esta spec

Desde la [spec 21](21-cuenta-y-sincronizacion.md) cada precio propio vive en `user_records`, pero lo ve solo quien lo
cargó. La [spec 26](26-cargar-precio-en-el-comercio.md) hizo que cargar un precio en el comercio sea rápido y que
lleve el comercio con su ubicación. El paso siguiente es que una familia o un grupo de amigos aproveche lo que cargó
cada uno: si Ana pagó la yerba $3.200 en el chino de la esquina, el resto del grupo lo ve al consultar ese producto.

La spec 21 ya planificó esta spec y eligió un registro por fila justamente para esto: la base ve cada precio y lo
puede compartir sin copias. La validación de los precios por varias personas es la spec 23; la comunidad abierta
(precios para todos los usuarios) queda para después.

## Alcance

**Incluye:**

- **Un grupo a la vez** por usuario: crearlo, invitar con un link, unirse, salir.
- Página `/grupo` (link desde `/cuenta`) y página `/grupo/unirse?c=<código>` para aceptar la invitación.
- **Link permanente** que el administrador puede regenerar (el anterior deja de servir). Cualquier integrante lo
  copia o lo comparte.
- **Administrador**: el creador; renombra el grupo, saca integrantes y regenera el link. Si sale (o borra su cuenta),
  pasa al integrante más antiguo; el último en salir borra el grupo.
- **Apodo en el grupo** ("Tu nombre en el grupo"), editable; el mail nunca se muestra a los demás.
- **Hasta 20 integrantes** por grupo.
- **Se comparten todos los precios propios de productos con código de barras**, también los cargados antes de
  unirse, de los últimos 60 días: monto, fecha y comercio completo (nombre, dirección, barrio y coordenadas).
  Interruptor **Compartir mis precios** (prendido por defecto) para pausarlo.
- Los precios del grupo aparecen en:
  - **Comercios cercanos** (`NearbyStores`: Buscar, oferta del lector, detalle), solo los de dentro del radio,
    mezclados con los de Precios Claros y los propios, con "Cargado por Ana · 12/11".
  - **"¿Cuánto sale acá?"** (oferta del lector): el más barato cercano considera también los del grupo dentro del
    radio.
  - **Detalle del producto**: tarjeta nueva **Precios del grupo** con todos (cerca o no).
- Consulta **a pedido** a la base (una función de Supabase por pantalla, con caché corta): sin copias de los
  precios; borrar un precio, pausar o salir del grupo lo saca enseguida para los demás.
- Texto nuevo en `/privacidad`.

**Fuera de alcance:**

- Validación de precios ("Por validar", "Está bien" / "No coincide"): spec 23.
- Precios propios y del grupo en **¿Dónde conviene el carrito?** (spec 25): otra spec, los dos juntos.
- Varios grupos por usuario.
- Compartir fotos propias con el grupo (spec 28 decide cómo se comparten las fotos).
- Lista de compras compartida ([feature 03](../docs/features/03-lista-compartida.md)): reutilizará el grupo en otra spec.
- Compartir productos sin código de barras.
- Tiempo real (Supabase Realtime) y ver precios del grupo sin conexión.
- Link que vence, código corto para escribir a mano.
- Notificaciones ("Ana cargó un precio").
- Comunidad abierta (precios públicos para todos).

## Reglas

### Grupo y roles

- Un usuario está en **un solo grupo** a la vez (`group_members.user_id` es único).
- Crear: **Nombre del grupo** (1 a 40 caracteres) y **Tu nombre en el grupo** (1 a 30), completado con
  `defaultNickname`: la primera palabra de `displayName` o, si es un mail, lo que está antes de la `@`. Quien lo
  crea queda como administrador.
- Administrador: cambia el nombre del grupo, saca a un integrante (no a sí mismo) y genera un link nuevo.
- Cualquier integrante: copia o comparte el link, cambia su apodo, prende o apaga **Compartir mis precios** y sale.
- Al salir el administrador (o al borrar su cuenta, que borra su fila en cascada), un trigger pasa el rol al
  integrante más antiguo (`joined_at`). Si no queda nadie, el grupo se borra.
- Un integrante sacado o que sale deja de ver los precios del grupo, y el grupo deja de ver los suyos, en la próxima
  consulta.

### Invitación

- Link: `<origin>/grupo/unirse?c=<código>`. El código tiene 12 caracteres url-safe generados en la base
  (`gen_random_bytes`), único.
- **Generar link nuevo** (administrador, con confirmación "El link anterior deja de servir.") reemplaza el código.
- **Compartir**: con `navigator.share` si existe ("Sumate a <grupo> en El Changuito"); si no, solo **Copiar link**
  (aviso "Link copiado", `role="status"`, 3 s).
- `/grupo/unirse?c=…`:
  - Siempre muestra "Te invitaron a <grupo> (N integrantes)" con `group_preview(código)`, que se puede llamar sin
    sesión y devuelve solo el nombre y la cantidad.
  - **Sin sesión**: "Entrá con tu cuenta para unirte" y el formulario de `/cuenta` (`SignInForm`) con
    `redirectTo` a la misma URL de unirse; con el código por mail, la página sigue ahí al entrar.
  - **Con sesión y sin grupo**: "Tu nombre en el grupo" (con `defaultNickname`) y **Unirme**; al unirse, a `/grupo`.
  - **Ya en ese grupo**: "Ya estás en este grupo" y link a `/grupo`.
  - **En otro grupo**: "Ya estás en <grupo actual>. Para unirte a <grupo nuevo> tenés que salir de ese." con
    **Salir y unirme** (`ConfirmDialog`).
  - Código inválido o cambiado: "El link de invitación no es válido o cambió. Pedile uno nuevo a alguien del grupo."
  - Grupo completo: "El grupo está completo (20 integrantes)."
  - Sin Supabase: "Los grupos no están disponibles".

### Qué precios se comparten

- `group_prices(eans)` devuelve, para los EAN pedidos (hasta 20 por llamada; la app pide de a 20), los precios de los
  **otros** integrantes del grupo del que llama que tienen `share_prices`:
  - fila `prices` no borrada de `user_records`, con fecha de los últimos **60 días**;
  - cuyo `productId` es un producto (`products`, no borrado) del mismo integrante con ese `ean`;
  - con monto, fecha, `store`, `barrio`, `storeRef` y el apodo actual del integrante.
- Sin sesión, sin grupo o con error, la app no muestra nada del grupo (ni error ni tarjeta vacía), como las
  referencias de la spec 12.
- Un precio cargado sin conexión aparece para los demás después de que su teléfono sincroniza (spec 21).
- En la app, `latestGroupPrices` deja **el último de cada integrante en cada comercio** (`storeKey`), como los
  propios en Comercios cercanos.
- Los precios propios nunca vuelven por esta consulta: ya están en el teléfono.

### Consulta y caché

- `getGroupPrices(eans)` llama a la función **una vez por pantalla** (todos los EAN juntos, de a 20) y guarda la
  respuesta por EAN durante **5 minutos** (también los "sin precios"; un fallo no se guarda).
- `clearGroupPrices()` vacía la caché al crear, unirse, salir, sacar a alguien, cambiar **Compartir mis precios**,
  cerrar sesión y borrar la cuenta.
- Las pantallas usan el hook `useGroupPrices(eans)`, que solo consulta con sesión (`useAuth` en `in`); las respuestas
  se acumulan como en `useSepaReferences`.

### Comercios cercanos

- `NearbyStores` recibe `groupPrices` además de `ownPrices`. `groupPricesNear` deja los que tienen coordenadas
  **dentro del radio** y los mezcla con las sucursales de Precios Claros y los propios cercanos, por precio y después
  distancia.
- Cada fila del grupo: nombre del comercio, dirección o barrio, distancia, precio, la nota "Cargado por Ana · 12/11",
  **Mapa** y el botón de la lista (**Agregar**: en ese comercio y a ese precio, como un precio propio).
- "Más barato" cuenta también las filas del grupo. `NearbyLine` ("Desde $X…") sigue resumiendo solo Precios Claros,
  como en la spec 26.
- Fuera del radio o sin coordenadas, los precios del grupo no entran en la lista: están en la tarjeta del detalle.
- Sin ubicación no hay lista (como hoy): los precios del grupo solo se ven en el detalle.

### "¿Cuánto sale acá?"

- `shelfComparison` recibe `group` (los precios del grupo dentro del radio, con distancia). El más barato cercano es
  el menor entre Precios Claros y el grupo; si es del grupo, la línea suma quién y cuándo:
  - "En <comercio> — <distancia> sale $X menos (Ana · 12/11)" en rojo;
  - "Igual que en <comercio> — <distancia> (Ana · 12/11)" en azul;
  - "Más barato que en los comercios cerca" en verde (sin cambios).
- Sin precios cercanos de ninguno de los dos, compara contra la referencia, como hoy. La línea del último precio
  propio no cambia.

### Detalle del producto: Precios del grupo

- Tarjeta **Precios del grupo** (`GroupPricesCard`) después de Comercios cercanos, solo con EAN y con al menos un
  precio del grupo.
- Una fila por precio de `latestGroupPrices`: comercio, dirección o barrio, precio, "Cargado por Ana · 12/11" y, con
  ubicación y coordenadas, la distancia ("aprox." con localidad). **Mapa** si el comercio tiene coordenadas y
  **Agregar** (en ese comercio y a ese precio).
- Orden: precio y después fecha (el más nuevo primero). Hasta 10 y "Ver N más".
- Pie: "Precios cargados por tu grupo en los últimos 60 días."

### Página `/grupo`

- Sin Supabase: "Los grupos no están disponibles". Sin sesión: "Entrá con tu cuenta para crear un grupo o unirte a
  uno" con link a `/cuenta`.
- **Sin grupo**: "Compartí precios con tu familia o tus amigos", el formulario de crear (Nombre del grupo, Tu nombre
  en el grupo, **Crear grupo**) y "Para unirte a un grupo, pedile el link a alguien que ya esté.".
- **Con grupo**:
  - Nombre del grupo (administrador: **Cambiar nombre**, en línea, Enter guarda y Escape cancela).
  - **Invitar**: el link en un campo de solo lectura, **Copiar link**, **Compartir** (si hay `navigator.share`) y,
    para el administrador, **Generar link nuevo**.
  - **Integrantes (N de 20)**: apodo, "Vos" en el propio, "Administra" en el administrador; el administrador ve
    **Sacar** en los demás (`ConfirmDialog`: "¿Sacar a <apodo> del grupo? Deja de ver los precios del grupo y el
    grupo deja de ver los suyos.").
  - **Tu nombre en el grupo** editable.
  - Interruptor **Compartir mis precios** (`role="switch"`, `aria-checked`) con "El grupo ve tus precios de
    productos con código de barras de los últimos 60 días: el monto, la fecha y el comercio con su dirección y su
    ubicación.".
  - **Salir del grupo** en rojo, con `ConfirmDialog` ("Dejás de ver los precios del grupo y el grupo deja de ver
    los tuyos."; si es el único integrante: "Sos el único integrante: al salir se borra el grupo.").
- "Cargando…" mientras llega `my_group()`; si falla, "No se pudo cargar el grupo" con **Reintentar**.
- Errores de las acciones junto al botón (`role="alert"`): nombre o apodo vacío o largo, sin conexión ("No se pudo
  guardar. Revisá la conexión.").

### Cuenta, cierre de sesión y borrado

- `/cuenta` con sesión suma la sección **Grupo**: el nombre del grupo y "N integrantes" con link a `/grupo`, o
  "Compartí precios con tu familia o tus amigos" con **Crear o unirte a un grupo**.
- Cerrar sesión no sale del grupo (la membresía es de la cuenta): vacía la caché de precios del grupo.
- Borrar la cuenta borra la membresía en cascada (y el trigger reasigna el administrador o borra el grupo).

## Modelo de datos

### Supabase (migración nueva `supabase/migrations/<fecha>_grupos.sql`)

```sql
create table public.groups (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null check (char_length(name) between 1 and 40),
  invite_code text        not null unique,
  created_at  timestamptz not null default now()
);

create table public.group_members (
  group_id     uuid        not null references public.groups (id) on delete cascade,
  user_id      uuid        not null unique references auth.users (id) on delete cascade,  -- un grupo a la vez
  nickname     text        not null check (char_length(nickname) between 1 and 30),
  role         text        not null check (role in ('admin', 'member')),
  share_prices boolean     not null default true,
  joined_at    timestamptz not null default now(),
  primary key (group_id, user_id)
);
```

- RLS activado en las dos tablas **sin permisos directos** para `anon` ni `authenticated`: todo pasa por funciones
  `security definer` con `search_path = ''`, que validan con `auth.uid()`.
- Trigger `after delete` en `group_members`: si el grupo quedó sin administrador y con integrantes, el más antiguo
  pasa a `admin`; si quedó vacío, se borra el grupo.
- Índices para `group_prices` sobre `user_records`: `(user_id, (data->>'ean')) where collection = 'products'` y
  `(user_id, (data->>'productId')) where collection = 'prices'`.

Funciones (todas `authenticated`, salvo `group_preview`, también `anon`). Los errores se levantan con un código que
la app traduce (`groupErrorMessage`): `invalid_code`, `group_full`, `already_in_group`, `not_in_group`, `not_admin`,
`invalid_name`.

| Función | Qué hace |
|---|---|
| `create_group(p_name, p_nickname) → uuid` | Crea el grupo con un código nuevo y al que llama como `admin` |
| `group_preview(p_code) → (name, members)` | Nombre y cantidad de integrantes de un código; nada si no existe |
| `join_group(p_code, p_nickname, p_leave default false) → uuid` | Se une como `member`; controla el límite de 20 y que no esté en otro; con `p_leave` sale antes del actual en la misma transacción ("Salir y unirme") |
| `my_group() → jsonb` | `null` sin grupo; si no, `{ id, name, inviteCode, role, sharePrices, nickname, members: [{ userId, nickname, role, joinedAt }] }` |
| `rename_group(p_name)` | Solo `admin` |
| `regenerate_invite() → text` | Solo `admin`; devuelve el código nuevo |
| `remove_member(p_user_id)` | Solo `admin`, no a sí mismo |
| `set_nickname(p_nickname)` | El propio |
| `set_share_prices(p_share boolean)` | El propio |
| `leave_group()` | Borra la fila propia (el trigger hace el resto) |
| `group_prices(p_eans text[])` | `(ean, amount, date, store, barrio, store_ref jsonb, member, member_id)` de los otros integrantes con `share_prices`, últimos 60 días; ignora lo que pase de 20 EAN |

### En la app

Sin claves nuevas de `localStorage`: el grupo y sus precios se consultan a la base, no se guardan en el teléfono.

```typescript
// src/lib/group.ts
export const GROUP_MAX_MEMBERS = 20;
export const GROUP_PRICE_DAYS = 60;

export interface GroupMember { userId: string; nickname: string; role: 'admin' | 'member'; joinedAt: string }

export interface Group {
  id: string;
  name: string;
  inviteCode: string;
  role: 'admin' | 'member';   // el del que consulta
  sharePrices: boolean;
  nickname: string;
  members: GroupMember[];
}

/** Precio de otro integrante del grupo */
export interface GroupPrice {
  ean: string;
  amount: number;
  date: string;       // ISO
  store: StoreRef;    // storeRef, o { name: store, barrio } si el precio es de antes de la spec 26
  member: string;     // apodo actual
  memberId: string;   // user_id: distingue a dos integrantes con el mismo apodo
}
```

Funciones puras nuevas, con tests (`group.test.ts`):

```typescript
export function defaultNickname(user: { email?: string; user_metadata?: Record<string, unknown> }): string;
export function validGroupName(text: string): boolean;   // 1 a 40 sin espacios de los costados
export function validNickname(text: string): boolean;    // 1 a 30
export function inviteUrl(origin: string, code: string): string;
export function groupErrorMessage(code: string | undefined): string;
/** El último de cada integrante en cada comercio (storeKey) */
export function latestGroupPrices(prices: GroupPrice[]): GroupPrice[];
/** Los que tienen coordenadas dentro del radio, con su distancia */
export function groupPricesNear(prices: GroupPrice[], origin: LatLng | undefined, radiusKm: number | undefined):
  { price: GroupPrice; distanceKm: number }[];
/** "Cargado por Ana · 12/11" */
export function groupPriceNote(price: GroupPrice): string;
```

Llamadas a la base (sin tests automáticos), en el mismo archivo: `fetchMyGroup`, `createGroup`, `previewGroup`,
`joinGroup`, `renameGroup`, `regenerateInvite`, `removeMember`, `setNickname`, `setSharePrices`, `leaveGroup`,
`getGroupPrices` (con caché de 5 minutos) y `clearGroupPrices`. Todas con `.retry(false)`.

## UI/UX

```
/grupo (con grupo):
│ Familia Pérez                [Cambiar nombre] │
│                                               │
│ Invitar                                       │
│ [ https://elchanguito…/grupo/unirse?c=… ]     │
│ [Copiar link] [Compartir]                     │
│ Generar link nuevo                            │
│                                               │
│ Integrantes (3 de 20)                         │
│ (A) Ana · Administra                          │
│ (G) Germán · Vos                              │
│ (L) Lucía                          [Sacar]    │
│                                               │
│ Tu nombre en el grupo  [ Germán     ]         │
│ Compartir mis precios              [ ●── ]    │
│ El grupo ve tus precios de productos con…     │
│                                               │
│ [Salir del grupo]                             │

Comercios cercanos (fila del grupo):
│ Almacén Don Luis             $3.200  [Agregar]│
│ Av. Rivadavia 5100 · 250 m          [Mapa]    │
│ Cargado por Ana · 12/11                       │
```

- Íconos de `lucide-react` con `aria-hidden="true"` (`Users` para el grupo, `Link`/`Copy`, `Share2`, `UserMinus`,
  `LogOut`); botones de 44 px; el de solo ícono con `aria-label`.
- El interruptor es un `<button role="switch">` con etiqueta visible.
- `/grupo` y `/grupo/unirse` no están en la barra de navegación; ninguna pestaña queda activa.
- 375 px sin scroll horizontal: el link de invitación con `truncate` y los botones debajo.
- Diseño con `/frontend-design` y `/ui-ux-pro-max` al implementar.

## Plan de implementación

1. **Funciones puras (TDD)**: `src/lib/group.ts` con los tipos y `defaultNickname`, `validGroupName`,
   `validNickname`, `inviteUrl`, `groupErrorMessage`, `latestGroupPrices`, `groupPricesNear` y `groupPriceNote`, con
   tests en `group.test.ts`.
2. **Base**: migración `supabase/migrations/<fecha>_grupos.sql` (tablas, RLS sin permisos directos, trigger de
   administrador, índices y funciones). **La aplica el usuario** con `npx supabase db push --linked`. Verificar con el
   MCP y dos cuentas: crear, unirse, límite de 20, un usuario fuera del grupo no ve sus precios, `group_prices` no
   devuelve los propios ni los de quien pausó, y al salir el administrador el rol pasa al más antiguo.
3. **Llamadas y caché**: las funciones de la base en `src/lib/group.ts` (`getGroupPrices` de a 20 EAN, caché de
   5 minutos por EAN, `clearGroupPrices`) y el hook `src/components/useGroupPrices.ts`. `clearGroupPrices` en cerrar
   sesión y borrar la cuenta (`sync-engine.ts`, `auth.ts`).
4. **Página `/grupo`**: `src/app/grupo/page.tsx` con los estados (sin Supabase, sin sesión, sin grupo, con grupo,
   cargando, error) y las acciones; sección **Grupo** en `/cuenta`.
5. **Unirse**: `src/app/grupo/unirse/page.tsx` (Suspense) + `JoinGroup.tsx` (`useSearchParams`), con
   `group_preview`, los casos (sin sesión, sin grupo, mismo grupo, otro grupo, código inválido, completo) y
   `SignInForm` con la prop `redirectTo`.
6. **Comercios cercanos**: `NearbyStores` con `groupPrices` (filas mezcladas dentro del radio, nota, Mapa, Agregar,
   "Más barato"); `useGroupPrices` en Buscar (propios y catálogo, una consulta) y en `NearbyStoresCard`.
7. **"¿Cuánto sale acá?"**: `shelfComparison` con `group` (tests nuevos en `shelf-price.test.ts`: el del grupo es el
   más barato, empata, y sin cercanos de ninguno) y `ScanOffer` con su `useGroupPrices`.
8. **Detalle**: `src/components/GroupPricesCard.tsx` en `ProductDetail.tsx`, después de Comercios cercanos.
9. **Privacidad y docs**:
   - `/privacidad`: con un grupo, los demás integrantes ven tus precios de productos con código de barras de los
     últimos 60 días (monto, fecha, comercio con dirección y ubicación) y tu apodo, nunca tu mail; se deja de
     compartir al pausar, salir o borrar la cuenta.
   - `CLAUDE.md`: Estructura, Arquitectura (grupos y `group_prices`), tablas de Supabase, Rutas, Funcionalidades
     (Buscar, lector, detalle, Cuenta, Grupo) y Estado Actual.
   - `docs/features/08-consulta-y-aportes.md` y `docs/roadmap.md`: spec 22 hecha; precios propios y del grupo en el
     carrito como evolución futura.

**A revisar (sin test automático):**

- Dos cuentas en dos teléfonos: crear, compartir el link por WhatsApp, unirse y ver los precios del otro.
- Unirse desde el link sin sesión, entrando con Google y con el código por mail (también en la app instalada del
  iPhone, donde el link abre Safari).
- Pausar **Compartir mis precios** y ver que el otro teléfono deja de verlos (pasados los 5 minutos de caché o al
  recargar).

## Criterios de aceptación

- [ ] Con sesión y sin grupo, `/grupo` crea un grupo con nombre y apodo; quien lo crea figura como "Administra".
- [ ] El link de invitación abre `/grupo/unirse` con "Te invitaron a <grupo> (N integrantes)", también sin sesión.
- [ ] Sin sesión, entrar desde `/grupo/unirse` (Google o código por mail) deja la página de unirse con la sesión iniciada.
- [ ] Unirse con un apodo lleva a `/grupo` y el integrante aparece en la lista de los demás.
- [ ] Un link regenerado deja de servir: el anterior muestra "El link de invitación no es válido o cambió…".
- [ ] El integrante 21 recibe "El grupo está completo (20 integrantes)." y no se une.
- [ ] Estando en otro grupo, **Salir y unirme** sale del actual y se une al nuevo.
- [ ] Un precio de Ana (producto con EAN, comercio con coordenadas dentro del radio) aparece en Comercios cercanos de
      otro integrante con "Cargado por Ana · 12/11", su distancia, Mapa y Agregar.
- [ ] Un precio del grupo más barato que los de Precios Claros lleva "Más barato".
- [ ] "¿Cuánto sale acá?" con un monto mayor al del grupo dice "En <comercio> — <distancia> sale $X menos (Ana · 12/11)".
- [ ] El detalle muestra **Precios del grupo** con los precios del grupo de ese EAN, también los de fuera del radio y sin ubicación.
- [ ] Un producto sin EAN no muestra precios del grupo ni comparte los suyos.
- [ ] De un mismo integrante y comercio se ve solo el último precio; los de más de 60 días no aparecen.
- [ ] Los precios propios no aparecen dos veces (no vuelven como "del grupo").
- [ ] Con **Compartir mis precios** apagado, los demás no ven los precios de ese integrante.
- [ ] El administrador cambia el nombre del grupo y saca a un integrante; un integrante sin rol no ve esos botones y
      la base rechaza esas funciones si las llama.
- [ ] Al salir el administrador, el integrante más antiguo pasa a "Administra"; al salir el último, el grupo ya no existe.
- [ ] Un integrante que sale o es sacado deja de ver los precios del grupo y el grupo deja de ver los suyos.
- [ ] Un usuario fuera del grupo no obtiene precios de sus integrantes (probado contra la API con dos cuentas).
- [ ] El mail de un integrante no aparece en ninguna respuesta de las funciones del grupo.
- [ ] Sin sesión, sin grupo, sin Supabase o sin conexión, Buscar, el lector y el detalle se ven igual que antes.
- [ ] Borrar la cuenta saca al usuario del grupo.
- [ ] `/privacidad` explica qué ve el grupo y cómo dejar de compartir.
- [ ] 375 px sin scroll horizontal; `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.

## Decisiones

- **Un grupo a la vez** (elegido por el usuario): una sola pantalla `/grupo` y sin "de qué grupo viene" en cada
  precio. Descartado: varios grupos (más pantallas y precios repetidos entre grupos); se puede abrir después.
- **Todos los precios con EAN, también los anteriores, con interruptor para pausar** (elegido). Descartado: solo los
  nuevos (el grupo arranca vacío) y precio por precio (fricción en la góndola). Sin EAN no hay forma de saber que es
  el mismo producto de otro integrante.
- **Consulta a pedido con una función de la base** (elegido) sobre `user_records`, sin copiar los precios:
  borrar, pausar o salir se refleja enseguida y no hay código de sincronización nuevo. Descartado: tabla
  `group_prices` copiada por la app (hay que mantener la copia) y bajarlos al teléfono (más almacenamiento y un sync
  más complejo). Costo aceptado: sin conexión no se ven.
- **Funciones `security definer` sin permisos directos sobre las tablas** (elegido): las reglas (un grupo a la vez,
  20 integrantes, solo el administrador) quedan en un solo lugar y nunca se expone `user_records` de otros ni el
  mail. Descartado: políticas RLS de `select` sobre `user_records` para los integrantes (dejaría leer todas las
  colecciones de los demás, no solo los precios).
- **Caché de 5 minutos** (elegido) en lugar de la caché de sesión de `getSepaPrices`: los precios del grupo cambian
  durante el día, el SEPA una vez por día.
- **Link permanente y regenerable** (elegido). Descartado: link que vence a los 7 días (hay que volver a mandarlo) y
  código corto (más casos; el código por mail ya resuelve la app instalada del iPhone).
- **`group_preview` también sin sesión**: muestra a quién invitan antes de pedir la cuenta. Expone solo nombre y
  cantidad, y el código de 12 caracteres no se puede adivinar.
- **Administrador = el creador; si sale, el más antiguo** (elegido). Descartado: todos iguales (cualquiera podría
  sacar a cualquiera).
- **Apodo en el grupo** (elegido) en lugar del nombre de Google: con cuenta por mail no hay nombre, y el mail nunca
  se muestra.
- **Comercio completo con coordenadas** (elegido por el usuario): permite distancia y Mapa. Se avisa en `/grupo` y en
  `/privacidad`. Descartado: quitar las coordenadas de los comercios cargados a mano.
- **Solo dentro del radio en Comercios cercanos y "¿Cuánto sale acá?"** (elegido); los demás, en la tarjeta del
  detalle. Descartado: al final de la lista como los propios (la llenaría de comercios lejanos).
- **`NearbyLine` sigue solo con Precios Claros**, como en la spec 26: el resumen habla de los comercios del catálogo.
- **¿Dónde conviene el carrito? fuera** (elegido): tampoco usa los precios propios; una spec aparte suma los dos
  juntos con las mismas reglas.
- **Cerrar sesión no sale del grupo**: la membresía es de la cuenta, como los datos de `user_records`.
- **20 integrantes** (elegido): alcanza para familia y amigos y mantiene chica la consulta. Más grande es la
  comunidad abierta, que necesita la validación de la spec 23.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `group_prices` lenta: busca dentro del JSON de `user_records` | Índices por expresión sobre `data->>'ean'` y `data->>'productId'`, 20 integrantes y 20 EAN como máximo por llamada; se mide con `explain analyze` en el paso 2 |
| Un precio equivocado o en broma de otro integrante | Se ve quién lo cargó y cuándo; la validación es la spec 23; el administrador puede sacar al integrante |
| El link circula fuera del grupo | **Generar link nuevo** invalida el anterior; límite de 20; el administrador saca a quien no corresponde |
| Las coordenadas de "Otro comercio acá" muestran dónde estuvo alguien | Aviso junto a **Compartir mis precios** y en `/privacidad`; se puede pausar |
| Un integrante ve un precio que el otro ya borró (caché de 5 minutos) | Aceptado; recargar la página o esperar los 5 minutos lo saca |
| Un precio cargado sin conexión no aparece para el grupo | Aparece cuando ese teléfono sincroniza (spec 21) |
| La app instalada del iPhone abre el link de invitación en Safari | Unirse en Safari alcanza: la membresía es de la cuenta, así que la app instalada ve el grupo al entrar con la misma cuenta |

## Qué **no** entra en esta spec

- Validación de precios (spec 23).
- Precios propios y del grupo en ¿Dónde conviene el carrito?
- Varios grupos por usuario.
- Fotos compartidas con el grupo.
- Lista de compras compartida.
- Productos sin código de barras.
- Tiempo real, precios del grupo sin conexión y notificaciones.
- Link que vence y código corto.
- Comunidad abierta.
