# SPEC 29 — Buscador fijo arriba en Buscar

> **Estado:** Aprobada
> **Depende de:** [SPEC 15](15-precios-y-comercios-cercanos.md), [SPEC 19](19-restyling-base-y-navegacion.md)
> **Fecha:** 2026-11-22
> **Objetivo:** Que en el celular, con el teclado abierto, los resultados se vean apenas debajo del buscador, sin tener que cerrar el teclado.

## Por qué existe esta spec

En Buscar, entre el campo de búsqueda y los resultados están la barra de ubicación (dos o tres renglones), el
mensaje "No tenés productos con ese nombre" y el título "En Precios Claros" con mucho margen. En el celular, al
escribir, el teclado ocupa media pantalla y tapa justo lo que importa: los primeros resultados no se ven hasta
bajar el teclado.

El mensaje, además, no aporta: si un producto propio coincide, aparece en la lista; si no aparece, no hace falta
decirlo, y los resultados del catálogo están debajo.

## Alcance

**Incluye:**

- Sacar el mensaje "No tenés productos con ese nombre".
- El título visible "Buscar Productos" pasa a ser el placeholder del campo ("Buscar productos"), que se borra al
  empezar a escribir. El `<h1>` queda solo para lectores de pantalla (`sr-only`).
- La barra de ubicación pasa **arriba** del buscador (debajo del título).
- El buscador (campo + botón del lector) queda **fijo arriba** de la pantalla al desplazarse (`sticky`).
- En pantallas táctiles, al tocar el campo, la página se desplaza para dejar el buscador arriba de todo: el título
  y la barra de ubicación salen de la vista y los resultados quedan pegados al campo.
- Márgenes más chicos entre el buscador, los productos propios y la sección "En Precios Claros".

**Fuera de alcance:**

- Cambiar la barra de ubicación en sí (contenido, selector de radio, lista de comercios).
- Cambiar las tarjetas de los productos propios o las filas del catálogo.
- El resto de las páginas (Cargar, carrito, detalle).

## Reglas

- **Mensajes sin resultados propios:**
  - Con el catálogo disponible (`sepaEnabled`), no hay mensaje en la sección de productos propios, tenga el texto 3
    letras o menos. La sección "En Precios Claros" sigue con sus propios mensajes ("Buscando…", "Sin resultados").
  - Sin Supabase (no hay catálogo) se mantiene "No se encontraron productos": es la única respuesta a la búsqueda.
  - "Todavía no tenés productos" (sin productos y sin texto) no cambia.
- **Orden de la página:** barra de ubicación, buscador, oferta del lector (si hay) y resultados. El `<h1>
  Buscar productos</h1>` sigue primero, con `sr-only`: la página conserva su título para lectores de pantalla y el
  campo conserva su `aria-label` (el placeholder no lo reemplaza).
- **Buscador fijo:** `position: sticky` arriba de `<main>` (que es el que hace scroll, spec 19), con el fondo de la
  app (`bg-gray-50`) a todo el ancho para que los resultados no se vean por detrás. Queda debajo de los `<dialog>`
  (lector, mapa) y del aviso "… en el carrito".
- **Desplazamiento al tocar el campo:** solo con puntero táctil (`(pointer: coarse)`); en la computadora no se
  mueve nada. Se desplaza al enfocar el campo y cuando el texto pasa de vacío a tener algo (por si al enfocar no
  había contenido suficiente para desplazarse). Solo hacia abajo: si el buscador ya está arriba, no hace nada.
  Sin el título visible, lo único que sale de la vista es la barra de ubicación.
  Suave, salvo con `prefers-reduced-motion`.
- **Alto mínimo con texto:** mientras hay texto en el buscador, el área de resultados tiene al menos el alto de la
  pantalla (`min-h-dvh`), para que siempre se pueda desplazar hasta dejar el buscador arriba aunque haya pocos
  resultados.
- Escribir y leer un código siguen cerrando la oferta del lector y la fila desplegada del catálogo, como hoy.

## UI/UX

Al escribir en el celular, con el teclado abierto:

```
┌──────────────────────────┐
│ [yerba             ] [▣] │  ← fijo arriba
│ Yerba Playadito 1 kg     │  ← propio
│ Desde $2.750 · Coto      │
│ En Precios Claros        │
│ Yerba Taragüí 1 kg       │
├──────────────────────────┤
│         teclado          │
└──────────────────────────┘
```

Sin escribir (arriba de todo):

```
┌──────────────────────────┐
│ Caballito · 3 km · …     │  ← barra de ubicación
│ [Buscar productos]   [▣] │  ← el placeholder hace de título
│ (oferta del lector)      │
│ (productos propios)      │
└──────────────────────────┘
```

- El título "En Precios Claros" baja de `text-xl` a `text-lg` y su margen de `mt-8` a `mt-6` (`mt-0` si no hay
  productos propios que coincidan, para que quede pegado al buscador).
- El buscador fijo lleva un padding vertical chico (`py-2`) para que el campo no quede pegado al header.

## Plan de implementación

1. **Sacar el mensaje y achicar márgenes** — en `src/app/page.tsx`: el bloque de "No tenés productos con ese
   nombre" / "No se encontraron productos" queda solo para `!sepaEnabled`; el título del catálogo según *UI/UX*.
   **Verificar:** buscar un texto sin propios que coincidan y ver la sección "En Precios Claros" pegada al buscador.
2. **Reordenar y fijar el buscador** — el `<h1>` pasa a `sr-only` y el placeholder del campo a "Buscar
   productos"; `LocationBar` pasa arriba del buscador; el contenedor del campo y del
   `ScanButton` pasa a `sticky top-0 z-10 -mx-4 bg-gray-50 px-4 py-2`; la `ScanOffer` queda debajo.
   **Verificar:** a 375 px, al desplazar la lista, el buscador queda arriba sin que se vean los resultados por
   detrás; desde `md` también queda fijo.
3. **Desplazar al tocar el campo** — un elemento marcador (`ref`) justo antes del buscador; `onFocus` del campo y
   el paso de vacío a texto llaman a `scrollIntoView({ block: 'start' })` sobre el marcador, solo con
   `(pointer: coarse)` y si el marcador está por debajo del borde de arriba de `<main>`; `behavior: 'smooth'` salvo
   con `prefers-reduced-motion`. El área de resultados lleva `min-h-dvh` mientras hay texto.
   **Verificar:** con la emulación táctil de 375 px, al tocar el campo el título y la barra de ubicación salen de
   la vista; con pocos resultados también; en la computadora no se mueve.
4. **Docs** — `CLAUDE.md`, Funcionalidades → Búsqueda: el título como placeholder, el mensaje sin propios, el
   orden y el buscador fijo.

**A revisar en el celular (sin test automático):** que al tocar el campo, con el teclado abierto, los resultados
se vean debajo (Android y iPhone: el teclado cambia el área visible de forma distinta); que el desplazamiento no
pelee con el que hace el propio navegador al enfocar; leer un código con la cámara con la página desplazada.

## Criterios de aceptación

- [ ] Con el catálogo disponible, buscar un texto sin productos propios que coincidan no muestra "No tenés
      productos con ese nombre"; la sección "En Precios Claros" queda pegada al buscador.
- [ ] Sin Supabase, una búsqueda sin resultados sigue mostrando "No se encontraron productos".
- [ ] No se ve el título "Buscar Productos": el campo dice "Buscar productos" y el texto se borra al escribir;
      un lector de pantalla sigue anunciando el título de la página y el nombre del campo.
- [ ] La barra de ubicación está arriba del buscador y funciona igual (radio, Cambiar, Quitar, "N comercios cerca").
- [ ] Al desplazar la página, el buscador queda fijo arriba, con fondo, y los resultados pasan por debajo.
- [ ] En el celular, al tocar el campo, el buscador sube arriba de todo y los primeros resultados se ven con el
      teclado abierto.
- [ ] Con pocos resultados (o ninguno), el buscador también queda arriba al escribir.
- [ ] En la computadora, enfocar el campo no desplaza la página.
- [ ] La oferta del lector aparece debajo del buscador y escribir la sigue cerrando.
- [ ] El lector, el mapa y el aviso "… en el carrito" quedan por encima del buscador fijo.
- [ ] 375 px sin scroll horizontal; `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.

## Decisiones

- **Buscador fijo en lugar de esconder la ubicación:** la barra de ubicación sigue a mano (desplazando hacia arriba)
  y no cambia de forma según haya texto; lo que se gana es que el campo y los resultados estén siempre juntos.
- **Ubicación arriba del buscador:** si quedara entre el campo fijo y los resultados, seguiría ocupando el lugar que
  tapa el teclado.
- **Sin mensaje sin propios:** la lista vacía ya lo dice, y los resultados del catálogo están debajo. Sin catálogo
  se mantiene, porque es la única respuesta.
- **El título como placeholder:** "Buscar Productos" repetía lo que ya dicen la pestaña activa de la barra y el
  propio campo; como placeholder ocupa cero lugar. El `<h1>` queda oculto a la vista para no perder el título de la
  página en los lectores de pantalla.
- **Desplazar solo en pantallas táctiles:** en la computadora no hay teclado que tape y mover la página al hacer
  clic sorprende.
