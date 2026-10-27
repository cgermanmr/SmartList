# 💰 PrecioLocal - PWA de Carrito de Compras

Una Progressive Web App moderna construida con **Angular 19** + **Tailwind CSS** para comparar precios y gestionar un carrito de compras inteligente.

## ✨ Features

✅ Búsqueda de productos en tiempo real  
✅ Carrito de compras con cálculo automático  
✅ Historial de precios por producto  
✅ Carga de nuevos precios  
✅ Estadísticas (Min, Max, Promedio)  
✅ PWA instalable en móvil  
✅ Datos persistentes (localStorage)  
✅ Interfaz moderna con Tailwind CSS  

## 🚀 Quick Start

### 1. Instala dependencias
```bash
npm install
```

### 2. Inicia servidor de desarrollo
```bash
npm start
```

La app se abre automáticamente en `http://localhost:4200`

### 3. Build para producción
```bash
npm run build:prod
```

## 📁 Estructura del Proyecto

```
precio-app/
├── src/
│   ├── app/
│   │   ├── models/
│   │   │   └── product.ts          (Interfaces)
│   │   ├── services/
│   │   │   └── data.service.ts     (Lógica de datos)
│   │   ├── pages/
│   │   │   ├── search/             (Búsqueda)
│   │   │   ├── cart/               (Carrito)
│   │   │   ├── upload/             (Cargar precios)
│   │   │   └── product/            (Detalles)
│   │   ├── app.routes.ts           (Rutas)
│   │   └── app.component.ts        (Raíz)
│   ├── index.html
│   ├── main.ts
│   ├── styles.css
│   └── manifest.json
├── angular.json
├── tsconfig.json
├── tailwind.config.js
└── package.json
```

## 🛠️ Stack Tecnológico

- **Angular 19** - Framework moderno con standalone components
- **TypeScript 5.6** - Lenguaje tipado
- **Tailwind CSS 3.4** - Utilidades CSS
- **RxJS 7.8** - Reactividad

## 📱 Características PWA

- 🔄 Instalable en móvil (Android + iOS)
- 📴 Funciona offline (Service Worker)
- 💾 Datos persistentes (localStorage)
- ⚡ Carga rápida
- 🔐 HTTPS automático en producción

## 🎯 Páginas

### 🔍 Búsqueda
- Busca productos por nombre o categoría
- Ve el último precio registrado
- Añade directamente al carrito

### 🛒 Carrito
- Visualiza todos los items
- Edita cantidades
- Ve el total en tiempo real
- Finaliza compra

### 📸 Cargar Precio
- Selecciona producto
- Ingresa precio, barrio, tienda
- Comparte nueva información

### 📊 Detalles del Producto
- Historial de precios
- Estadísticas (Min, Max, Promedio)
- Gráfica de tendencia
- Añade al carrito

## 💾 Almacenamiento

Los datos se guardan en **localStorage** del navegador:
- Productos
- Precios
- Carrito

Esto significa:
- ✅ Los datos persisten aunque cierres el navegador
- ✅ Funciona offline
- ❌ No se syncronizan entre dispositivos (todavía)

**Fase 2:** Migrar a backend .NET + Base de datos

## 🔧 Desarrollo

### Agregar un componente

```bash
ng generate component pages/nuevo-componente
```

### Ejecutar tests
```bash
ng test
```

### Lint
```bash
ng lint
```

## 🚢 Deployment

### Netlify (Recomendado)
```bash
npm run build:prod
# Arrastra carpeta dist/precio-local a https://app.netlify.com/drop
```

### Vercel
```bash
npm run build:prod
vercel
```

### GitHub Pages
```bash
npm run build:prod
# Push a GitHub y activa Pages en Settings
```

## 📱 Instalar en Móvil

### Android (Chrome)
1. Abre la app en Chrome
2. Menú → "Instalar app"
3. Confirma

### iPhone (Safari)
1. Abre en Safari
2. Compartir → "Agregar a pantalla de inicio"

## 🔐 Seguridad

- ✅ TypeScript strict mode
- ✅ Validación de inputs
- ✅ HTTPS automático (Netlify/Vercel)
- ⚠️ localStorage (sin encriptación)

**Para producción:** Implementar backend seguro

## 📚 Comandos

```bash
npm start              # Desarrollo con auto-reload
npm run build          # Build de desarrollo
npm run build:prod     # Build optimizado
npm run watch          # Watch mode
npm test              # Tests
npm run format        # Prettier
```

## 🎯 Próximas Fases

### Fase 2: Backend
- .NET 8 ASP.NET Core
- SQL Server / PostgreSQL
- API REST

### Fase 3: React Native
- App nativa iOS + Android
- Cámara y código de barras
- GPS y ubicación

## 💡 Tips

- **Datos persistentes:** Los datos quedan guardados, recarga sin perder nada
- **Offline first:** Funciona sin conexión
- **Responsive:** Optimizado para móvil y desktop
- **Rápido:** Bundle pequeño, carga instantánea

## ❓ Troubleshooting

**Error: "Cannot find module"**
```bash
rm -rf node_modules
npm install
```

**Tailwind no funciona**
```bash
npm start
```

**PWA no instala**
- Necesita HTTPS (automático en Netlify)
- Revisa manifest.json

## 📞 Contacto & Soporte

Para reportar bugs o sugerencias, crea un issue en GitHub.

## 📄 Licencia

MIT

---

**¡Listo para empezar!** 🚀

```bash
npm install && npm start
```
