# 02 — Comparación por comercio

- **Estado:** Parcial
- **Fase:** 1 (sin backend)

## Problema

Con el historial se quiere responder: **¿en qué comercio conseguí este producto más barato?** y **¿cuánto
subió en el mismo local entre una compra y otra?** Hoy la app compara precios en el tiempo, pero no los
agrupa por comercio.

## Qué existe hoy

- `Price` guarda `barrio` (requerido) y `store` (opcional) como **texto libre** (`src/lib/models.ts`).
- Detalle de producto (`/product/:id`): lista el historial con barrio, tienda y fecha, más estadísticas
  generales (`getPriceStats` en `src/lib/store.ts`), sin separar por comercio.
- Carrito: badge contra el precio de la **última compra** (`getLastPurchasedPrice`), sin importar dónde fue.
- Historial de compras (`/purchases`): variación del precio pagado vs el último precio registrado.
- Checkout: si no se marca "comercio único", los precios se registran con barrio `Sin especificar` y sin
  tienda (`src/app/cart/page.tsx`), así que esos datos no sirven para comparar comercios.

## Alcance MVP

- **Detalle de producto → sección "Por comercio"**: una fila por comercio con último precio, fecha y
  diferencia contra el más barato; marcar el mejor precio.
- **Filtro del historial** del producto por comercio (y por barrio).
- **Historial de compras**: además de la variación general, mostrar la variación contra la última compra
  **en el mismo comercio**.
- **Checkout**: pedir comercio para toda la compra (o por ítem) en lugar de registrar `Sin especificar`.

## Evolución futura

- Ranking de comercios por canasta: "con tu última compra, este local te salía $X más barato".
- Mapa de precios por barrio.
- Con backend (Fase 2): precios compartidos entre vecinos, no solo los propios.

## Modelo de datos propuesto

Prerrequisito: **catálogo de comercios** normalizado, reutilizado luego por los features 04 y 05.

```typescript
interface Store {
  id: string;
  name: string;      // "Coto"
  barrio: string;    // "Caballito"
  address?: string;
}

interface Price {
  // ...
  storeId?: string;  // nuevo; barrio/store quedan por compatibilidad
}

interface Purchase {
  // ...
  storeId?: string;
}
```

- Nueva clave `preciolocal_stores`.
- Migración: generar `Store` a partir de los pares `barrio` + `store` existentes (normalizando mayúsculas y
  espacios) y completar `storeId` en cada `Price`.
- Nuevos métodos en `DataService`: `getStores()`, `addStore()`, `getLatestPriceByStore(productId)`,
  `getLastPurchasedPriceAtStore(productId, storeId)`.

## UI/UX

- Selector de comercio con autocompletar (elige uno existente o crea uno nuevo) en "Cargar precio" y en el
  checkout, para evitar duplicados como "Coto" / "coto" / "COTO".
- En la tabla "Por comercio", ordenar del más barato al más caro.

## Dependencias

- Catálogo de comercios (definido en este mismo feature).

## Preguntas abiertas

- ¿El comercio se define por compra o puede variar por ítem (compra repartida en varios locales)?
- ¿Cuánto tiempo un precio sigue siendo "vigente" para comparar (p. ej. descartar precios de más de 60 días)?
