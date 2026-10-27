# ⚡ INICIO RÁPIDO - PrecioLocal Angular 19

## 1️⃣ Instala Node.js (si no lo tienes)

Descarga desde: https://nodejs.org (LTS recomendado)

Verifica:
```bash
node --version
npm --version
```

## 2️⃣ Instala dependencias del proyecto

```bash
npm install
```

⏳ Toma ~2-3 minutos la primera vez.

## 3️⃣ Inicia el servidor de desarrollo

```bash
npm start
```

✅ Se abrirá automáticamente en `http://localhost:4200`

## 4️⃣ ¡Comienza a desarrollar!

### Estructura de carpetas
```
src/app/
├── pages/
│   ├── search/       (Búsqueda)
│   ├── cart/         (Carrito)
│   ├── upload/       (Cargar precios)
│   └── product/      (Detalles)
├── services/         (Lógica)
├── models/           (Interfaces)
└── app.component.ts  (Raíz)
```

### Editar componentes
- Los cambios se actualizan automáticamente
- Abre DevTools: F12

## 🏗️ Build para producción

```bash
npm run build:prod
```

Crea carpeta `dist/precio-local/` lista para deployar.

## 🚀 Deploy gratis

### Netlify (2 minutos)
1. Ve a https://app.netlify.com/drop
2. Arrastra carpeta `dist/precio-local`
3. ¡Listo!

### Vercel
1. Ve a https://vercel.com
2. Conecta tu repositorio GitHub

### GitHub Pages
1. Sube a GitHub
2. Settings → Pages → Deploy from main

## 📱 Instalar en móvil

### Android
1. Abre en Chrome
2. Menú (3 puntos) → "Instalar app"

### iPhone
1. Abre en Safari
2. Compartir → "Agregar a pantalla de inicio"

## 🐛 Solucionar problemas

### ❌ "npm: command not found"
- Instala Node.js desde https://nodejs.org

### ❌ "Port 4200 already in use"
```bash
# Mac/Linux
lsof -ti:4200 | xargs kill -9

# Windows PowerShell
Get-Process | Where-Object {$_.Name -eq 'node'} | Stop-Process -Force

npm start
```

### ❌ Módulos no instalados
```bash
rm -rf node_modules package-lock.json
npm install
npm start
```

### ❌ Cambios no aparecen
- Presiona F5 (recargar)
- Abre DevTools → Application → Clear cache

## 📚 Documentación

- **README.md** - Documentación completa
- **src/app/services/data.service.ts** - Lógica principal
- **src/app/pages/** - Componentes de páginas

## 🎯 Próximos pasos

1. ✅ `npm install`
2. ✅ `npm start`
3. ⏭️ Explora la app
4. ⏭️ Edita componentes en `src/app/pages/`
5. ⏭️ Customiza estilos con Tailwind
6. ⏭️ Añade más features
7. ⏭️ Deploy en Netlify

## 💡 Tips

- **Hot reload:** Los cambios se ven al guardar
- **TypeScript:** Tipado fuerte automáticamente
- **Tailwind:** Clases CSS pre-hechas
- **Standalone:** Componentes modernos (Angular 19)

## ✨ Ejemplo de componente

```typescript
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ejemplo',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-4">
      <h1 class="text-3xl font-bold">Hola!</h1>
      <p class="text-gray-600">Mi primer componente</p>
    </div>
  `
})
export class EjemploComponent {}
```

## 🚀 ¡Listo!

```bash
npm install
npm start
```

Visita http://localhost:4200 y comienza a explorar.

---

¿Preguntas? Revisa README.md o los comentarios en el código.
