# SPEC 01 — Calculadora de precio unitario

> **Estado:** Implementado
> **Depende de:** —
> **Fecha:** 2026-10-27
> **Objetivo:** Agregar una página `/calculadora` que compare de 2 a 6 presentaciones de un producto por precio por kg, litro o unidad, con promociones opcionales, y recuerde la última comparación.

Origen: [`docs/features/01-calculadora-precio-unitario.md`](../docs/features/01-calculadora-precio-unitario.md).

## Por qué existe esta spec

El mismo producto viene en tamaños distintos y con promociones que cambian el costo real (3x2, "70% en la 2da").
Hoy la app no tiene forma de comparar presentaciones porque `Product` no guarda tamaño ni unidad.
Esta spec resuelve el caso como **herramienta independiente**: no lee ni modifica productos, precios, carrito ni compras.

## Alcance

**Incluye:**

- Página nueva `/calculadora` con lazy loading y link `🧮 Calculadora` en el nav.
- Selector de **magnitud** por comparación: Peso, Volumen o Unidades.
- De **2 a 6 presentaciones**, cada una con nombre opcional, precio, cantidad y unidad.
- Unidades de entrada según magnitud: Peso → `g`, `kg`; Volumen → `ml`, `l`; Unidades → `u`.
- Precio normalizado a **$/kg**, **$/l** o **$/u**.
- Promoción opcional por presentación: ninguna, NxM (2x1, 3x2), descuento % en la N-ésima unidad, descuento % directo.
- Resultado en vivo: precio unitario de cada presentación, la más conveniente marcada, % de diferencia de las demás.
- Leyenda "llevando N" cuando la promo exige comprar un lote.
- Persistencia de la última comparación en `localStorage` a través de `DataService`.
- Botón "Nueva comparación" que vuelve al estado inicial sin pedir confirmación.
- Nav con scroll horizontal en móvil para que entren los 5 ítems.

**Fuera de alcance (para specs futuras):**

- Campos `size` / `unit` en `Product` y mostrar $/kg en búsqueda, detalle o carrito.
- Abrir la calculadora precargada desde un producto o desde el carrito.
- Historial de varias comparaciones guardadas.
- Cantidad a comprar editable con promos aplicadas a lotes parciales.
- Selector de unidad de referencia alternativa ($/100 g, $/100 ml).
- Tests unitarios (el proyecto todavía no tiene karma/jasmine instalados).

## Modelo de datos

Tipos nuevos en `src/app/models/product.ts`, siguiendo la convención de modelos del proyecto:

```typescript
export type Magnitude = 'peso' | 'volumen' | 'unidades';
export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'u';
export type PromoType = 'ninguna' | 'nxm' | 'enesima' | 'descuento';

export interface Promo {
  type: PromoType;
  take: number | null;     // NxM: unidades que se llevan (3 en 3x2)
  pay: number | null;      // NxM: unidades que se pagan (2 en 3x2)
  nth: number | null;      // N-ésima: unidad con descuento (2 en "70% en la 2da")
  percent: number | null;  // N-ésima y descuento directo: % de DESCUENTO
}

export interface Presentation {
  id: string;              // Date.now().toString() + sufijo aleatorio
  label: string;           // opcional; vacío → "Presentación N"
  price: number | null;
  quantity: number | null;
  unit: Unit;
  promo: Promo;
}

export interface CalculatorState {
  magnitude: Magnitude;
  presentations: Presentation[];  // largo entre 2 y 6
}
```

Resultado calculado (no se persiste), en `src/app/utils/unit-price.ts`:

```typescript
export interface PresentationResult {
  id: string;
  unitPrice: number | null;   // null si la presentación tiene datos incompletos o inválidos
  lotUnits: number;           // unidades que exige la promo (1 si no hay lote)
  isBest: boolean;            // true para todas las empatadas en el mínimo
  diffPercent: number | null; // % por encima de la más barata; null si es la mejor o es inválida
}
```

### Reglas de cálculo

- Conversión a unidad base: `g` → kg ÷ 1000; `ml` → l ÷ 1000; `kg`, `l`, `u` sin cambio.
- Total y unidades del lote según promo, con `P` = precio de una unidad:

| Promo | Unidades del lote | Total del lote |
|---|---|---|
| ninguna | 1 | `P` |
| nxm | `take` | `P × pay` |
| enesima | `nth` | `P × (nth − 1) + P × (1 − percent/100)` |
| descuento | 1 | `P × (1 − percent/100)` |

- Precio unitario = total del lote ÷ (unidades del lote × cantidad en unidad base).
- Diferencia = (precio unitario − mínimo) ÷ mínimo × 100.
- Validaciones (si falla alguna, `unitPrice` es `null` y la presentación no compite):
  - `price > 0` y `quantity > 0`.
  - nxm: `take` y `pay` enteros, `take > pay ≥ 1`.
  - enesima: `nth` entero `≥ 2`, `0 < percent ≤ 100`.
  - descuento: `0 < percent < 100`.
- Hay ganador solo si al menos **2** presentaciones son válidas.

### Persistencia

| Clave | Contenido | Valor inicial |
|---|---|---|
| `preciolocal_calculator` | `CalculatorState` | magnitud `peso`, 2 presentaciones vacías en `g`, promo `ninguna` |

- Unidad por defecto al elegir magnitud: Peso → `g`, Volumen → `ml`, Unidades → `u`.
- Al cambiar la magnitud, la unidad de cada presentación pasa a la de defecto; precio, cantidad y promo se conservan.
- Si lo leído de `localStorage` no tiene `magnitude` válida o `presentations` no es un array de 2 a 6 elementos, se usa el estado inicial.
- También se usa el estado inicial si alguna presentación tiene una forma inválida: `id` o `label` que no son string, `price` o `quantity` que no son número ni `null`, `unit` que no corresponde a la magnitud, o `promo` sin `type` válido o con `take`/`pay`/`nth`/`percent` que no son número ni `null`.

## Plan de implementación

1. **Tipos.** Agregar `Magnitude`, `Unit`, `PromoType`, `Promo`, `Presentation` y `CalculatorState` en `src/app/models/product.ts`. Verificar: `npm run build:prod` compila.
2. **Lógica pura.** Crear `src/app/utils/unit-price.ts` con funciones sin dependencias de Angular: `toBaseQuantity`, `lotOf` (unidades + total del lote), `unitPrice` (con validaciones) y `compare(presentations): PresentationResult[]`. Exportar también `UNITS_BY_MAGNITUDE` y `DEFAULT_UNIT`. Verificar: build compila.
3. **Persistencia en `DataService`.** Generalizar `loadFromStorage` / `saveToStorage` de `T[]` a `T` (los llamados existentes no cambian). Agregar `CALCULATOR_KEY = 'preciolocal_calculator'`, la constante `DEFAULT_CALCULATOR`, el `BehaviorSubject` privado `calculator`, `calculator$`, `getCalculator()`, `saveCalculator(state)` y `resetCalculator()`, con una sección `// ── Calculadora ─────`. Incluir la validación de forma al cargar. Verificar: build compila y las otras páginas siguen funcionando.
4. **Página y ruta.** Crear `src/app/pages/calculator/calculator.component.ts` + `.html` (standalone, selector `app-calculator`, `templateUrl`) con un título y nada más. Agregar la ruta `calculadora` con `loadComponent` en `src/app/app.routes.ts` y el link `🧮 Calculadora` en `src/app/app.component.html`. Hacer el nav desplazable en horizontal (`overflow-x-auto`, `whitespace-nowrap`). Verificar: se navega a `/calculadora` y el nav no desborda en 375 px.
5. **Formulario.** Selector de magnitud y lista de presentaciones con nombre, precio, cantidad y unidad (`[(ngModel)]`, `inputmode="decimal"`). Botones "+ Agregar presentación" (deshabilitado con 6) y quitar (deshabilitado con 2). Cada cambio llama a `saveCalculator`. Verificar: recargar la página conserva lo cargado.
6. **Resultados.** Mostrar por presentación el precio unitario (`$/kg`, `$/l` o `$/u`), resaltar en verde la mejor y mostrar `+X %` en las demás, usando `compare` de `unit-price.ts`. Presentaciones inválidas muestran "Completar datos". Verificar: escenarios de los criterios de aceptación.
7. **Promociones.** Selector de promo por presentación y campos según el tipo (NxM: lleva/paga; N-ésima: unidad y descuento %; descuento: %). Leyenda "llevando N" cuando `lotUnits > 1`. Verificar: escenarios de promos de los criterios de aceptación.
8. **Nueva comparación.** Botón que llama a `resetCalculator()`. Verificar: vuelve a 2 presentaciones vacías en Peso y lo mismo tras recargar.
9. **Documentación.** Actualizar `CLAUDE.md` (Rutas, Persistencia, Funcionalidades, Estado Actual, árbol de estructura con `utils/` y `calculator/`), la tabla de `docs/README.md` y el estado de `docs/features/01-calculadora-precio-unitario.md` a "Hecho".

## Criterios de aceptación

- [x] `npm run build:prod` termina sin errores ni warnings nuevos.
- [x] El nav muestra `🧮 Calculadora` y lleva a `/calculadora`; el link queda resaltado como activo.
- [x] En un ancho de 375 px el nav se desplaza en horizontal y no genera scroll horizontal de la página.
- [x] La página abre con magnitud Peso y 2 presentaciones vacías la primera vez.
- [x] Con magnitud Peso solo se ofrecen `g` y `kg`; con Volumen, `ml` y `l`; con Unidades, `u`.
- [x] No se puede tener menos de 2 ni más de 6 presentaciones.
- [x] Volumen: 900 ml a $1800 y 1,5 l a $2700 → muestra $2000/l y $1800/l; 1,5 l es la mejor y la otra muestra +11,11 %.
- [x] Peso: 500 g a $1000 con 3x2 → muestra $1333,33/kg y la leyenda "llevando 3".
- [x] Volumen: 1 l a $1000 con 70 % en la 2da → muestra $650/l y la leyenda "llevando 2".
- [x] Peso: 1 kg a $1000 con 20 % de descuento → muestra $800/kg.
- [x] Unidades: pack de 6 u a $3000 vs 1 u a $550 → muestra $500/u y $550/u; el pack es la mejor y la otra muestra +10 %.
- [x] Dos presentaciones con el mismo precio unitario se marcan ambas como mejores.
- [x] Una presentación sin precio o cantidad, o con promo inválida (ej. 2x3), muestra "Completar datos" y no se marca ganador si quedan menos de 2 válidas.
- [x] Cambiar la magnitud pasa todas las unidades a la de defecto y conserva precios y cantidades.
- [x] Recargar la página conserva magnitud, presentaciones y promos.
- [x] Con un valor corrupto en `preciolocal_calculator` la página abre en el estado inicial sin errores en consola.
- [x] "Nueva comparación" vuelve al estado inicial, también después de recargar.
- [x] Búsqueda, carga, detalle, carrito e historial funcionan igual que antes.

## Decisiones

- **Sí:** promociones dentro de esta spec. Sin ellas la comparación engaña en el caso más común del súper.
- **Sí:** el % de la N-ésima es **descuento** ("70% en la 2da" = la segunda cuesta 30 %). Es como lo anuncian la mayoría de los comercios.
- **Sí:** las promos asumen **lote completo**. Es la forma en que se decide en góndola; la cantidad editable queda fuera.
- **No:** cantidad a comprar editable. Agrega complejidad sin cambiar la decisión en la mayoría de los casos.
- **Sí:** magnitud fija por comparación. Hace imposible mezclar kg con litros, en lugar de detectarlo y avisar.
- **No:** unidades libres con aviso. Permite un estado inválido que después hay que explicar.
- **Sí:** precio normalizado a $/kg, $/l y $/u. Es la referencia que muestran las góndolas.
- **No:** selector $/100 g. Útil para productos chicos, pero no es necesario en esta versión.
- **Sí:** guardar la última comparación. Permite volver a la calculadora en medio de la compra sin recargar todo.
- **Sí:** estado en `DataService` con clave `preciolocal_calculator`. Respeta la convención de servicio único con toda la persistencia.
- **No:** persistencia dentro del componente. Rompe la convención del proyecto.
- **Sí:** generalizar `loadFromStorage` / `saveToStorage` a `T`. El estado de la calculadora es un objeto, no un array, y el cambio no afecta los llamados existentes.
- **Sí:** lógica de cálculo en `src/app/utils/unit-price.ts` como funciones puras. Queda lista para testear cuando se configuren los tests.
- **Sí:** mínimo 2 y máximo 6 presentaciones. Cubre los casos reales y la pantalla sigue manejable en móvil.
- **Sí:** link en el nav con scroll horizontal. Acceso directo desde la góndola; el scroll evita que un 5º ítem rompa el layout móvil.
- **Sí:** "Nueva comparación" sin `confirm()`. No se pierden datos importantes.
- **Sí:** tipo `Promo` plano (todos los campos con `null`) en lugar de unión discriminada. Se enlaza con `[(ngModel)]` sin pelear con `strictTemplates`.
- **Sí:** números con `number:'1.2-2'` sin locale, igual que el resto de la app (se ve `$1,333.33` y `+11.11 %`). Los criterios de aceptación escriben los valores con coma decimal; lo que se verifica es el valor, no el separador. Pasar la app a `es-AR` es un cambio global y va en su propia spec.
- **Sí:** ruta en español (`/calculadora`), como ya figura en `docs/`. Las rutas existentes están en inglés; se acepta la diferencia porque la URL es visible para el usuario.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `type="number"` en algunos teclados Android no acepta coma decimal | `inputmode="decimal"`; si aparece el problema, se trata en una spec aparte |
| Estado guardado con un formato viejo o corrupto | Validación de forma al cargar y fallback al estado inicial |
| El nav con 5 ítems desborda en móvil | Scroll horizontal en el contenedor del nav (paso 4) |
| Errores de redondeo en los precios | Calcular con números completos y redondear solo al mostrar (`number:'1.2-2'`) |

## Lo que **no** incluye esta spec

- `size` / `unit` en `Product` ni $/kg en búsqueda, detalle o carrito.
- Abrir la calculadora desde un producto o el carrito.
- Varias comparaciones guardadas.
- Cantidad a comprar editable o promos sobre lotes parciales.
- Unidad de referencia $/100 g o $/100 ml.
- Tests unitarios.

Cada uno de estos, si llega, va en su propia spec.
