# 💰 PrecioLocal

PWA en **Angular 19** + **Tailwind CSS** para que los vecinos registren y comparen precios de productos por barrio y
comercio, armen su carrito y lleven un historial de compras. Los datos se guardan en `localStorage` (sin backend).

## Funcionalidades

- 🔍 Búsqueda en tiempo real por nombre o categoría, con último precio y variación
- 📸 Carga de precios (barrio y tienda) y de productos nuevos
- 📊 Detalle de producto: mínimo, máximo, promedio, gráfico de tendencia e historial editable
- 🛒 Carrito con comparación contra la última compra y checkout con medio de pago
- 📋 Historial de compras, con opción de volver a cargar una compra al carrito
- 📱 Instalable en el móvil (manifest PWA)

## Inicio rápido

Requiere Node.js ≥ 18 y npm ≥ 9.

```bash
npm install
npm start          # http://localhost:4200
npm run build:prod # salida en dist/precio-local/
```

## Despliegue

`dist/precio-local/` son archivos estáticos: se pueden publicar en Netlify (arrastrando la carpeta a
https://app.netlify.com/drop), Vercel o GitHub Pages. Al ser una SPA, el hosting debe redirigir las rutas a `index.html`.

## Estado

Fase 1: frontend con persistencia local. Próximas fases: backend .NET 8 con base de datos y autenticación JWT,
app móvil en React Native y, más adelante, microservicios.

## Licencia

MIT
