# 04 — Promociones y productos de comercios de cercanía

- **Estado:** Idea
- **Fase:** 2–3 (requiere backend)

## Problema

Los comercios del barrio (almacenes, verdulerías, carnicerías) no tienen un canal simple para avisar sus
ofertas a los vecinos, y los vecinos se enteran tarde o no se enteran.

## Qué existe hoy

Nada. No hay usuarios, roles, comercios como entidad ni notificaciones.

## Alcance MVP

- **Comercios adheridos**: una cuenta con rol "comerciante" asociada a un `Store` (ver feature 02).
- **El comerciante carga sus productos**, con precio y **foto**: los del catálogo de Precios Claros por código de
  barras y los que no lo tienen (pan, fiambre, verdura, comidas), que es lo que el SEPA no cubre.
- El comerciante publica promociones: producto, precio promocional, vigencia, condiciones y foto (opcional).
- Los usuarios ven una sección **"Promociones"** con las ofertas vigentes de los comercios que siguen o que
  están cerca.
- **Notificación push** cuando un comercio seguido publica una promoción.
- Las promociones vencidas dejan de mostrarse automáticamente.

## Fotos

Las fotos que ven otras personas empiezan por los comercios, no por los vecinos (decidido el 24/11/2026; motivos en la
[spec 28](../../specs/28-fotos-de-la-comunidad.md), postergada):

- La foto propia de un vecino ([spec 27](../../specs/27-fotos-propias.md)) sigue privada: "Solo la ves vos".
- La foto del comercio se muestra en su producto o su promoción; **no reemplaza** la imagen del catálogo para todos.
- La cuenta del comercio está identificada y se puede suspender, pero igual hace falta revisar lo publicado y poder
  quitarlo.
- Se reusa la compresión de la spec 27 y, de la spec 28, el rol en `app_metadata`, la cola de revisión y el bucket
  público, con los problemas de su *Revisión pendiente* resueltos.

## Evolución futura

- Alerta cuando un producto de la lista o del historial del usuario entra en promoción.
- Filtrar por distancia usando geolocalización.
- Estadísticas para el comercio (vistas, seguidores).
- Cupones canjeables en el local.

## Modelo de datos propuesto

```typescript
interface StoreProduct {   // producto que carga el comercio
  id: string;
  storeId: string;
  ean?: string;          // sin código: pan, fiambre, verdura
  name: string;
  price?: number;
  photoId?: string;
}

interface Promotion {
  id: string;
  storeId: string;
  productId?: string;    // StoreProduct; puede ser una promo genérica ("20% en verdulería")
  title: string;
  promoPrice?: number;
  regularPrice?: number;
  conditions?: string;   // "Llevando 2", "Solo efectivo"
  photoId?: string;
  validFrom: string;     // ISO
  validTo: string;       // ISO
}

interface StoreFollow {
  userId: string;
  storeId: string;
  notify: boolean;
}
```

## Notificaciones push

- Requiere **service worker** (hoy no existe) y **Web Push** con claves VAPID desde el backend.
- En **iOS** solo funciona con la PWA instalada en la pantalla de inicio (iOS 16.4 o posterior).
- Limitar frecuencia por comercio para no saturar al usuario.

## UI/UX

- Nueva sección "Promociones" en el nav, con tarjetas por comercio.
- Botón "Seguir comercio" en el detalle del comercio.
- Panel simple para el comerciante: cargar productos con foto, y crear, editar y finalizar
  promociones.

## Dependencias

- Catálogo de comercios (feature 02).
- Backend + autenticación **con roles** (usuario / comerciante).
- Service worker + Web Push.
- Supabase Storage con un bucket público para las fotos.

## Preguntas abiertas

- ¿Cómo se verifica que quien se registra como comerciante es realmente el dueño del local?
  Hay que resolverlo antes que las fotos: es lo que hace responsable a quien publica.
- ¿La moderación de productos, fotos y promociones es previa o posterior a publicarlos? ¿Quién la hace?
- Si un comercio se da de baja o se suspende, ¿qué pasa con sus productos y fotos?
- ¿El servicio es gratuito para el comercio o tiene algún modelo de suscripción?
