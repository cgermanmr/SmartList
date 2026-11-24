# SPEC 30 — Compartir la app por WhatsApp

> **Estado:** Aprobada
> **Depende de:** [SPEC 19](19-restyling-base-y-navegacion.md), [SPEC 21](21-cuenta-y-sincronizacion.md)
> **Fecha:** 2026-11-24
> **Objetivo:** Que un botón junto al nombre de la app abra WhatsApp con un mensaje y el link listos para enviar, y que ese link se vea con título, descripción e imagen.

## Por qué existe esta spec

La app no tiene cómo recomendarse: hay que copiar la dirección del navegador, y en la app instalada ni siquiera se ve.
Además, el link pegado en WhatsApp hoy sale sin imagen y con la descripción "PWA para comparar precios y gestionar
compras", que no le dice nada a quien la recibe.

## Alcance

**Incluye:**

- Botón de WhatsApp en el header, pegado al nombre "El Changuito", en todas las páginas y anchos.
- Con productos en el carrito y pantalla angosta, el nombre se oculta a la vista y queda el logo, para que entren el
  botón, la cuenta y el total.
- Vista previa del link (Open Graph): título, descripción nueva e imagen de 1200 × 630.

**Fuera de alcance (para otras specs):**

- Otras apps o el menú de compartir del sistema (el link del grupo, spec 22, lo sigue usando igual).
- Compartir un producto, un precio, el carrito o la página actual: se comparte siempre la página de inicio.
- Medir cuánta gente comparte o entra por el link.
- Invitar a un grupo por WhatsApp.
- Vista previa propia para la invitación a un grupo: usa la general.

## Reglas

### El botón

- Es un link (`<a>`) a `https://wa.me/?text=<mensaje codificado>`, con `target="_blank"` y `rel="noopener noreferrer"`.
  En el celular abre WhatsApp para elegir a quién; en la computadora, WhatsApp Web o la app de escritorio. El mensaje
  se puede editar antes de enviarlo.
- Mensaje (el link va al final, en otro renglón):

  ```
  Mirá El Changuito: leés el código de un producto y te dice dónde está más barato cerca tuyo. Gratis y sin instalar nada.
  https://elchanguito.vercel.app
  ```

- El link es **siempre el de producción**, también desde la preview o `localhost`.
- Funciona igual con o sin cuenta, y no usa ni envía ningún dato del usuario.
- No hay estados de carga ni de error: si WhatsApp no está, `wa.me` muestra su propia página. No hay aviso después de
  compartir, porque la app no puede saber si se envió.

### El lugar en el header

- Orden: logo y nombre (link a `/`), botón de WhatsApp; a la derecha, cuenta y total del carrito, como hoy. El botón
  va **fuera** del link a `/`.
- Con productos en el carrito y menos de 430 px de ancho, el nombre pasa a `sr-only`: no se ve, y el link sigue
  llamándose "El Changuito" para lectores de pantalla. Desde 430 px, o con el carrito vacío, se ve.
- Con un total muy largo, desde 430 px, el nombre se trunca (`truncate`), como hoy. El botón, la cuenta y el total no
  se achican nunca.
- Hasta que se cargan los datos del teléfono se muestra el nombre, igual que en el HTML prerenderizado.

### La vista previa del link

- Título "El Changuito"; descripción **"Compará precios de los comercios cerca tuyo y armá tu compra."**, que reemplaza a
  la actual también en `description` (buscadores). `og:type` `website`, `og:locale` `es_AR`, `og:site_name`
  "El Changuito".
- Imagen: 1200 × 630, PNG, generada en el build; fondo berenjena, changuito amarillo, "El Changuito" y debajo "Compará
  precios cerca tuyo". Lo importante va en el cuadrado central de 630 px, porque WhatsApp a veces la recorta.
- `metadataBase` es la URL de producción: la imagen se publica con dirección absoluta.
- **Sin `og:url` ni `canonical`:** un link a otra página (por ejemplo, la invitación a un grupo) conserva su dirección.

## Modelo de datos

No hay datos nuevos ni persistencia.

```typescript
// src/lib/share.ts
export const APP_URL = 'https://elchanguito.vercel.app';
export const APP_DESCRIPTION = 'Compará precios de los comercios cerca tuyo y armá tu compra.';
export const SHARE_TEXT =
  'Mirá El Changuito: leés el código de un producto y te dice dónde está más barato cerca tuyo. Gratis y sin instalar nada.';

/** Link de WhatsApp con el texto y la dirección en otro renglón */
export function whatsappUrl(text: string, url: string): string;
```

## UI/UX

```
Sin carrito (375 px):
│ [🛒] El Changuito [WA]                  (A) │

Con carrito, menos de 430 px:
│ [🛒] [WA]                  (A)  $12.345,67  │

Con carrito, desde 430 px:
│ [🛒] El Changuito [WA]     (A)  $12.345,67  │
```

- Logo de WhatsApp en SVG propio, blanco sobre el berenjena del header (`currentColor`), de 24 px, con
  `aria-hidden="true"`.
- Área de toque de 44 × 44 px, redonda, con `hover:bg-white/10` y anillo de foco blanco, como `AccountButton`.
- `aria-label="Compartir El Changuito por WhatsApp"`.
- 375 y 320 px sin scroll horizontal.
- Diseño con `/frontend-design` y `/ui-ux-pro-max` al implementar.

## Plan de implementación

1. **Función pura (TDD):** `src/lib/share.ts` con las constantes y `whatsappUrl`, y `share.test.ts`: el texto y la
   dirección vuelven iguales al decodificar (acentos, dos puntos y salto de línea).
2. **Botón:** `src/components/WhatsAppButton.tsx` (Server Component, con el SVG adentro) y su lugar en
   `src/app/layout.tsx`, al lado del link del nombre.
   **Verificar:** abre WhatsApp con el mensaje escrito en el celular y en la computadora.
3. **Nombre que cede:** `src/components/AppName.tsx` (cliente) lee `hydrated` y el carrito del store y aplica
   `max-[429px]:sr-only` con productos; `layout.tsx` lo usa en lugar del `<span>`.
   **Verificar:** 320, 375, 429, 430 y 1280 px, con y sin carrito y con sesión; si con un total de "$12.345,67" a 430 px
   el nombre no entra, ajustar el corte y anotarlo en *Decisiones*.
4. **Vista previa:** `metadata` de `layout.tsx` (`metadataBase`, `description`, `openGraph`) y
   `src/app/opengraph-image.tsx` con `ImageResponse` de `next/og` (leer antes la guía `opengraph-image.md` de
   `node_modules/next/dist/docs/`). La fuente, Rubik SemiBold, va en el repo en `src/assets/` (licencia OFL): el build
   no la descarga.
   **Verificar:** `npm run build` la genera estática; las etiquetas `og:*` están en el HTML de `/` y `/grupo/unirse`.
5. **Docs:** `CLAUDE.md` (Estructura, Layout y PWA, Estado Actual y, en Convenciones, el logo de WhatsApp como excepción
   a lucide). Es la excepción que ya tiene `Logo`.

**A revisar (sin test automático):** tocar el botón en Android y en iPhone, también con la app instalada; pegar el link
en un chat después de publicar en `main` y ver la tarjeta. WhatsApp guarda la vista previa: si muestra la anterior,
probar con `?v=2` al final.

## Criterios de aceptación

- [ ] El botón aparece junto al nombre en todas las páginas, con y sin cuenta.
- [ ] Tocarlo en el celular abre WhatsApp con el mensaje y `https://elchanguito.vercel.app`; en la computadora, WhatsApp
      Web o la app.
- [ ] Desde la preview y `localhost`, el link del mensaje es el de producción.
- [ ] Con el carrito vacío, el nombre se ve a 375 px junto al botón.
- [ ] Con productos en el carrito y menos de 430 px, se ven el logo, el botón, la cuenta y el total, y no el nombre; un
      lector de pantalla sigue leyendo "El Changuito" en el link.
- [ ] Con productos en el carrito y un total de $12.345,67, desde 430 px se ve también el nombre entero.
- [ ] El botón mide 44 × 44 px o más, tiene `aria-label` "Compartir El Changuito por WhatsApp" y foco visible.
- [ ] Tocar el logo o el nombre sigue llevando a `/` y no abre WhatsApp.
- [ ] El HTML de `/` tiene `og:title`, `og:description`, `og:image` absoluta (1200 × 630) y la `description` nueva; no
      tiene `og:url`.
- [ ] La imagen pesa menos de 300 KB y se lee recortada al cuadrado central.
- [ ] Pegar el link de producción en WhatsApp muestra la imagen, el título y la descripción.
- [ ] 320 y 375 px sin scroll horizontal; `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.

## Decisiones

- **Directo a WhatsApp** (elegido por el usuario): un toque menos que el menú del sistema y funciona en la computadora.
  Descartado: `navigator.share`, que ofrece otras apps pero no existe en todos los navegadores.
- **Cede el nombre** (elegido por el usuario) cuando no entra todo: el botón queda siempre en el mismo lugar y el logo
  alcanza para reconocer la app. Descartado: ocultar el botón con carrito y cortar el nombre ("El Cha…").
- **`sr-only` y no `hidden`:** el link a `/` conserva su nombre accesible.
- **Logo de WhatsApp blanco** (elegido por el usuario): se reconoce al instante. Es un SVG propio porque lucide no trae
  marcas. Descartado: verde, que en la app significa "más barato", y `Share2`, que no dice que es WhatsApp.
- **Mensaje con el beneficio, link siempre de producción y descripción de la tarjeta** (elegidos por el usuario).
- **Vista previa en esta spec** (elegido por el usuario): es lo primero que ve quien recibe el link.
- **Un link y no un botón con JavaScript:** funciona antes de hidratar, se puede abrir en otra pestaña y no necesita
  estado.
- **Imagen generada con código y no un PNG versionado:** se ajusta en un diff. La fuente va en el repo para que el build
  no dependa de la red.
- **Sin cambios en `/privacidad`:** la app no manda ningún dato; el mensaje lo envía la persona desde su WhatsApp.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El header se aprieta con totales largos o pantallas de 320 px | El nombre cede y después se trunca; se mide en 5 anchos (paso 3) |
| WhatsApp muestra una vista previa vieja | Es su caché; probar con `?v=2` |
| En la preview, `og:image` apunta a producción, donde la imagen todavía no está | Verificar la imagen en la preview abriéndola directo, y la tarjeta después de publicar |
| Cambia el dominio de producción | Una sola constante, `APP_URL` |

## Qué **no** entra en esta spec

- Otras apps o el menú del sistema.
- Compartir productos, precios, el carrito o la página actual.
- Medición de links.
- Invitación al grupo por WhatsApp y su vista previa propia.

Cada una, si llega, va en su propia spec.
