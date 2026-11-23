# Roadmap técnico

Fases del proyecto. Los features concretos de producto están en [`features/`](features/) y priorizados en el
[índice](README.md).

## Fase 1 — Frontend Next.js con localStorage (actual)

App funcional sin backend, publicada en Vercel con CI en GitHub Actions
([SPEC 06](../specs/06-migracion-nextjs-vercel.md); antes era Angular 19). Ver *Estado Actual* en [`CLAUDE.md`](../CLAUDE.md).

Pendiente dentro de la fase:
- Service worker / modo offline
- [01 — Calculadora de precio unitario](features/01-calculadora-precio-unitario.md)
- [02 — Comparación por comercio](features/02-comparacion-por-comercio.md)

## Fase 2 — Backend (Supabase)

- **Supabase**: Postgres + Auth + Realtime, con seguridad por filas (RLS); reemplaza al backend .NET 8
  que estaba previsto. Se usa desde el cliente con `supabase-js`; el código de servidor de Next.js (route
  handlers, server actions) queda para lo que necesite secretos (p. ej. Web Push)
- Variables `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` vía la integración de Vercel
- ~~Migrar localStorage → API, sincronización en nube, datos compartidos entre dispositivos~~ → hecho en la
  [SPEC 21](../specs/21-cuenta-y-sincronizacion.md): cuenta optativa (Google o código por mail) y sincronización
  local primero en `user_records`; las variables se cargan a mano en Vercel, no con la integración
- [08 — Consulta de precios y aportes](features/08-consulta-y-aportes.md), en este orden: ¿dónde conviene el
  carrito? (spec 25), comercios cercanos en el lector (spec 24), cargar precio en el comercio (spec 26), fotos
  propias (spec 27), grupos (spec 22), validación (spec 23) y supervisión de fotos (spec 28)
- ~~Grupos y precios compartidos con el grupo~~ → hecho en la
  [SPEC 22](../specs/22-grupos-y-precios-compartidos.md): un grupo a la vez, precios consultados a pedido con
  `group_prices`. Evolución: sumar los precios propios y del grupo a "¿Dónde conviene el carrito?" (spec 25)
- Validación de precios por varias personas (spec 23); la comunidad abierta queda para después (ver
  [ideas](ideas.md))
- Backups
- Analytics: búsquedas, reportes de precios, estadísticas de uso
- Comunidad: calificaciones de comercios, comentarios en precios, reputación de usuarios
- Habilita: [03 — Lista compartida](features/03-lista-compartida.md),
  [04 — Promociones de comercios](features/04-promociones-comercios.md)

## Fase 3 — React Native (iOS + Android)

- Cámara, lector de código de barras, GPS, notificaciones push, offline avanzado
- API compartida con la web, login universal
- Habilita: [05 — Pedidos a comercios](features/05-pedidos-a-comercios.md)

## Fase 4 — Microservicios

- Autenticación, Productos, Precios, Usuarios, Pagos, Pedidos
