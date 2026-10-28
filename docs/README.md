# Documentación de PrecioLocal — ideas y features futuros

PrecioLocal es una lista de precios **personal/familiar**: registrar lo que se paga, comparar compras de una
fecha a otra, ver cómo suben los precios y cuánto se gasta. Esta carpeta reúne lo que **todavía no existe**
en la app: features analizados, roadmap por fases e ideas sueltas.

> El estado actual de la app (arquitectura, funcionalidades implementadas, convenciones) está en
> [`CLAUDE.md`](../CLAUDE.md) y en el [`README.md`](../README.md) de la raíz.

## Contenido

| Archivo | Para qué sirve |
|---|---|
| [`features/`](features/) | Un archivo por feature, con problema, alcance MVP, modelo de datos y dependencias |
| [`roadmap.md`](roadmap.md) | Fases técnicas del proyecto (backend, móvil, microservicios) |
| [`ideas.md`](ideas.md) | Bandeja de ideas sin analizar; cuando una madura, pasa a `features/` |

## Features priorizados

Orden sugerido según dependencias técnicas: primero lo que se puede hacer con `localStorage`, después lo que
necesita backend.

| # | Feature | Fase | Estado | Depende de |
|---|---|---|---|---|
| 01 | [Calculadora de precio unitario](features/01-calculadora-precio-unitario.md) | 1 | Hecho | — |
| 02 | [Comparación por comercio](features/02-comparacion-por-comercio.md) | 1 | Parcial | Catálogo de comercios |
| 03 | [Lista de compras compartida](features/03-lista-compartida.md) | 2 | Idea | Backend + auth, tiempo real |
| 04 | [Promociones de comercios de cercanía](features/04-promociones-comercios.md) | 2–3 | Idea | 02, backend + roles, service worker |
| 05 | [Pedidos a comercios](features/05-pedidos-a-comercios.md) | 3–4 | Idea | 03, 04 |

**Estados posibles:** Idea · Analizado · En curso · Parcial · Hecho.

## Prerrequisitos transversales

Piezas que no son features en sí, pero que varios features necesitan. Conviene resolverlas una sola vez.

| Prerrequisito | Lo necesitan | Notas |
|---|---|---|
| **Catálogo de comercios** (`Store`) | 02, 04, 05 | Hoy `barrio` y `store` son texto libre en cada `Price`; "Coto" y "coto" son comercios distintos |
| **Presentación del producto** (tamaño + unidad) | 01, 02 | Hoy `Product` no tiene tamaño; no se puede comparar $/kg ni $/l |
| **Backend + autenticación** | 03, 04, 05 | Fase 2 del [roadmap](roadmap.md) |
| **Service worker** | 03 (offline), 04 (push) | Hoy la PWA solo tiene `manifest.json` |

## Cómo agregar un feature

1. Si es solo una idea, anotarla en [`ideas.md`](ideas.md).
2. Cuando se analiza, crear `features/NN-nombre-corto.md` con la plantilla de abajo y sumarlo a la tabla.
3. Al implementarlo, actualizar el **Estado** acá y en el archivo del feature, y reflejar lo nuevo en
   `CLAUDE.md` (sección *Funcionalidades*).

### Plantilla

```markdown
# NN — Nombre del feature

- **Estado:** Idea
- **Fase:** 1

## Problema
## Qué existe hoy
## Alcance MVP
## Evolución futura
## Modelo de datos propuesto
## UI/UX
## Dependencias
## Preguntas abiertas
```
