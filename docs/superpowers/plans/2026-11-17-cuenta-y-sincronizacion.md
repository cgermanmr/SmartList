# Cuenta y sincronización — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: usar superpowers:subagent-driven-development (recomendado) o
> superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`).

**Objetivo:** login optativo (Google o mail con código/link) y sincronización local primero de productos, precios,
carrito, compras y calculadora en `user_records`, sin datos de ejemplo.

**Arquitectura:** el store de Zustand sigue siendo la fuente de la UI y sigue guardando en `localStorage`. La
suscripción de persistencia detecta los registros cambiados (`diffCollection`) y los encola en
`preciolocal_outbox`; un motor (`sync-engine.ts`) sube la cola con `upsert` y baja filas por `synced_at`, y las
junta con funciones puras (`mergeRemote`, `dedupeByEan`, `dedupeCart`). La seguridad es RLS en Postgres.

**Stack:** Next.js 16 (App Router, Cache Components), React 19, Zustand 5, @supabase/supabase-js 2, Vitest, Supabase CLI.

**Spec:** [`specs/21-cuenta-y-sincronizacion.md`](../../../specs/21-cuenta-y-sincronizacion.md) (leerla entera
antes de cada tarea: reglas, textos de UI y criterios de aceptación están ahí).

## Restricciones globales

- UI y comentarios en español; textos de la UI **exactamente** como en la spec.
- Todo lo de auth y sync corre en el cliente después de `hydrate`; nada en el prerender (`Date.now()` solo en
  handlers o funciones llamadas en el cliente).
- Sin variables de Supabase (`supabase === null`): sin cuenta, sin sync, el build pasa y la app es la de hoy.
- La ubicación (`preciolocal_location`) **nunca** entra en la cola ni en `user_records`.
- Las acciones del store no mutan (la detección de cambios depende de eso).
- Íconos de `lucide-react` con `aria-hidden`; botones de solo ícono con `aria-label`; toque mínimo 44 px.
- Diálogos nuevos con `<dialog>` + `showModal()`, cerrados en la limpieza del efecto (por `<Activity>`).
- Commits con el estilo del repo (título en español, cuerpo explicativo, trailer `Claude-Session`).
- Cada tarea termina con `npm run lint`, `npm test` y `npm run build` sin errores.

## Foco de la revisión

1. **Cambio local mientras un push está en vuelo:** no debe salir de la cola al confirmarse el push anterior
   (`acknowledge` compara `modifiedAt`). Test en la tarea 2.
2. **La misma fila bajada dos veces** (margen de 5 min del cursor): aplicar dos veces no cambia nada. Test en la tarea 2.
3. **Borrado remoto de un registro con una edición local pendiente más nueva:** gana lo local y el registro sigue.
   Test en la tarea 2.
4. **`Price.date` después del merge:** queda como string ISO (los consumidores ya hacen `new Date(p.date)`); no
   romper `getPriceStats` con datos bajados. Test en la tarea 2.
5. **Cerrar sesión sin conexión con cambios pendientes:** nunca se pierden en silencio; se confirma con la
   cantidad. Test del motor en la tarea 6 (`pendingCount` después de un push fallido).

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20261118000000_user_records.sql` | Tabla, índice, RLS, trigger, `delete_my_account()` |
| `src/lib/sync.ts` (+ `sync.test.ts`) | Tipos y funciones puras: diff, cola, merge, dedupe, datos de ejemplo |
| `src/lib/sync-remote.ts` | Únicas llamadas a Supabase del sync: `pushRecords`, `pullRows` |
| `src/lib/sync-engine.ts` (+ `sync-engine.test.ts`) | Motor: cola persistida, push/pull, primera sesión, estado observable |
| `src/lib/auth.ts` (+ `auth.test.ts`) | Login/logout/borrado y helpers puros (`displayName`, `validEmail`, `validCode`, `isIosStandalone`) |
| `src/lib/privacy.ts` | `PRIVACY_CONTACT` (pendiente de completar) |
| `src/components/useAuth.ts` | Hook de la sesión (`onAuthStateChange`) |
| `src/components/SyncManager.tsx` | Arranca/para el motor según la sesión; disparadores `online` / `visibilitychange` |
| `src/components/AccountButton.tsx` | Ícono del header |
| `src/components/ConfirmDialog.tsx` | `<dialog>` de confirmación reutilizable |
| `src/app/cuenta/page.tsx`, `src/app/privacidad/page.tsx` | Páginas nuevas |
| Modificar: `src/lib/supabase.ts`, `storage.ts`, `store.ts`, `ids.ts` (uso), `app/layout.tsx`, `app/page.tsx` y los `newId()` de ids de registros | |

---

### Tarea 1: Migración `user_records`

**Archivos:** crear `supabase/migrations/20261118000000_user_records.sql`.

**Interfaces:** produce la tabla `public.user_records` (columnas de la spec) y la función
`public.delete_my_account() returns void`.

- [ ] **Paso 1:** escribir la migración: tabla e índice como en la spec; RLS con tres políticas `to authenticated`
  (`select using (user_id = auth.uid())`, `insert with check (user_id = auth.uid())`, `update using (...) with check
  (...)`); sin política de `delete` (los borrados son `deleted = true`).
- [ ] **Paso 2:** trigger `user_records_touch` `before insert or update for each row`:
  ```sql
  if tg_op = 'UPDATE' and new.modified_at < old.modified_at then
    return old;            -- un cambio viejo no pisa uno nuevo; synced_at queda como estaba
  end if;
  new.synced_at := now();
  return new;
  ```
- [ ] **Paso 3:** `delete_my_account()` en `plpgsql`, `security definer`, `set search_path = ''`, `delete from
  auth.users where id = auth.uid()`; `revoke execute ... from public, anon; grant execute ... to authenticated`.
- [ ] **Paso 4: mostrarle el SQL al usuario y esperar su ok** (es la base de producción). Con el ok:
  `npx supabase db push --linked`. Esperado: "Finished supabase db push".
- [ ] **Paso 5: verificar RLS** con el MCP de Supabase (`execute_sql`), dentro de `begin … rollback`: crear dos
  usuarios en `auth.users`, `set local role authenticated` + `set local request.jwt.claims` con el `sub` de cada
  uno; comprobar que A inserta su fila, que B no la ve (`select` → 0 filas), que B no puede insertar con
  `user_id` de A (error de RLS) y que un `upsert` con `modified_at` menor no cambia `data`. Correr
  `get_advisors` (security): sin avisos nuevos sobre `user_records` ni sobre `delete_my_account`.
- [ ] **Paso 6: commit** "Tabla user_records con RLS para la cuenta (spec 21)".

### Tarea 2: Funciones puras de sincronización

**Archivos:** crear `src/lib/sync.ts`, `src/lib/sync.test.ts`.

**Interfaces (produce):**

```typescript
export type Collection = 'products' | 'prices' | 'cart' | 'purchases' | 'settings';
export const CALCULATOR_RECORD_ID = 'calculator';
export interface SyncRecord { collection: Collection; id: string; data: unknown; deleted: boolean; modifiedAt: string } // data null si deleted
export interface RemoteRow { collection: Collection; id: string; data: unknown; deleted: boolean; modified_at: string; synced_at: string }
export interface SyncData { products: Product[]; prices: Price[]; cart: CartItem[]; purchases: Purchase[]; calculator: CalculatorState }

export function diffCollection<T extends { id: string }>(prev: T[], next: T[]): { changed: T[]; removedIds: string[] };
export function changesToRecords(prev: SyncData, next: SyncData, modifiedAt: string): SyncRecord[];
export function snapshotRecords(data: SyncData, modifiedAt: string): SyncRecord[];   // todo, para la primera sesión
export function enqueue(outbox: SyncRecord[], records: SyncRecord[]): SyncRecord[];  // reemplaza por collection+id
export function acknowledge(outbox: SyncRecord[], sent: SyncRecord[]): SyncRecord[]; // saca solo si coincide modifiedAt
export function mergeRemote(data: SyncData, rows: RemoteRow[], outbox: SyncRecord[]): SyncData;
export function dedupeByEan(data: SyncData): SyncData;
export function dedupeCart(cart: CartItem[], modifiedAt: ReadonlyMap<string, string>): CartItem[];
export function withoutSamples(data: SyncData): SyncData;
export function pullSince(cursor: string | null): string | null;  // cursor - 5 min (ISO); null → null
```

- [ ] **Paso 1: tests** en `sync.test.ts` (fixtures mínimos con `Product`/`Price`/`CartItem`/`Purchase`):
  - `diffCollection`: elemento nuevo y elemento con referencia distinta → `changed`; misma referencia → nada;
    `id` ausente en `next` → `removedIds`.
  - `changesToRecords`: un precio agregado → 1 registro `{ collection: 'prices', deleted: false }`; un ítem quitado
    del carrito → `{ collection: 'cart', deleted: true, data: null }`; calculadora con referencia nueva →
    `{ collection: 'settings', id: 'calculator' }`; mismas referencias → `[]`.
  - `enqueue`: dos cambios del mismo `collection + id` dejan uno, el último.
  - `acknowledge`: saca lo enviado; **si después del envío se encoló otro cambio del mismo registro (otro
    `modifiedAt`), queda** (foco 1).
  - `mergeRemote`: fila nueva → se agrega; fila con `deleted` → se quita; fila de un registro con pendiente local
    de `modifiedAt` mayor → queda lo local (foco 3); pendiente local más viejo → gana la fila; **aplicar dos veces
    las mismas filas da el mismo resultado** (foco 2); precio bajado con `date` string → `getPriceStats` lo usa
    sin error (foco 4); fila `settings/calculator` → reemplaza `calculator`; las compras quedan ordenadas por
    `date` descendente.
  - `dedupeByEan`: productos `'a'` y `'b'` con el mismo `ean` → queda `'a'` (id menor como texto); precios,
    ítems del carrito y `items` de compras con `productId: 'b'` pasan a `'a'`; productos sin `ean` no se tocan.
  - `dedupeCart`: dos ítems con el mismo `productId` → queda el de `modifiedAt` mayor según el mapa (sin entrada
    = más viejo), con su cantidad, precio y comercio.
  - `withoutSamples`: productos `'1'`–`'8'` sin uso → afuera; precios `'1'`–`'3'` → afuera; producto `'2'` con un
    precio de otro `id`, o en el carrito, o en una compra → queda.
  - `pullSince('2026-11-17T12:00:00.000Z')` → `'2026-11-17T11:55:00.000Z'`; `pullSince(null)` → `null`.
- [ ] **Paso 2:** `npx vitest run src/lib/sync.test.ts` → FAIL (módulo inexistente).
- [ ] **Paso 3:** implementar `src/lib/sync.ts`. `mergeRemote` no aplica dedupe: el motor llama después a
  `dedupeByEan` y `dedupeCart` (el mapa de `modifiedAt` sale de la cola y de las filas del lote).
- [ ] **Paso 4:** `npx vitest run src/lib/sync.test.ts` → PASS.
- [ ] **Paso 5: commit** "Funciones puras de sincronización (spec 21)".

### Tarea 3: Sin datos de ejemplo e ids únicos

**Archivos:** modificar `src/lib/storage.ts` (quitar `DEFAULT_PRODUCTS` y `defaultPrices` de la carga; se
**exportan** igual sus ids como `SAMPLE_PRODUCT_IDS` / `SAMPLE_PRICE_IDS` para `withoutSamples`, o se definen en
`sync.ts`, a elección), `src/lib/store.ts` (`hydrate` con `[]`), `src/app/page.tsx` (estado vacío),
`store.test.ts`; reemplazar `newId()` por `uniqueId()` donde crea `id` de registros: `app/cart/page.tsx:141,153`,
`app/page.tsx:106,141`, `product/[id]/ProductDetail.tsx:59`, `upload/UploadForm.tsx:105,132`,
`components/NearbyStoresCard.tsx:34`.

- [ ] **Paso 1: test** en `store.test.ts`: `hydrate()` con `localStorage` vacío → `products` y `prices` son `[]`.
  Correr → FAIL.
- [ ] **Paso 2:** implementar; Buscar sin productos propios y sin texto muestra "Todavía no tenés productos" y
  debajo "Buscá un producto en Precios Claros o leé su código de barras" (con texto y sin coincidencias siguen los
  mensajes de hoy). Ajustar los tests que dependían de los datos de ejemplo.
- [ ] **Paso 3:** `npm test` → PASS; `npm run lint`; `npm run build`.
- [ ] **Paso 4: commit** "Sin datos de ejemplo e ids con sufijo aleatorio (spec 21)".

### Tarea 4: Sesión, `/cuenta`, `/privacidad` y el ícono del header

**Archivos:** modificar `src/lib/supabase.ts`, `src/app/layout.tsx`; crear `src/lib/auth.ts`,
`src/lib/auth.test.ts`, `src/lib/privacy.ts`, `src/components/useAuth.ts`, `src/components/AccountButton.tsx`,
`src/app/cuenta/page.tsx`, `src/app/privacidad/page.tsx`.

**Interfaces (produce):**

```typescript
// lib/auth.ts
export interface AccountUser { id: string; name: string; email: string }
export function displayName(user: { email?: string; user_metadata?: Record<string, unknown> }): string; // full_name ?? name ?? parte del mail antes de @
export function validEmail(text: string): boolean;
export function validCode(text: string): boolean;               // 6 dígitos, ignora espacios
export function isIosStandalone(userAgent: string, standalone: boolean): boolean;
export function signInWithGoogle(): Promise<void>;              // redirectTo `${location.origin}/cuenta`
export function sendEmailCode(email: string): Promise<void>;     // signInWithOtp, emailRedirectTo /cuenta
export function verifyEmailCode(email: string, code: string): Promise<void>;
// lib/privacy.ts
export const PRIVACY_CONTACT: { name: string; email: string } | null = null;  // pendiente (spec)
// components/useAuth.ts
export type AuthState = { status: 'off' } | { status: 'loading' } | { status: 'out' } | { status: 'in'; user: AccountUser };
export function useAuth(): AuthState;
```

- [ ] **Paso 1: tests** en `auth.test.ts`: `displayName` con `full_name`, con `name`, solo mail
  (`'ana.perez@x.com'` → `'ana.perez'`); `validEmail` (`'a@b.co'` sí, `'a@b'` no, `' a@b.co '` sí);
  `validCode` (`'123456'`, `'123 456'` sí; `'12345'`, `'abcdef'` no); `isIosStandalone` (iPhone + standalone sí;
  iPhone sin standalone no; Android standalone no). Correr → FAIL.
- [ ] **Paso 2:** implementar `auth.ts` y `privacy.ts`; `supabase.ts` con `auth: { persistSession: true,
  detectSessionInUrl: true, flowType: 'pkce' }` (actualizar el comentario: ya no es "solo lectura sin sesión").
- [ ] **Paso 3:** `useAuth` (`getSession` + `onAuthStateChange`, `off` sin Supabase), `AccountButton` (spec,
  *UI/UX → Header*; el punto ámbar llega en la tarea 7) en el header antes de `CartSummary`.
- [ ] **Paso 4:** `/cuenta`: sin sesión, Google + mail → código (estados y textos de la spec, "Reenviar el mail"
  a los 60 s, aviso de iOS standalone); con sesión, nombre, mail y **Cerrar sesión** provisorio (`signOut` simple;
  la versión completa es de la tarea 6). `/privacidad`: qué se guarda (`user_records`, sin ubicación), dónde
  (Supabase), cómo borrarlo (**Borrar mi cuenta**) y el contacto (`PRIVACY_CONTACT` o "Contacto: a completar").
  Usar los skills de diseño de UI del proyecto para las dos páginas.
- [ ] **Paso 5:** `npm test`, `npm run lint`, `npm run build` → OK. Probar en el navegador el envío del mail y el
  código (el SMTP por defecto alcanza para probar).
- [ ] **Paso 6: commit** "Login con Google o con un código por mail (spec 21)".

### Tarea 5: Motor de sincronización

**Archivos:** crear `src/lib/sync-remote.ts`, `src/lib/sync-engine.ts`, `src/lib/sync-engine.test.ts`,
`src/components/SyncManager.tsx`; modificar `src/lib/storage.ts` (`OUTBOX_KEY = 'preciolocal_outbox'`,
`SYNC_KEY = 'preciolocal_sync'`), `src/lib/store.ts` (suscripción), `src/app/layout.tsx` (montar `SyncManager`
dentro de `StoreHydrator`).

**Interfaces:**
- Consume (tarea 2): `changesToRecords`, `snapshotRecords`, `enqueue`, `acknowledge`, `mergeRemote`,
  `dedupeByEan`, `dedupeCart`, `withoutSamples`, `pullSince`.
- Produce:
  ```typescript
  // sync-remote.ts (lanza en error; el error conserva `code` de PostgREST / auth)
  export function pushRecords(userId: string, records: SyncRecord[]): Promise<void>;     // upsert de a 500
  export function pullRows(since: string | null): Promise<RemoteRow[]>;                  // de a 1.000, por synced_at
  // sync-engine.ts
  export type SyncStatus =
    | { state: 'off' } | { state: 'syncing' } | { state: 'idle'; lastSync: string | null }
    | { state: 'error'; lastSync: string | null; since: string } | { state: 'expired' };
  export const useSyncStatus: UseBoundStore<StoreApi<{ status: SyncStatus; pending: number }>>;
  export function recordLocalChanges(prev: SyncData, next: SyncData): void; // la llama la suscripción del store
  export function startSync(userId: string): Promise<void>;  // primera sesión / mismo usuario / otro usuario
  export function syncNow(): Promise<void>;                  // push y después pull; nunca dos a la vez
  export function schedulePush(): void;                       // push a los 2 s del último cambio
  export function pendingCount(): number;
  ```

- [ ] **Paso 1: tests** en `sync-engine.test.ts` con `vi.mock('./sync-remote')` y el `MemoryStorage` de
  `store.test.ts`:
  - Sin `preciolocal_sync.userId`, `recordLocalChanges` no encola nada.
  - `startSync('u1')` sin `userId` previo: encola `snapshotRecords(withoutSamples(...))`, hace push, baja con
    `since = null` y guarda `{ userId: 'u1', cursor: <mayor synced_at> }`.
  - `startSync('u1')` con `userId: 'u1'`: no re-encola todo; sube la cola existente.
  - `startSync('u2')` con `userId: 'u1'`: vacía las colecciones locales y la cola sin subirlas y baja todo.
  - Push que falla → la cola queda igual y `pendingCount()` no baja; el estado pasa a `error`.
  - Pull aplicado → el store tiene las filas y **la cola no crece** (los cambios bajados no se re-encolan); los
    cambios que agrega `dedupeByEan`/`dedupeCart` sí se encolan.
  - Dos `syncNow()` seguidos → `pushRecords` se llama una vez por vuelta (la segunda espera a la primera).
- [ ] **Paso 2:** correr → FAIL.
- [ ] **Paso 3:** implementar. La suscripción del store (`store.ts`) arma `SyncData` de `prev` y `state` y llama a
  `recordLocalChanges` salvo mientras el motor aplica datos bajados (flag del motor). `SyncManager`: con
  `useAuth().status === 'in'` llama a `startSync(user.id)`; escucha `online` y `visibilitychange` (visible) →
  `syncNow()`; con `out` deja de disparar (no borra nada: eso es de cerrar sesión).
- [ ] **Paso 4:** correr → PASS; `npm test`, `npm run lint`, `npm run build`.
- [ ] **Paso 5:** prueba manual con dos navegadores (perfil normal e incógnito) y la misma cuenta: un precio
  cargado en uno aparece en el otro al volver a la pestaña.
- [ ] **Paso 6: commit** "Sincronización de los datos con la cuenta (spec 21)".

### Tarea 6: Cerrar sesión, borrar la cuenta, sesión vencida y cuenta borrada

**Archivos:** crear `src/components/ConfirmDialog.tsx`; modificar `sync-engine.ts` (+ test), `auth.ts`,
`store.ts` (acción `resetUserData(): void` → colecciones vacías y calculadora inicial, sin tocar ubicación),
`app/cuenta/page.tsx`.

**Interfaces (produce):**
```typescript
export function signOutEverywhere(): Promise<void>;     // engine: signOut + resetUserData + borra OUTBOX_KEY y SYNC_KEY
export function deleteAccount(): Promise<void>;         // auth: rpc('delete_my_account') y después signOutEverywhere
export function forgetAccount(): void;                  // engine: borra OUTBOX_KEY y SYNC_KEY, conserva los datos
```

- [ ] **Paso 1: tests** (motor): `signOutEverywhere` deja el store vacío y borra las dos claves, y conserva
  `preciolocal_location`; con push fallido, `pendingCount()` sigue informando lo pendiente antes de cerrar (foco
  5); un error de push/pull con usuario inexistente (`getUser` → `user_not_found`, o FK `23503`) llama a
  `forgetAccount` y cierra la sesión, **conservando** las colecciones; con la sesión vencida (sin sesión pero con
  `userId`), `recordLocalChanges` sigue encolando y el estado es `expired`. Correr → FAIL.
- [ ] **Paso 2:** implementar. `/cuenta`: **Cerrar sesión** → `syncNow()`; si `pendingCount() > 0`,
  `ConfirmDialog` "Hay N cambios sin subir. Si cerrás sesión, se pierden."; **Borrar mi cuenta** →
  `ConfirmDialog` con el texto de la spec y botón rojo. Con `expired`: "Tu sesión venció. Entrá de nuevo para
  sincronizar" sobre los botones de login.
- [ ] **Paso 3:** correr → PASS; lint, test, build.
- [ ] **Paso 4:** prueba manual: cerrar sesión deja el teléfono vacío y volver a entrar trae todo; borrar la cuenta
  en una pestaña y sincronizar en la otra conserva sus datos y la deja sin sesión.
- [ ] **Paso 5: commit** "Cerrar sesión y borrar la cuenta (spec 21)".

### Tarea 7: Estado de la sincronización y documentación

**Archivos:** modificar `app/cuenta/page.tsx`, `AccountButton.tsx`, `CLAUDE.md`, `docs/roadmap.md`, la spec.

- [ ] **Paso 1:** `/cuenta` con `useSyncStatus`: "Sincronizado hace N min" (`formatRelative`-like con
  `lib/format.ts`; si no existe, agregar función pura con test), "Sincronizando…", "N cambios sin subir · Sin
  conexión", "No se pudo sincronizar" + **Reintentar** (`syncNow`). `AccountButton`: punto ámbar si `state ===
  'error'` y `since` tiene más de 1 h.
- [ ] **Paso 2:** `CLAUDE.md`: propósito/fase (Fase 2 en curso), stack, estructura (archivos nuevos), arquitectura
  (sección *Cuenta y sincronización*), persistencia (claves nuevas, sin datos de ejemplo, ubicación sin
  sincronizar), rutas (`/cuenta`, `/privacidad`), funcionalidades, configuración de Supabase/Google, estado actual.
  `docs/roadmap.md`: la Fase 2 empieza con la spec 21. Spec: estado "Implementado" y criterios marcados con lo
  probado.
- [ ] **Paso 3:** verificación completa: lint, test, build; 375 px sin scroll horizontal en `/cuenta` y
  `/privacidad`; recorrer los criterios de aceptación de la spec (los que dependen de Google, cuando el usuario
  haya cargado las credenciales).
- [ ] **Paso 4: commit** "Estado de la sincronización y documentación (spec 21)".

## Configuración del dueño (en paralelo, no bloquea las tareas 1–3)

Pasos 1–3 de *Configuración* en la spec: credenciales de Google, URLs de redirección, plantilla del mail con
`{{ .Token }}` y, para producción, SMTP propio. El login por mail se puede probar en cuanto la plantilla tenga el
código.
