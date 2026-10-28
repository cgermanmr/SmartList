# 03 — Lista de compras compartida

- **Estado:** Idea
- **Fase:** 2 (requiere backend)

## Problema

Dos personas (pareja, familia, compañeros de casa) hacen las compras en lugares distintos y quieren
repartirse la lista: cada uno marca lo que ya compró y el otro lo ve al instante, sin comprar dos veces
lo mismo.

## Qué existe hoy

- El **carrito** (`preciolocal_cart`) mezcla dos cosas: qué hay que comprar y a qué precio se compró.
- Todo vive en `localStorage` del dispositivo: no hay forma de compartir datos entre personas.

## Alcance MVP

- Separar conceptos:
  - **Lista**: qué hay que comprar (producto + cantidad). Es lo que se comparte.
  - **Carrito**: lo que efectivamente se compró, con precios. Sigue siendo individual.
- Crear una lista, invitar a otra persona por **link o código**.
- Cada ítem se puede **marcar como comprado**; se ve quién lo marcó y cuándo.
- Los cambios se reflejan en tiempo real en todos los dispositivos de la lista.
- Pasar los ítems marcados al carrito propio para cargar precios y cerrar la compra.

## Evolución futura

- Asignar ítems a una persona ("vos traés lo de la verdulería").
- Varias listas (semanal, mensual, evento).
- Funcionamiento offline con cola de cambios que se sincroniza al recuperar conexión.
- Notificación cuando el otro termina su parte.

## Modelo de datos propuesto

```typescript
interface ShoppingList {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  inviteCode: string;
  items: ShoppingListItem[];
  updatedAt: string;   // ISO
}

interface ShoppingListItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  checked: boolean;
  checkedBy?: string;  // userId
  checkedAt?: string;  // ISO
  assignedTo?: string; // futuro
}
```

**Conflictos:** resolver por ítem, gana el último cambio (`checkedAt` / `updatedAt`). Es suficiente para
listas chicas con pocas personas editando.

## Opciones técnicas (decidir con un ADR)

| Opción | A favor | En contra |
|---|---|---|
| **Supabase Realtime** + Auth + RLS (Fase 2 del roadmap) | Postgres con suscripciones a cambios, auth incluida, sin servidor propio; integración con Vercel | Dependencia de un servicio gestionado |
| Backend .NET 8 + SignalR | Control total | Requiere construir y hostear backend y auth propios; ya no es el plan del roadmap |

## UI/UX

- Nueva sección "Listas" en el nav.
- Ítems marcados se tachan y bajan al final; avatar o inicial de quien lo marcó.
- Indicador de conexión ("sincronizado" / "sin conexión").

## Dependencias

- Backend + autenticación (Fase 2 del [roadmap](../roadmap.md)).
- Canal de tiempo real (Supabase Realtime).
- Service worker para el modo offline (evolución futura).

## Preguntas abiertas

- ¿Hace falta cuenta para unirse a una lista, o alcanza con el link (invitado anónimo)?
- ¿La lista compartida reemplaza al carrito actual o convive con él?
