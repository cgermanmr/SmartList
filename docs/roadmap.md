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
- Migrar localStorage → API, sincronización en nube, datos compartidos entre dispositivos, backups
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
