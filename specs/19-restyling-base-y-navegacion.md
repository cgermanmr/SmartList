# SPEC 19 — Restyling: base visual y navegación inferior

> **Estado:** Aprobado
> **Depende de:** [SPEC 06](06-migracion-nextjs-vercel.md), [SPEC 07](07-nombre-el-changuito.md)
> **Fecha:** 2026-11-16
> **Objetivo:** Darle a la app una identidad visual nueva (paleta berenjena y amarillo, tipografía, íconos, formas) y una barra de navegación inferior, para que se vea moderna y amigable en el celular sin rediseñar todavía cada pantalla.

## Por qué existe esta spec

La app se ve como una web de escritorio achicada: la navegación está arriba, con scroll horizontal y lejos del
pulgar; los íconos son emojis, que cambian de dibujo entre Android y iPhone; la tipografía es la del sistema, y el
teal con fondo gris no tiene personalidad.

El restyling completo toca 6 pantallas y unas 3.000 líneas de UI. Se divide en dos: esta spec cambia **la base**
(colores, tipografía, clases compartidas, íconos) y **el shell** (header, navegación, footer, ícono de la app).
Como las pantallas usan los tokens `primary-*` y `gray-*` y las clases `.btn-primary`, `.card`, `.input-field`,
todas cambian de aspecto por herencia. El rediseño fino de cada pantalla queda para una spec posterior.

## Alcance

**Incluye:**

- Paleta nueva de marca: `primary` berenjena, `accent` amarillo cartel y neutros `gray` apenas violáceos.
- Tipografía **Rubik** (títulos y precios) y **Nunito Sans** (texto), cargadas con `next/font`.
- Clases compartidas de `globals.css` con formas y tamaños táctiles nuevos.
- **Barra de navegación inferior** en el celular, con ícono, etiqueta y contador del carrito; arriba desde `md`.
- Header compacto con logo nuevo; footer solo desde `md`.
- **lucide-react** como librería de íconos; todos los emojis y símbolos usados como ícono se reemplazan, en el
  shell y en todas las pantallas, sin cambiar el layout de las pantallas.
- Ícono de la app rediseñado (`icon.svg`, variante maskable), `theme_color` y `background_color` del manifest.
- Áreas seguras del celular (notch y barra de gestos) y alto con `dvh`.

**Fuera de alcance:**

- Rediseño de la estructura de cada pantalla (Buscar, Cargar, Carrito, Historial, Detalle, Calculadora), sus
  estados vacíos y sus textos: spec posterior.
- Modo oscuro.
- Reemplazar `alert()` / `confirm()` nativos por diálogos propios.
- Animaciones y transiciones entre pantallas.
- Service worker y modo offline.
- Ícono PNG para iPhone (`apple-touch-icon`) y pantallas de inicio (splash).
- Cambios de lógica, de datos o de `src/lib/`.

## Modelo de datos

Esta spec no introduce estructuras de datos nuevas ni cambia las claves de `localStorage`.

Tokens de diseño en `@theme` de `src/app/globals.css` (se conservan los nombres `primary-*` y se redefinen los
`gray-*` de Tailwind, para que las pantallas cambien sin tocar sus clases):

| Token | Hex | Uso |
|---|---|---|
| `primary-50` | `#F7F3FB` | Hover de filas, fondos suaves |
| `primary-100` | `#EDE4F6` | Pestaña activa (píldora), chips |
| `primary-200` | `#DBC9EC` | Anillo de foco de inputs |
| `primary-300` | `#C1A3DD` | |
| `primary-400` | `#A078C9` | |
| `primary-500` | `#8253B3` | Borde de input en foco |
| `primary-600` | `#6C3C9C` | |
| `primary-700` | `#5B2A86` | **Color de marca**: header, botones, pestaña activa, `theme_color` |
| `primary-800` | `#48216B` | Hover y `active` de `.btn-primary` |
| `primary-900` | `#371A52` | |
| `accent-100` | `#FFF4CC` | |
| `accent-400` | `#FFD23F` | **Acento**: logo, contador del carrito |
| `accent-500` | `#F5BE0B` | |
| `gray-50` | `#FAF8FC` | Fondo de la app, `background_color` |
| `gray-100` | `#F3F0F7` | |
| `gray-200` | `#E7E2EE` | Bordes de tarjetas |
| `gray-300` | `#D5CEDF` | Bordes de inputs |
| `gray-400` | `#A59DB3` | |
| `gray-500` | `#6F6780` | Texto secundario (mínimo para texto sobre blanco) |
| `gray-600` | `#554D66` | |
| `gray-700` | `#40384F` | |
| `gray-800` | `#2D2540` | |
| `gray-900` | `#1F1630` | Texto principal (tinta) |

Fuentes en `@theme`: `--font-sans` = Nunito Sans y `--font-display` = Rubik, las dos con la pila del sistema como
respaldo.

Los colores con significado **no cambian**: verde (más barato), rojo (más caro), azul (igual / en línea) y ámbar
(completar precio) siguen siendo los de Tailwind.

## Reglas

- **El amarillo es de marca, no de estado.** `accent-*` solo se usa en el logo y en el contador del carrito. Nunca
  para avisos: "Completar precio" sigue en ámbar.
- **Texto sobre amarillo en tinta** (`gray-900`), nunca blanco. Texto sobre `primary-700` en blanco.
- **Contraste mínimo 4,5:1** para texto. Sobre blanco, el gris más claro permitido para texto es `gray-500`.
- **Toque mínimo de 44 px** en botones, pestañas y botones de solo ícono.
- **Inputs con texto de 16 px**, para que el iPhone no haga zoom al enfocarlos.
- **Cifras tabulares** (`tabular-nums`) en toda la app: los precios no bailan al cambiar.
- **Íconos:** siempre de `lucide-react`, con `aria-hidden="true"`; un botón de solo ícono lleva `aria-label`. No
  queda ningún emoji ni símbolo (✕ ✓ ← ▲ ▼ ↺) usado como ícono en `src/**/*.tsx`.
- **Sin color de marca escrito a mano:** ningún `#0f766e` ni otro hex de marca en componentes; `PriceChart` usa
  `var(--color-primary-700)`.
- **La pestaña activa no depende solo del color:** lleva además la píldora de fondo y `aria-current="page"`.

## UI/UX

### Shell en el celular (menos de `md`)

```
┌────────────────────────────────┐
│ [logo] El Changuito    $12.450 │  header primary-700, compacto (~52 px)
├────────────────────────────────┤
│                                │
│   contenido (scroll)           │  fondo gray-50
│                                │
├────────────────────────────────┤
│  (o)    (+)   [=]3   [#]   [%] │  barra inferior blanca, borde superior
│ Buscar Cargar Carrito Hist. Calc. │  + área segura inferior
└────────────────────────────────┘
```

- **Header:** logo (changuito amarillo) y "El Changuito" en Rubik a la izquierda; a la derecha el total del
  carrito como link a `/cart` (`aria-label="Carrito: N productos, total $X"`). Sin gradiente. Con el carrito
  vacío no se muestra el total. Respeta el área segura superior.
- **Barra inferior:** 5 pestañas de igual ancho, ícono de 24 px arriba y etiqueta de 11 px abajo: **Buscar**
  (`Search`), **Cargar** (`CirclePlus`), **Carrito** (`ShoppingCart`), **Historial** (`ReceiptText`),
  **Calculadora** (`Calculator`). Las etiquetas van completas (el dibujo de arriba las abrevia). Sin scroll
  horizontal en 375 px.
  - Activa: ícono y texto en `primary-700`, con una píldora `primary-100` detrás del ícono. Inactiva: `gray-500`.
  - **Contador del carrito:** círculo `accent-400` con el número en tinta sobre el ícono del carrito; "99+" si
    pasa de 99; no se muestra con el carrito vacío.
  - Es el último hijo del contenedor flex del layout (no `position: fixed`): el contenido sigue haciendo scroll
    dentro de `<main>` y nada queda tapado. `padding-bottom: env(safe-area-inset-bottom)`.
- **Footer:** oculto.
- El aviso "✓ <nombre> en el carrito" de Buscar queda por encima de la barra inferior, sin taparla.

### Shell desde `md`

- La navegación va arriba, debajo del header, como hoy, con los mismos íconos al lado de la etiqueta y el
  contador en el carrito. El footer se muestra.

### Base

- **Tipografía:** títulos (`h1`–`h3`) en Rubik 600; texto en Nunito Sans 16 px. Los tamaños de los títulos de cada
  pantalla no cambian en esta spec.
- **`.btn-primary` / `.btn-secondary`:** alto mínimo 44 px, `rounded-xl`, estado `active` visible (más oscuro),
  `disabled` con opacidad, anillo de foco con `focus-visible`. El secundario pasa a fondo `primary-50` con texto
  `primary-700`.
- **`.card`:** `rounded-2xl`, borde `gray-200`, sombra muy suave; sin cambio de sombra al pasar el mouse.
- **`.input-field`:** alto mínimo 44 px, `rounded-xl`, texto de 16 px.
- **`.list-row`:** sin cambios de estructura; hereda los colores nuevos.
- **Íconos de las pantallas** (reemplazo uno a uno, mismo lugar y mismo tamaño aproximado):

| Hoy | Dónde | Ícono de lucide |
|---|---|---|
| 📷 | `ScanButton` | `ScanBarcode` |
| ✕ | `BarcodeScanner`, carrito, calculadora | `X` |
| ✓ | avisos de Buscar, Cargar y calculadora | `Check` |
| ← | detalle de producto | `ArrowLeft` |
| ✏ | editar precio en el detalle | `Pencil` |
| ▲ ▼ | variaciones en carrito e historial | `ArrowUp` / `ArrowDown` |
| 🛒 | historial | `ShoppingCart` |
| 💲 ➕ | pestañas de Cargar | `Tag` / `CirclePlus` |
| 💵 💳 📆 📲 📝 | medios de pago del carrito | `Banknote`, `CreditCard`, `CalendarDays`, `QrCode`, `FilePen` |
| ⚖ 🧴 📦 🧮 ↺ | calculadora | `Scale`, `Droplet`, `Package`, `Calculator`, `RotateCcw` |

Si algún nombre no existe en la versión instalada, se usa el equivalente más cercano de la librería.

### Ícono de la app

- `public/icon.svg`: changuito simple en `accent-400` sobre fondo `primary-700` con esquinas redondeadas. Reemplaza
  al "$" blanco sobre teal.
- `public/icon-maskable.svg`: el mismo dibujo dentro del 60 % central, con el fondo a sangre (sin esquinas
  redondeadas), declarado con `purpose: "maskable"` en el manifest.
- El mismo changuito, como componente `Logo`, reemplaza al 💰 del header.

Diseño con `/frontend-design` y `/ui-ux-pro-max` al implementar.

## Plan de implementación

1. **Tokens.** Redefinir `primary-*`, agregar `accent-*` y los `gray-*` en `@theme` de `globals.css`. `PriceChart`
   pasa a `var(--color-primary-700)`. Verificar: toda la app se ve berenjena y ningún texto queda ilegible.
2. **Tipografía.** Leer `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md`. Cargar Rubik y Nunito
   Sans con `next/font/google` en `layout.tsx`, exponerlas como variables CSS y mapearlas en `@theme`
   (`--font-sans`, `--font-display`). Quitar la pila de fuentes del `body`. Títulos en Rubik y `tabular-nums` en
   la capa base.
3. **Clases compartidas.** `.btn-primary`, `.btn-secondary`, `.card`, `.input-field` según *Base*.
4. **Íconos, parte 1.** Instalar `lucide-react`. Crear `src/components/Logo.tsx`. Reemplazar los emojis de
   `NavBar.tsx` y `layout.tsx`.
5. **Navegación inferior.** `NavLinks` con dos presentaciones por breakpoint (abajo con ícono sobre etiqueta;
   arriba desde `md`), etiquetas cortas y contador del carrito (nuevo `src/components/CartBadge.tsx`, que lee el
   store y no muestra nada antes de hidratar). En `layout.tsx`: contenedor con `h-dvh`, orden header → main → nav
   en el celular, footer `hidden md:block`.
6. **Header.** Compacto, sin gradiente, con `Logo`; `CartSummary` pasa a ser el link con el total.
7. **Áreas seguras.** `viewportFit: 'cover'` en `viewport`, `env(safe-area-inset-*)` en header y barra inferior;
   subir el aviso fijo de `src/app/page.tsx`.
8. **Íconos, parte 2.** Reemplazar los emojis y símbolos de `ScanButton`, `BarcodeScanner`, `page.tsx` (Buscar),
   `UploadForm`, `ProductDetail`, `cart/page.tsx`, `purchases/page.tsx` y `calculadora/page.tsx` según la tabla.
   Un archivo por commit si hace falta.
9. **Ícono de la app.** `icon.svg` nuevo, `icon-maskable.svg`, `manifest.json` (`theme_color` `#5B2A86`,
   `background_color` `#FAF8FC`, íconos) y `themeColor` de `layout.tsx`.
10. **Documentación.** `CLAUDE.md`: stack (lucide-react), estructura (`Logo.tsx`, `CartBadge.tsx`,
    `icon-maskable.svg`), rutas (etiquetas de la navegación), *Layout y PWA*, *Configuración de Estilos* (paleta
    nueva, acento, neutros, fuentes) y *Estado Actual*. `README.md` si menciona el color o muestra capturas.

## Criterios de aceptación

- [ ] `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.
- [ ] En 375 px la barra inferior muestra las 5 pestañas con ícono y etiqueta, sin scroll horizontal, en las 6 pantallas.
- [ ] La pestaña de la pantalla actual tiene `aria-current="page"`, color `primary-700` y la píldora de fondo; en `/product/[id]` no hay ninguna activa.
- [ ] Con 3 unidades en el carrito, la pestaña Carrito muestra "3" y el header el total; con el carrito vacío no se ve ninguno de los dos.
- [ ] El último elemento de cada pantalla se puede ver completo haciendo scroll: la barra inferior no lo tapa.
- [ ] El aviso "✓ <nombre> en el carrito" se ve entero por encima de la barra inferior.
- [ ] Desde 768 px la navegación está arriba y el footer se ve; por debajo, la navegación está abajo y el footer no se ve.
- [ ] No queda ningún emoji ni símbolo usado como ícono en `src/**/*.tsx` (fuera de comentarios).
- [ ] No queda `#0f766e` ni `#0d9488` en `src/` ni en `public/`.
- [ ] Los títulos se ven en Rubik y el texto en Nunito Sans; las fuentes se sirven desde el propio dominio (ninguna petición a `fonts.googleapis.com` ni `fonts.gstatic.com`).
- [ ] Enfocar cualquier input en un iPhone no hace zoom.
- [ ] Botones, pestañas y botones de solo ícono miden al menos 44 px de alto.
- [ ] El texto blanco sobre `primary-700`, el texto tinta sobre `accent-400` y el texto `gray-500` sobre blanco cumplen 4,5:1.
- [ ] Los badges verde, rojo, azul y ámbar de Buscar, el detalle y el carrito conservan sus colores y su significado.
- [ ] El manifest declara `theme_color` `#5B2A86` y los dos íconos; el favicon muestra el changuito.
- [ ] El lector de códigos de barras, los modales (`SepaLinkDialog`, `CartStoreDialog`, "Repetir") y el medio de pago siguen funcionando igual.

## Decisiones

- **Sí:** dividir el restyling. Base y shell primero cambian toda la app con pocos archivos; rediseñar cada pantalla en la misma rama sería imposible de revisar.
- **Sí:** berenjena `#5B2A86` + amarillo `#FFD23F`. Es la única de las tres paletas evaluadas que no choca con el verde, rojo, azul y ámbar que ya tienen significado, y el amarillo remite al cartel de oferta de la góndola.
- **No:** verde fresco + ámbar. Lo típico de las apps de almacén, pero el verde de marca se confunde con "más barato" y el ámbar con "Completar precio".
- **No:** cobalto + amarillo. Obligaba a cambiar el badge azul de "en línea".
- **No:** mantener el teal. Se pidió una identidad nueva.
- **Sí:** conservar los nombres `primary-*` y redefinir `gray-*`. Las cerca de 190 clases de color de las pantallas cambian sin editarlas.
- **Sí:** barra inferior de 5 pestañas. Al alcance del pulgar y sin scroll; 5 es el máximo razonable y entran en 375 px con etiquetas de una palabra.
- **No:** 4 pestañas + "Más". Deja la calculadora a un toque más sin necesidad.
- **Sí:** la barra como hijo flex del layout, no `position: fixed`. El scroll ya es de `<main>`; así no hay que agregar padding a cada pantalla ni se tapan contenidos.
- **Sí:** el contador va en la pestaña y el total en el header. "Carrito: N | Total: $X" no entra en un header compacto.
- **Sí:** footer solo desde `md`. En el celular ocupa una franja sin información útil.
- **Sí:** Rubik + Nunito Sans con `next/font`. Amigable sin ser infantil, números legibles, sin CDN y sin salto de fuente al cargar.
- **No:** fuente del sistema. La app se ve distinta en cada celular.
- **Sí:** `lucide-react`. Solo entran al bundle los íconos usados y el trazo es parejo en todos los sistemas.
- **No:** SVG propios para cada ícono. Más de 20 íconos a mano no se justifican; solo el logo es propio.
- **Sí:** reemplazar todos los emojis ahora. Que convivan íconos nuevos y emojis se ve peor que antes.
- **Sí:** ícono de la app nuevo con variante maskable. El "$" teal no representa la marca nueva y Android recorta los íconos sin zona segura.
- **No:** modo oscuro. Duplica la revisión de cada pantalla; primero se asienta el tema claro.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Alguna combinación de colores de las pantallas queda con poco contraste al cambiar `gray-*` y `primary-*` | El paso 1 incluye recorrer las 6 pantallas; los neutros nuevos conservan la luminosidad de los de Tailwind |
| Quien ya instaló la PWA sigue viendo el ícono y el color viejos | Android actualiza el manifest solo en unos días; en iPhone hay que volver a agregarla |
| El amarillo del contador se confunde con el ámbar de "Completar precio" | Regla: el amarillo solo en logo y contador; los avisos siguen en ámbar con texto |
| Etiquetas apretadas en pantallas de 320 px | Etiquetas de 11 px de una palabra; se verifica también en 320 px que no se corten |
| `<Activity>` conserva las páginas ocultas y el cambio de layout rompe el scroll o los `<dialog>` | El scroll sigue siendo de `<main>`; criterio de aceptación sobre lector y modales |
| Un nombre de ícono de lucide no existe en la versión instalada | Se usa el equivalente más cercano; el build falla si un import no existe |
| Las fuentes suman peso a la primera carga | Dos fuentes variables con subconjunto `latin` y `display: swap`; se cachean tras la primera visita |

## Lo que **no** incluye esta spec

- Rediseño de cada pantalla, estados vacíos y textos.
- Modo oscuro.
- Diálogos propios en lugar de `alert()` / `confirm()`.
- Animaciones entre pantallas.
- `apple-touch-icon` en PNG y splash.
- Cambios de lógica o de datos.
