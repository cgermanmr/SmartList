# SPEC 07 — Cambio de nombre a "El Changuito"

> **Estado:** Implementado
> **Depende de:** SPEC 06
> **Fecha:** 2026-10-30
> **Objetivo:** Reemplazar el nombre visible "PrecioLocal" por **El Changuito**, alineado con el proyecto de Vercel `elchanguito` (https://elchanguito.vercel.app).

## Alcance

**Incluye:**

- Título de la página (`metadata.title`), header y footer del layout.
- `public/manifest.json`: `name` y `short_name` (lo que se ve al instalar la PWA).
- Nombre del paquete en `package.json` / `package-lock.json` (`el-changuito`).
- README, documentación (`docs/README.md`) y nombres de archivo de la exportación CSV (SPEC 05, borrador).

**Fuera de alcance:**

- Ícono (`public/icon.svg`) y paleta: se mantienen.
- Repositorio de GitHub (`cgermanmr/SmartList`): sigue con su nombre.
- Specs ya implementadas (01–06): se dejan como registro histórico.

## Decisiones

| Tema | Decisión |
|---|---|
| Claves de `localStorage` | Se mantiene el prefijo `preciolocal_`: cambiarlo dejaría sin datos a quien ya usa la app y exigiría una migración |
| `short_name` | "El Changuito" (12 caracteres, entra bajo el ícono en Android e iOS) |

## Criterios de aceptación

- [x] El header, el footer y la pestaña del navegador dicen "El Changuito".
- [x] Al instalar la PWA, el nombre es "El Changuito".
- [x] Los datos guardados antes del cambio siguen apareciendo.
- [x] `npm run lint`, `npm test` y `npm run build` sin errores.
