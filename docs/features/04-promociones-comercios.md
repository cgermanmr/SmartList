# 04 — Promociones de comercios de cercanía

- **Estado:** Idea
- **Fase:** 2–3 (requiere backend)

## Problema

Los comercios del barrio (almacenes, verdulerías, carnicerías) no tienen un canal simple para avisar sus
ofertas a los vecinos, y los vecinos se enteran tarde o no se enteran.

## Qué existe hoy

Nada. No hay usuarios, roles, comercios como entidad ni notificaciones.

## Alcance MVP

- **Comercios adheridos**: una cuenta con rol "comerciante" asociada a un `Store` (ver feature 02).
- El comerciante publica promociones: producto, precio promocional, vigencia y condiciones.
- Los usuarios ven una sección **"Promociones"** con las ofertas vigentes de los comercios que siguen o que
  están cerca.
- **Notificación push** cuando un comercio seguido publica una promoción.
- Las promociones vencidas dejan de mostrarse automáticamente.

## Evolución futura

- Alerta cuando un producto de la lista o del historial del usuario entra en promoción.
- Filtrar por distancia usando geolocalización.
- Estadísticas para el comercio (vistas, seguidores).
- Cupones canjeables en el local.

## Modelo de datos propuesto

```typescript
interface Promotion {
  id: string;
  storeId: string;
  productId?: string;    // puede ser una promo genérica ("20% en verdulería")
  title: string;
  promoPrice?: number;
  regularPrice?: number;
  conditions?: string;   // "Llevando 2", "Solo efectivo"
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
- Panel simple para el comerciante: crear, editar y finalizar promociones.

## Dependencias

- Catálogo de comercios (feature 02).
- Backend + autenticación **con roles** (usuario / comerciante).
- Service worker + Web Push.

## Preguntas abiertas

- ¿Cómo se verifica que quien se registra como comerciante es realmente el dueño del local?
- ¿Hace falta moderación de las promociones publicadas?
- ¿El servicio es gratuito para el comercio o tiene algún modelo de suscripción?
