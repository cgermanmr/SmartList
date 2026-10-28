# 💰 PrecioLocal

PWA en **Next.js 16** + **Tailwind CSS** para que los vecinos registren y comparen precios de productos por barrio y
comercio, armen su carrito y lleven un historial de compras. Los datos se guardan en `localStorage` (todavía sin backend).

## Funcionalidades

- 🔍 Búsqueda en tiempo real por nombre o categoría, con último precio y variación
- 📸 Carga de precios (barrio y tienda) y de productos nuevos
- 📊 Detalle de producto: mínimo, máximo, promedio, gráfico de tendencia e historial editable
- 🛒 Carrito con comparación contra la última compra y checkout con medio de pago
- 📋 Historial de compras, con opción de volver a cargar una compra al carrito
- 🧮 Calculadora de precio unitario ($/kg, $/l, $/u) con promociones
- 📱 Instalable en el móvil (manifest PWA)

## Inicio rápido

Requiere Node.js ≥ 24.

```bash
npm install
npm run dev        # http://localhost:4200
npm test           # tests de la lógica (Vitest)
npm run lint
npm run build      # build de producción
```

## Despliegue

Continuo en **Vercel**: cada merge a `main` publica producción y cada push a `dev` o PR genera una URL de preview.
GitHub Actions corre lint, tests y build en cada cambio (`.github/workflows/ci.yml`).

## Estado

Fase 1: frontend con persistencia local. Próximas fases: Supabase (base de datos, autenticación y tiempo real),
app móvil en React Native y, más adelante, microservicios.

Roadmap, features planificados e ideas: [`docs/`](docs/README.md).

## Licencia

MIT
