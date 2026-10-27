# 01 — Calculadora de precio unitario

- **Estado:** Idea
- **Fase:** 1 (sin backend)

## Problema

El mismo producto viene en presentaciones distintas (aceite de 900 ml vs 1,5 l, yerba de 500 g vs 1 kg,
pack de 6 vs unidad suelta) y a simple vista no se sabe cuál conviene. Las promociones (2x1, 3x2,
"2da unidad al 70%") complican todavía más la cuenta.

## Qué existe hoy

Nada. `Product` (`src/app/models/product.ts`) no guarda tamaño ni unidad, así que tampoco se puede calcular
el precio por kilo o por litro a partir de los precios registrados.

## Alcance MVP

Herramienta independiente, sin tocar los datos guardados:

- Nueva página `/calculadora` con link en el nav.
- Cargar **2 o más presentaciones**, cada una con: precio, cantidad y unidad (`g`, `kg`, `ml`, `l`, `unidad`).
- Normalizar a precio por **kg**, **l** o **unidad** según la magnitud.
- Resaltar la opción más conveniente y mostrar el % de diferencia de las demás.
- Validar que todas las presentaciones comparadas sean de la misma magnitud (peso, volumen o unidades).
- Opcional en el MVP: promociones por presentación para obtener el **precio unitario efectivo**:
  - `NxM` (2x1, 3x2): se pagan M de cada N.
  - `% en la N-ésima` (2da al 70%, 2da al 50%).
  - `% de descuento directo`.

## Evolución futura

- Agregar `size` y `unit` opcionales a `Product` y mostrar $/kg o $/l en búsqueda, detalle y carrito.
- Desde el detalle de producto, "comparar con otra presentación" abriendo la calculadora precargada.
- Detectar en el historial que dos productos son el mismo en distinto tamaño (p. ej. agrupar por nombre base).

## Modelo de datos propuesto

```typescript
type Unit = 'g' | 'kg' | 'ml' | 'l' | 'unidad';

interface Presentation {
  label?: string;        // "Botella 1,5 l"
  price: number;
  quantity: number;      // 1.5
  unit: Unit;
  promo?: Promo;
}

type Promo =
  | { type: 'nxm'; take: number; pay: number }          // 3x2 → take 3, pay 2
  | { type: 'nth-discount'; nth: number; percent: number } // 2da al 70% → nth 2, percent 70
  | { type: 'discount'; percent: number };

// Futuro, en Product:
interface Product {
  // ...
  size?: number;
  unit?: Unit;
}
```

El MVP no persiste nada; si más adelante se guardan comparaciones, usar una clave `preciolocal_*` nueva.

## UI/UX

- Tarjetas apiladas en móvil, grilla en escritorio; botón "+ Agregar presentación".
- Resultado en vivo (sin botón "calcular"), con la ganadora marcada en verde.
- Teclado numérico en móvil (`inputmode="decimal"`), aceptar coma decimal.

## Dependencias

Ninguna. Es el feature más rápido de entregar.

## Preguntas abiertas

- ¿Las promociones entran en el MVP o en una segunda iteración?
- ¿Conviene guardar las últimas comparaciones hechas?
