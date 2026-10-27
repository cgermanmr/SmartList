# Roadmap técnico

Fases del proyecto. Los features concretos de producto están en [`features/`](features/) y priorizados en el
[índice](README.md).

## Fase 1 — Frontend Angular con localStorage (actual)

App funcional sin backend. Ver *Estado Actual* en [`CLAUDE.md`](../CLAUDE.md).

Pendiente dentro de la fase:
- Service worker / modo offline
- Tests y lint configurados
- [01 — Calculadora de precio unitario](features/01-calculadora-precio-unitario.md)
- [02 — Comparación por comercio](features/02-comparacion-por-comercio.md)

## Fase 2 — Backend

- .NET 8 ASP.NET Core + SQL Server / PostgreSQL
- API REST documentada, autenticación JWT, CORS
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
