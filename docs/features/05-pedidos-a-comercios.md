# 05 — Pedidos a comercios

- **Estado:** Idea
- **Fase:** 3–4 (requiere backend)

## Problema

El cliente ya tiene armada su lista; en vez de ir a buscar cada producto, quiere mandársela a un comercio
adherido para que le preparen el pedido y pasar solo a retirarlo (o recibirlo).

## Qué existe hoy

Nada. Depende de las listas compartibles (03) y de los comercios adheridos (04).

## Alcance MVP

- Desde una lista, **enviar pedido** a un comercio adherido.
- El comercio recibe el pedido, lo acepta o rechaza, y lo prepara.
- **Estados:** enviado → aceptado → en preparación → listo → retirado/entregado; o cancelado/rechazado.
- **Sustituciones**: si falta un producto, el comercio propone un reemplazo o lo marca sin stock y el cliente
  acepta o rechaza.
- El comercio carga el precio final de cada ítem; al cerrar el pedido se registra como `Purchase` del cliente
  (y los precios entran al historial, igual que el checkout actual).
- Pago **fuera de la app** (en el local o transferencia) en el MVP.

## Evolución futura

- Envío a domicilio con franja horaria.
- Pago integrado (billeteras digitales).
- Chat cliente–comercio dentro del pedido.
- Pedidos recurrentes ("la compra de todos los viernes").

## Modelo de datos propuesto

```typescript
type OrderStatus =
  | 'enviado' | 'aceptado' | 'en_preparacion' | 'listo'
  | 'retirado' | 'entregado' | 'cancelado' | 'rechazado';

interface Order {
  id: string;
  customerId: string;
  storeId: string;
  sourceListId?: string;
  status: OrderStatus;
  items: OrderItem[];
  total?: number;          // lo completa el comercio
  createdAt: string;       // ISO
  updatedAt: string;
  pickupOrDelivery: 'retiro' | 'envio';
  notes?: string;
}

interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price?: number;          // lo completa el comercio
  status: 'pendiente' | 'preparado' | 'sin_stock' | 'sustituido';
  substitute?: { productId: string; productName: string; price: number; accepted?: boolean };
}
```

## UI/UX

- Cliente: botón "Enviar a un comercio" en la lista; seguimiento del pedido con línea de estados.
- Comercio: bandeja de pedidos entrantes, vista de preparación ítem por ítem.
- Notificación push en cada cambio de estado.

## Dependencias

- Lista de compras (feature 03).
- Comercios adheridos y push (feature 04).
- Backend + autenticación con roles.

## Preguntas abiertas

- ¿Qué pasa si el cliente no retira el pedido? ¿Seña o penalización?
- ¿El comercio puede editar cantidades además de precios?
