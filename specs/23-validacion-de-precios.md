# SPEC 23 — Validación de precios del grupo

> **Estado:** Implementado
> **Depende de:** [SPEC 21](21-cuenta-y-sincronizacion.md), [SPEC 22](22-grupos-y-precios-compartidos.md)
> **Fecha:** 2026-11-23
> **Objetivo:** Que los integrantes de un grupo digan "Está bien" o "No coincide" a los precios que cargaron los demás, para que cada precio del grupo quede *Validado*, *Dudoso* o sin validar, y que los dudosos no cuenten como el más barato.

## Por qué existe esta spec

Desde la [spec 22](22-grupos-y-precios-compartidos.md) cada integrante ve los precios con código de barras que cargaron
los demás ("Cargado por Ana · 12/11"), pero no hay forma de saber si un precio está bien: uno mal tipeado ($320 en
lugar de $3.200) aparece como "Más barato" y gana "¿Cuánto sale acá?". La [spec 21](21-cuenta-y-sincronizacion.md)
planificó esta spec: un apartado **"Por validar"** donde el grupo da el ok o avisa que no coincide; con 2 ok, el precio
queda *Validado*.

Es también la base de la comunidad abierta ([ideas](../docs/ideas.md)), que queda para después.

## Alcance

**Incluye:**

- **Votar** un precio de otro integrante: **Está bien** o **No coincide**, con un campo opcional **¿Cuánto viste?**
  en "No coincide". Un voto por integrante y precio; se puede cambiar o quitar.
- **Estado** de cada precio del grupo, calculado con los votos de los integrantes actuales sobre el monto actual:
  *Validado*, *Dudoso* o sin validar.
- Página nueva **`/grupo/validar`** ("Por validar"): los precios de los demás de los últimos **14 días** que todavía
  no votaste y no están validados.
- Link **Por validar (N)** en `/grupo` y en la sección Grupo de `/cuenta`.
- Votar también en la tarjeta **Precios del grupo** del detalle, sobre cualquier precio que el grupo ve (60 días).
- **Insignias** "Validado" y "Dudoso" en las filas del grupo de Comercios cercanos (Buscar, oferta del lector,
  detalle), en Precios del grupo y en la línea de "¿Cuánto sale acá?".
- Los precios **Dudosos** no cuentan para "Más barato" ni como el más barato de "¿Cuánto sale acá?".
- **El autor ve los votos** de sus precios en el historial de precios del detalle, con los apodos ("Validado por Ana
  y Lucía", "No coincide para Lucía ($3.400)").
- Texto nuevo en `/privacidad`.

**Fuera de alcance:**

- Comunidad abierta (precios públicos para todos) y validación por cercanía al comercio.
- Notificaciones ("Ana cargó un precio para validar"), contador en el header o en la barra de navegación.
- Crear un precio propio desde "¿Cuánto viste?" (el monto queda solo en el voto).
- Votar desde las filas de Comercios cercanos (ahí solo se ve la insignia).
- Reputación de los integrantes, límites por día, vencimiento del estado más allá de los 60 días de la spec 22.
- Votos sobre precios propios, sobre productos sin código de barras o sobre precios de quien pausó **Compartir mis
  precios** (no se ven).
- Precios propios y del grupo en ¿Dónde conviene el carrito? (otra spec).
- Tiempo real y votar sin conexión.

## Reglas

### Votos

- Vota cualquier integrante del grupo **salvo el autor**, sin chequear ubicación (grupo de confianza).
- Solo se votan precios que el grupo ve (`group_prices`): de otro integrante con **Compartir mis precios**, de un
  producto con EAN, con comercio y de los últimos 60 días.
- Un voto por integrante y precio: **Está bien** (`ok`) o **No coincide** (`no`). Votar otra vez lo reemplaza.
- **¿Cuánto viste?** es opcional y solo va con `no`: monto mayor a 0 (el mismo rango que `group_prices`). No crea un
  precio propio.
- Cada voto guarda el **monto votado**, que la base toma de `user_records` (no lo manda la app). Si el autor cambia el
  monto, los votos anteriores **dejan de contar** y el precio vuelve a "Por validar" para todos.
- Al **salir del grupo, ser sacado o borrar la cuenta**, se borran en cascada los votos de esa persona y los votos
  sobre sus precios. "Salir y unirme" (spec 22) también.
- Un precio borrado por el autor deja de verse (sus votos quedan sin uso en la base).

### Estado

Con los votos de los integrantes actuales cuyo monto votado es igual al monto actual del precio:

| Estado | Regla | Insignia |
|---|---|---|
| **Validado** | 2 o más `ok` y más `ok` que `no` | Verde, `BadgeCheck`, "Validado" |
| **Dudoso** | 2 o más `no` y al menos tantos `no` como `ok` | Ámbar, `TriangleAlert`, "Dudoso" |
| Sin validar | Cualquier otro caso (también sin votos) | Ninguna |

- El estado se calcula en la app (`priceValidation`, función pura con tests), no se guarda.
- Los montos se comparan en centavos (`centsDiff` de `shelf-price.ts`), como el resto de las comparaciones.

### Efecto del estado

- **Comercios cercanos** (`NearbyStores`): las filas del grupo llevan la insignia junto a "Cargado por Ana · 12/11".
  Una fila **Dudosa** nunca lleva "Más barato": el más barato se elige entre las demás filas.
- **"¿Cuánto sale acá?"** (`shelfComparison`): los precios del grupo Dudosos no entran en `cheapestNear`. Si el más
  barato es del grupo y está Validado, la aclaración pasa de " (Ana · 12/11)" a " (Ana · 12/11, validado)".
- **Precios del grupo** (detalle): insignia, resumen de votos (`validationSummary`) y botones de voto en cada fila.
  El orden no cambia (precio y después fecha); un Dudoso se sigue mostrando.
- Los Dudosos **se siguen viendo**: el aviso alcanza para que nadie se guíe por ellos.

### Por validar (`/grupo/validar`)

- Una llamada a `pending_validations()`: los precios de los demás integrantes con **Compartir mis precios**, de
  productos con EAN y con comercio, de los **últimos 14 días**, con sus votos. Hasta 200, del más nuevo al más viejo.
- En la app, `pendingValidations(rows, myUserId)` deja solo el último de cada integrante en cada comercio para cada
  producto (como `latestGroupPrices`) y saca los que ya votaste (sobre el monto actual) y los **Validados**. Un Dudoso
  que no votaste sigue en la lista.
- Cada fila: imagen de 48 px (`useSepaImages`, una consulta para toda la lista), nombre del producto del autor, marca
  y presentación (lo que exista), comercio con dirección o barrio, precio, "Cargado por Ana · 12/11", el resumen de
  votos si tiene y los botones **Está bien** y **No coincide**.
- Votar no saca la fila mientras la página está abierta: queda el botón marcado (`aria-pressed`) para poder
  cambiarlo o quitarlo; el contador "Por validar (N)" baja. Al volver a la página, ya no está.
- Hasta 20 filas y "Ver N más".
- Vacía: "No hay precios por validar" y "Cuando alguien del grupo cargue un precio, aparece acá.".
- Estados: sin Supabase, "Los grupos no están disponibles"; sin sesión, "Entrá con tu cuenta para validar precios"
  con **Entrar**; sin grupo, "Unite a un grupo para validar precios" con link a `/grupo`; "Cargando…"; si falla, "No
  se pudo cargar" con **Reintentar**.
- Link "Grupo" con flecha para volver; ninguna pestaña de la barra queda activa.

### Botones de voto (`PriceVoteButtons`)

- Dos botones de 44 px con texto e ícono (`ThumbsUp` / `ThumbsDown`, `aria-hidden`): **Está bien** y **No
  coincide**, con `aria-pressed` según el voto propio. El `aria-label` nombra el precio ("Está bien: $3.200 en
  Almacén Don Luis").
- Tocar uno sin voto o con el otro: vota (`vote_price`). Tocar el marcado: quita el voto (`unvote_price`).
- Después de **No coincide**, aparece debajo **¿Cuánto viste? (opcional)** (`NumberInput` con teclado decimal) y
  **Guardar**, que vuelve a llamar a `vote_price` con el monto. El voto ya quedó registrado sin el monto.
- Mientras se guarda, los botones quedan deshabilitados (`aria-busy`). Error junto a los botones (`role="alert"`):
  sin conexión, "No se pudo guardar. Revisá la conexión."; `price_not_found`, "Ese precio ya no está en el grupo.";
  `not_in_group`, el mensaje de la spec 22.
- Cada voto vacía la caché de precios del grupo (`clearGroupPrices`): las pantallas abiertas vuelven a pedirlos con
  el estado nuevo.

### Resumen de votos (`validationSummary`)

Con los votos que cuentan, en orden de voto:

- Validado: "Validado por Ana y Lucía" (con 3 o más: "Validado por Ana, Lucía y Pedro").
- Dudoso: "No coincide para Lucía ($3.400) y Pedro".
- Sin validar con votos: "Está bien para Ana · No coincide para Pedro ($3.400)".
- Sin votos: nada.
- El voto propio se muestra como "vos" ("Validado por vos y Ana").

### El autor (historial del detalle)

- Con sesión y grupo, cada precio propio de un producto con EAN muestra debajo, si tiene votos que cuentan, la
  insignia y el resumen. Una llamada a `my_price_votes(ids)` con los `id` de los precios del historial (hasta 100).
- Los votos que cuentan se calculan contra el **monto local** del precio: si se editó y todavía no se sincronizó, los
  votos viejos ya no se muestran.
- Sin sesión, sin grupo o con error, el historial queda como hoy.

### Contador "Por validar (N)"

- `/grupo` (con grupo): fila **Por validar** con la cantidad y chevron, arriba de Invitar; con 0, "Por validar" sin
  número (la página sigue accesible).
- `/cuenta`, sección Grupo: "Por validar (N)" como link, solo con N mayor a 0.
- Sale de `usePendingValidations()`: la misma llamada y el mismo filtro que la página.

## Modelo de datos

### Supabase (migración nueva `supabase/migrations/<fecha>_validacion.sql`)

```sql
create table public.price_votes (
  group_id   uuid             not null,
  owner_id   uuid             not null,   -- autor del precio
  price_id   text             not null,   -- id del precio en user_records (collection = 'prices')
  voter_id   uuid             not null,
  verdict    text             not null check (verdict in ('ok', 'no')),
  amount     double precision not null,   -- monto votado, tomado de user_records
  seen       double precision check (seen > 0 and seen < 1e9),  -- "¿Cuánto viste?"
  created_at timestamptz      not null default now(),
  primary key (owner_id, price_id, voter_id),
  check (voter_id <> owner_id),
  check (seen is null or verdict = 'no'),
  -- Salir, ser sacado o borrar la cuenta borra los votos propios y los votos sobre los precios propios
  foreign key (group_id, owner_id) references public.group_members (group_id, user_id) on delete cascade,
  foreign key (group_id, voter_id) references public.group_members (group_id, user_id) on delete cascade
);
create index price_votes_voter on public.price_votes (group_id, voter_id);
```

- RLS activado **sin permisos directos**, como `groups` y `group_members`: todo pasa por funciones
  `security definer` con `search_path = ''` que validan con `auth.uid()`.
- Códigos de error nuevos, traducidos por `groupErrorMessage`: `price_not_found`, `own_price`, `invalid_amount`.

| Función | Qué hace |
|---|---|
| `vote_price(p_owner uuid, p_price_id text, p_verdict text, p_seen double precision default null)` | Controla que el autor sea otro integrante del mismo grupo con `share_prices`, que el precio exista, no esté borrado, sea de un producto con EAN y de los últimos 60 días (si no, `price_not_found`) y que `p_seen` esté en rango; guarda el voto con el monto actual (`insert … on conflict do update`) |
| `unvote_price(p_owner uuid, p_price_id text)` | Borra el voto propio, si existe |
| `group_prices(p_eans text[])` | Igual que en la spec 22, con tres columnas más: `price_id text`, `product_name text` y `votes jsonb` (`[{ voterId, member, verdict, amount, seen, at }]`, de los integrantes actuales, en orden de voto). Cambia el tipo de retorno: `drop function` y `create`, con los mismos `revoke`/`grant` |
| `pending_validations()` | Los precios de los demás integrantes con `share_prices`, de productos con EAN y con comercio, de los últimos 14 días: las columnas de `group_prices` más `brand`, `size` y `size_unit` del producto. Hasta 200, del más nuevo al más viejo |
| `my_price_votes(p_price_ids text[])` | Los votos de los integrantes actuales sobre los precios propios de esos `id` (ignora lo que pase de 100): `(price_id, voter_id, member, verdict, amount, seen, at)` |

Todas para `authenticated`; ninguna para `anon`.

### En la app

Sin claves nuevas de `localStorage`: los votos se consultan a la base, como los precios del grupo.

```typescript
// src/lib/price-validation.ts
export const VALIDATION_DAYS = 14;

export type Verdict = 'ok' | 'no';
export type ValidationStatus = 'validado' | 'dudoso' | 'sin_validar';

export interface PriceVote {
  voterId: string;
  member: string;      // apodo actual
  verdict: Verdict;
  amount: number;      // monto votado
  seen?: number;       // "¿Cuánto viste?"
  at: string;          // ISO
}

export interface PriceValidation {
  status: ValidationStatus;
  votes: PriceVote[];  // solo los que cuentan (monto votado = monto actual), en orden de voto
}

/** Precio por validar de otro integrante */
export interface PendingPrice extends GroupPrice {
  productName: string;
  brand?: string;
  size?: number;
  sizeUnit?: Unit;
}

/** Estado con los votos sobre el monto actual (en centavos) */
export function priceValidation(votes: PriceVote[], amount: number): PriceValidation;
/** El voto propio que cuenta, si hay */
export function myVote(validation: PriceValidation, myUserId: string): PriceVote | undefined;
/** "Validado por Ana y Lucía", "No coincide para Lucía ($3.400) y Pedro", …; '' sin votos */
export function validationSummary(validation: PriceValidation, myUserId: string): string;
/** El último de cada integrante en cada comercio por producto, sin los votados por mí ni los validados */
export function pendingValidations(prices: PendingPrice[], myUserId: string): PendingPrice[];
```

`GroupPrice` (`src/lib/group.ts`) suma `priceId: string` y `validation: PriceValidation`, armados en
`groupPriceFromRow` con `priceValidation(votes, amount)`. `latestGroupPrices` y `groupPricesNear` no cambian.

Llamadas a la base (sin tests automáticos), con `.retry(false)`: `votePrice`, `unvotePrice`, `fetchPendingValidations`
y `fetchOwnPriceVotes`. Hooks: `usePendingValidations()` y `useOwnPriceVotes(priceIds)` en `src/components/`.

## UI/UX

```
/grupo/validar:
│ ← Grupo                                         │
│ Por validar                                     │
│ Precios que cargó tu grupo en los últimos 14    │
│ días. Si sabés cuánto salen, contá si están     │
│ bien.                                           │
│ ┌─────────────────────────────────────────────┐ │
│ │ [img] Yerba Playadito 1 kg         $3.200   │ │
│ │       Almacén Don Luis · Av. Rivadavia 5100 │ │
│ │       Cargado por Ana · 12/11               │ │
│ │ [👍 Está bien]  [👎 No coincide]             │ │
│ ├─────────────────────────────────────────────┤ │
│ │ [img] Leche La Serenísima 1 l      $1.150   │ │
│ │       Coto — Cabildo · Belgrano             │ │
│ │       Cargado por Lucía · 21/11             │ │
│ │       Está bien para Pedro                  │ │
│ │ [👍 Está bien]  [👎 No coincide ●]           │ │
│ │ ¿Cuánto viste? (opcional) [ 1.300 ] [Guardar]│ │
│ └─────────────────────────────────────────────┘ │

Comercios cercanos (fila del grupo):
│ Almacén Don Luis             $3.200  [Agregar]  │
│ Av. Rivadavia 5100 · 250 m          [Mapa]      │
│ Cargado por Ana · 12/11 · [✔ Validado]          │
```

- Los íconos del dibujo son de `lucide-react` (`ThumbsUp`, `ThumbsDown`, `BadgeCheck`, `TriangleAlert`,
  `ChevronRight`, `ArrowLeft`), con `aria-hidden="true"`; sin emojis en la UI.
- Insignias como píldoras (`rounded-full`, `text-xs`): verde (`bg-green-100 text-green-800`) y ámbar
  (`bg-amber-100 text-amber-800`), con texto, no solo color.
- Botones de voto con `.btn-secondary` y, marcados, el borde y el fondo del color del voto (verde / rojo).
- 375 px sin scroll horizontal: en el celular, los botones de voto en una fila debajo del precio, de igual ancho.
- Diseño con `/frontend-design` y `/ui-ux-pro-max` al implementar.

## Plan de implementación

1. **Funciones puras (TDD)**: `src/lib/price-validation.ts` con los tipos, `priceValidation`, `myVote`,
   `validationSummary` y `pendingValidations`, con tests en `price-validation.test.ts`: umbrales (1 ok, 2 ok, 2 ok y
   2 no, 2 no y 1 ok, 3 no y 3 ok), votos sobre otro monto ignorados, centavos, resumen con 1, 2 y 3 nombres, "vos" y
   "¿Cuánto viste?", y el filtro de pendientes (votado, validado, dudoso sin votar, último por integrante y comercio).
2. **Base**: migración `supabase/migrations/<fecha>_validacion.sql` (tabla, RLS sin permisos directos, funciones y el
   `group_prices` nuevo). **La aplica el usuario** con `npx supabase db push --linked`. Verificar con el MCP y dos o
   tres cuentas: no se vota lo propio ni un precio de otro grupo o de quien pausó, el monto votado sale de la base,
   cambiar el monto deja de contar los votos, salir del grupo borra los votos en las dos direcciones, y `explain
   analyze` de `group_prices` y `pending_validations`.
3. **Datos del grupo**: `GroupPrice` con `priceId` y `validation` (`groupPriceFromRow`, tests en `group.test.ts`);
   llamadas `votePrice`, `unvotePrice`, `fetchPendingValidations`, `fetchOwnPriceVotes`; códigos nuevos en
   `groupErrorMessage`; hooks `usePendingValidations` y `useOwnPriceVotes`.
4. **Estado en las pantallas**: `ValidationBadge.tsx`; `NearbyStores` con la insignia y sin "Más barato" en las filas
   Dudosas; `shelfComparison` sin los Dudosos y con ", validado" (tests nuevos en `shelf-price.test.ts`).
5. **Votar en el detalle**: `PriceVoteButtons.tsx` (votar, cambiar, quitar, "¿Cuánto viste?", errores) en
   `GroupPricesCard`, con insignia y resumen por fila.
6. **Por validar**: `src/app/grupo/validar/page.tsx` con los estados y la lista; fila **Por validar (N)** en
   `/grupo` y link en `/cuenta`.
7. **Autor**: insignia y resumen en el historial de precios de `ProductDetail.tsx` con `useOwnPriceVotes`.
8. **Privacidad y docs**:
   - `/privacidad`: con un grupo, tus votos (con tu apodo y el monto de "¿Cuánto viste?") los ven el autor y el resto
     del grupo; se borran al salir del grupo o borrar la cuenta.
   - `CLAUDE.md`: Estructura, Arquitectura (votos y estado), tablas de Supabase, Rutas (`/grupo/validar`),
     Funcionalidades (Buscar, lector, detalle, Cuenta, Grupo) y Estado Actual.
   - `docs/features/08-consulta-y-aportes.md`, `docs/roadmap.md` y `docs/ideas.md`: spec 23 hecha.

**A revisar (sin test automático):**

- Tres cuentas en un grupo: Ana carga un precio, Germán y Lucía dicen "Está bien" y aparece "Validado" en el teléfono
  de los tres (en el de Ana, en su historial).
- Dos "No coincide" con "¿Cuánto viste?": la fila queda Dudosa, pierde "Más barato" y deja de ganar "¿Cuánto sale acá?".
- Ana edita el monto: la insignia desaparece y el precio vuelve a "Por validar".

## Criterios de aceptación

- [ ] En la tarjeta Precios del grupo, **Está bien** registra el voto y el botón queda marcado (`aria-pressed`); tocarlo
      otra vez lo quita; tocar **No coincide** lo cambia.
- [ ] Después de **No coincide**, "¿Cuánto viste?" guarda el monto y el resumen dice "No coincide para vos ($3.400)".
- [ ] Con 2 "Está bien" y ningún "No coincide", el precio muestra "Validado" en Comercios cercanos, Precios del grupo y
      el historial del autor ("Validado por Germán y Lucía").
- [ ] Con 2 "No coincide" y 1 "Está bien", el precio muestra "Dudoso" y no lleva "Más barato" aunque sea el menor.
- [ ] Con 2 "Está bien" y 2 "No coincide", el precio queda Dudoso.
- [ ] "¿Cuánto sale acá?" no usa un precio del grupo Dudoso como el más barato; uno Validado suma ", validado".
- [ ] Cambiar el monto de un precio votado hace que sus votos dejen de contar: sin insignia y de nuevo en "Por validar".
- [ ] `/grupo/validar` lista los precios de los demás de los últimos 14 días sin votar ni validar, el último de cada
      integrante en cada comercio por producto; uno de 15 días no aparece.
- [ ] Un precio Dudoso que no voté aparece en "Por validar"; uno que voté, no (al volver a la página).
- [ ] "Por validar (N)" en `/grupo` y en `/cuenta` muestra la misma cantidad que la lista; en `/cuenta` no aparece con 0.
- [ ] La base rechaza votar un precio propio, uno de otro grupo, uno de quien pausó **Compartir mis precios** y uno de
      más de 60 días (probado contra la API).
- [ ] El monto votado lo guarda la base: un `vote_price` armado a mano no puede votar otro monto.
- [ ] Salir del grupo (o ser sacado, o borrar la cuenta) borra los votos de esa persona y los votos sobre sus precios.
- [ ] Ninguna respuesta de las funciones nuevas incluye el mail de un integrante.
- [ ] Sin sesión, sin grupo, sin Supabase o sin conexión, Buscar, el lector y el detalle se ven igual que en la spec 22;
      `/grupo/validar` muestra el estado que corresponde.
- [ ] `/privacidad` explica quién ve los votos y cuándo se borran.
- [ ] 375 px sin scroll horizontal; `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.

## Decisiones

- **Página "Por validar" y botones en el detalle** (elegido): la página sirve para validar en lote; el detalle, en
  contexto. Descartado: solo la página (obliga a ir y venir) y solo el detalle (no hay forma de ver qué falta).
- **14 días en "Por validar"** (elegido por el usuario) y **60 en el detalle**: la lista se mantiene corta, pero
  cualquier precio que el grupo ve se puede votar.
- **2 ok / 2 no con mayoría** (elegido): un solo voto no alcanza para ninguno de los dos estados; el empate va a
  Dudoso, del lado de la cautela. Descartado: un solo "No coincide" ya es Dudoso (uno solo puede bloquear al grupo) y
  solo Validado (un precio que todos dicen que está mal seguiría ganando).
- **Dudoso se ve pero no cuenta** (elegido). Descartado: ocultarlos (el autor y el grupo pierden la discusión) y solo
  insignias (un precio mal cargado seguiría como "Más barato").
- **"¿Cuánto viste?" solo en el voto** (elegido): no se mezcla con los precios propios. Si quien vota quiere
  registrarlo, usa Cargar precio.
- **El autor ve los votos con apodos** (elegido): en un grupo chico los apodos ya se ven; saber quién dijo que no
  ayuda a corregir.
- **El voto guarda el monto y deja de contar si cambia** (elegido): un precio corregido no hereda votos de otro monto.
  El monto lo toma la base de `user_records`, no la app, para que no se pueda votar un monto inventado.
- **Votos borrados al salir del grupo** (elegido), con claves foráneas a `group_members` en cascada: solo cuentan votos
  entre integrantes actuales y no hace falta código de limpieza. Descartado: que queden (votos de alguien que ya no
  está, y datos de una persona que se fue).
- **Cualquier integrante vota, sin ubicación** (elegido): grupo de confianza; la cercanía al comercio es de la
  comunidad abierta, y la ubicación no sale del teléfono.
- **Estado calculado en la app** con una función pura y testeada, no en la base: la base devuelve los votos y la regla
  vive en un solo lugar. `pending_validations` devuelve los votos para que el filtro de pendientes use la misma regla.
- **Tabla aparte `price_votes`** en lugar de guardar los votos dentro del precio en `user_records`: el precio es del
  autor (solo él lo escribe, RLS de la spec 21) y los votos son de los demás.
- **Funciones `security definer` sin permisos directos**, como la spec 22: las reglas (mismo grupo, no lo propio,
  precio visible) quedan en un solo lugar.
- **Votar vacía la caché del grupo** (`clearGroupPrices`) en lugar de actualizarla a mano: ya existe y las pantallas
  saben volver a pedir.
- **Contador solo en `/grupo` y `/cuenta`** (elegido): sin punto en el header, que hoy avisa solo de la
  sincronización.
- **Numeración**: la spec conserva el número 23 que le reservó la spec 21, aunque ya existan specs posteriores.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Dos integrantes se ponen de acuerdo para validar un precio falso | Grupo de confianza de hasta 20; se ve quién votó; el administrador puede sacar a alguien (y sus votos se borran) |
| Uno solo marca Dudosos los precios de otro a propósito | Hacen falta 2 "No coincide" y al menos tantos como ok; el autor ve quién votó |
| `group_prices` más lenta por los votos | `price_votes` es chica (grupos de 20) y su clave empieza por `(owner_id, price_id)`; `explain analyze` en el paso 2 |
| `pending_validations` devuelve muchas filas | 14 días, hasta 200 y una sola llamada por página |
| El autor edita el monto sin conexión y los demás votan el monto viejo | Esos votos dejan de contar cuando el teléfono del autor sincroniza; el precio vuelve a "Por validar" |
| Cambiar el tipo de retorno de `group_prices` rompe la app publicada entre la migración y el deploy | Las columnas nuevas van al final; la app de la spec 22 lee las columnas por nombre y las nuevas se ignoran. Igual, aplicar la migración y desplegar seguido |
| La caché de 5 minutos muestra un estado viejo en otro teléfono | Aceptado, como en la spec 22; el que vota ve el cambio enseguida |

## Qué **no** entra en esta spec

- Comunidad abierta y validación por cercanía.
- Notificaciones y contador en el header o la barra.
- Precio propio desde "¿Cuánto viste?".
- Votar desde Comercios cercanos.
- Reputación, límites por día y vencimiento del estado.
- Precios propios y del grupo en ¿Dónde conviene el carrito?
- Tiempo real y votos sin conexión.
