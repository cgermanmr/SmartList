# SPEC 02 — "Repetir" fuera del botón de expandir en el historial

> **Estado:** Borrador
> **Depende de:** —
> **Fecha:** 2026-10-28
> **Objetivo:** Sacar el botón "🛒 Repetir" de adentro del botón que expande cada compra en `/purchases`, para que el HTML sea válido, accesible y no dependa de `stopPropagation()`.

Origen: [`docs/ideas.md`](../docs/ideas.md) → *Calidad y deuda técnica* → "Botón anidado en el historial de compras".

## Por qué existe esta spec

En `src/app/pages/purchases/purchases.component.html` (líneas 13–35) el encabezado de cada compra es un
`<button (click)="toggle(...)">` que contiene otro `<button (click)="loadToCart(purchase, $event)">`.

- Un `<button>` no puede contener contenido interactivo: es HTML inválido y cada navegador lo resuelve a su manera.
- Los lectores de pantalla anuncian un solo botón con todo el texto adentro ("dd/MM/yyyy 3 producto(s) 🛒 Repetir $1.200 ▼").
- Con teclado, el botón interno no siempre recibe foco por separado.
- Para que el clic en "Repetir" no expanda la compra, `loadToCart` necesita `event.stopPropagation()`.

## Alcance

**Incluye:**

- Encabezado de cada compra como contenedor (`div`) con **dos botones hermanos**: expandir y Repetir.
- Atributos de accesibilidad en el botón de expandir: `aria-expanded` y `aria-controls`.
- `aria-label` descriptivo en el botón Repetir (en móvil solo se ve el ícono).
- `loadToCart(purchase)` sin el parámetro `event` y sin `stopPropagation()`.
- Mismo aspecto visual que hoy.

**Fuera de alcance (para specs futuras):**

- Rediseño del historial de compras.
- Reemplazar los `alert()` / `confirm()` del resto de la app.
- Auditoría de accesibilidad de otras páginas.

## Modelo de datos

Sin cambios.

### Estructura propuesta del encabezado

```html
<div class="flex items-center">
  <button
    (click)="toggle(purchase.id)"
    [attr.aria-expanded]="expandedId === purchase.id"
    [attr.aria-controls]="'compra-' + purchase.id"
    class="flex-1 min-w-0 p-4 flex justify-between items-center hover:bg-gray-50 transition-colors text-left">
    <div class="min-w-0"><!-- fecha, cantidad de productos, comercio, medio de pago --></div>
    <div class="flex items-center gap-4"><!-- total y flecha ▲/▼ --></div>
  </button>
  <button
    (click)="loadToCart(purchase)"
    [attr.aria-label]="'Repetir compra del ' + (purchase.date | date: 'dd/MM/yyyy')"
    class="mr-4 ... (mismas clases que hoy)">
    🛒 <span class="hidden sm:inline">Repetir</span>
  </button>
</div>

<div *ngIf="expandedId === purchase.id" [id]="'compra-' + purchase.id" class="border-t border-gray-100">
  ...
</div>
```

## Plan de implementación

1. **Template.** En `src/app/pages/purchases/purchases.component.html` reemplazar el `<button>` del encabezado por la estructura de arriba: el botón de expandir conserva fecha, info, total y flecha; "Repetir" pasa a ser hermano, al final de la fila. Agregar el `id` al detalle expandible. Verificar: `npm run build:prod` compila.
2. **Componente.** En `src/app/pages/purchases/purchases.component.ts` cambiar `loadToCart(purchase: Purchase, event: Event)` a `loadToCart(purchase: Purchase)` y quitar `event.stopPropagation()`. Verificar: build compila sin errores de `strictTemplates`.
3. **Prueba manual.** Con al menos 2 compras en el historial, revisar los criterios de aceptación en escritorio y en 375 px.
4. **Documentación.** Quitar la entrada "Botón anidado en el historial de compras" de `docs/ideas.md`. `CLAUDE.md` no cambia (no hay funcionalidad nueva).

## Criterios de aceptación

- [ ] `npm run build:prod` termina sin errores ni warnings nuevos.
- [ ] En `/purchases`, `document.querySelectorAll('button button').length` devuelve `0`.
- [ ] Clic en el área de la compra la expande y la contrae; `aria-expanded` pasa de `false` a `true` y vuelve.
- [ ] Clic en "Repetir" con el carrito vacío carga la compra y navega a `/cart` sin expandir la compra.
- [ ] Clic en "Repetir" con el carrito con ítems abre el modal "Mantener y agregar / Reemplazar / Cancelar" y cada opción funciona como antes.
- [ ] Con Tab se llega por separado al botón de expandir y al de Repetir; Enter y Espacio activan cada uno.
- [ ] El botón Repetir tiene nombre accesible "Repetir compra del dd/MM/yyyy" también en móvil, donde solo se ve 🛒.
- [ ] En 375 px la fila no genera scroll horizontal y el total sigue visible.
- [ ] El hover gris se ve solo sobre el área de expandir, no sobre el botón Repetir.

## Decisiones

- **Sí:** dos botones hermanos dentro de un `div`. Es la corrección mínima que deja HTML válido y cada acción con su propio foco.
- **No:** convertir el encabezado en `div` con `(click)` y `role="button"`. Obliga a reimplementar teclado y foco, que el `<button>` ya trae.
- **Sí:** "Repetir" al final de la fila, después del total y la flecha. Sacarlo del botón obliga a ponerlo a un costado; el final de la fila es donde menos cambia la lectura de la compra.
- **Sí:** `aria-label` con la fecha. Con varias compras, "Repetir" a secas no dice cuál.
- **Sí:** quitar el parámetro `event`. Con los botones separados el clic ya no burbujea al de expandir.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| En móvil la fila queda más apretada al sumar el botón al costado | `min-w-0` en el botón de expandir y en el bloque de texto; el texto "Repetir" sigue oculto debajo de `sm` |
| Se pierde el hover en toda la fila | Aceptado: el hover queda en el área que expande, que es lo que el clic hace |

## Lo que **no** incluye esta spec

- Rediseño del historial.
- Cambios en `alert()` / `confirm()`.
- Accesibilidad de otras páginas.

Cada uno de estos, si llega, va en su propia spec.
