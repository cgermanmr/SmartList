# SPEC 35 — Dirección y punto en el mapa de un comercio nuevo

> **Estado:** Aprobada
> **Depende de:** [SPEC 14](14-carrito-por-comercio.md), [SPEC 15](15-precios-y-comercios-cercanos.md), [SPEC 16](16-mapa-y-como-llegar.md), [SPEC 26](26-cargar-precio-en-el-comercio.md)
> **Fecha:** 2026-11-24
> **Objetivo:** Al agregar un comercio en Cargar precio o en el carrito, sugerir direcciones reales ordenadas por cercanía y permitir marcar su punto en el mapa.

## Por qué existe esta spec

La dirección de un comercio cargado a mano es texto libre: no se valida, y sin GPS el comercio queda sin coordenadas, así
que no tiene distancia ni mapa. Con GPS tiene coordenadas, pero la dirección hay que escribirla igual, y el punto no se
puede corregir. En el carrito ni siquiera se puede cargar la dirección.

Medido el 24/11/2026:

| Servicio | Resultado |
|---|---|
| **Georef** (`apis.datos.gob.ar/georef`, oficial, sin clave, con CORS) | "Caseros" en Parque Patricios: AV CASEROS a 30 m; en Olivos: CASEROS a 100 m. 0,1 s, 2 a 10 KB. Tolera "cazeros". No ordena por cercanía y no da calle a partir de un punto |
| **Photon** (OpenStreetMap) | 1,1 s y pide la posición. "Caseros" en Parque Patricios trae estaciones y paradas, no la avenida |
| **Nominatim** (OpenStreetMap) | Punto → "Avenida Caseros 2888, Parque Patricios". Prohíbe autocompletar |

## Alcance

**Incluye:**

- Un solo formulario **Otro comercio** en Cargar precio ("Otro comercio" y "Otro comercio acá") y en **Cambiar comercio**
  del carrito, que suma Dirección y punto.
- Sugerencias de **Georef** mientras se escribe la dirección, ordenadas por cercanía en el dispositivo.
- **Marcar en el mapa**: un modal con el pin fijo en el centro.
- **Completar la dirección** a partir del punto del GPS, con Nominatim y solo al tocarlo.
- `/privacidad`.

**Fuera de alcance:**

- Los campos de barrio y comercio al registrar una compra de "Sin comercio".
- Editar el comercio de un precio o de una compra ya guardados, o completar los que no tienen punto.
- Cambiar cómo se identifica un comercio (`storeKey`: nombre y barrio).
- Buscar comercios por su nombre en el mapa.
- Validar direcciones de sucursales de Precios Claros.
- Elegir la localidad de la app (`LocationBar`) con Georef.

## Reglas

### El formulario

Nombre (obligatorio), Dirección, Barrio y el punto (opcionales). El nombre vacío da "Completá el nombre del comercio",
también en el carrito. El botón dice "Usar este comercio" en Cargar precio y "Mover a este comercio" en el carrito.

- **La dirección no es obligatoria ni hace falta validarla:** sin elegir una sugerencia se guarda como texto.
- Las coordenadas se guardan redondeadas a 4 decimales (`otherStore`, sin cambios). Sin punto, sin coordenadas.
- En el carrito, el comercio con punto gana el botón **Mapa** y entra en **Ver recorrido**, como cualquier comercio con
  coordenadas.
- En el carrito, si el comercio escrito es el mismo (`storeKey`) que el de ítems ya cargados, **todos** pasan a tener la
  dirección y el punto nuevos, en un solo cambio del store. Así se completa un comercio cargado sin dirección.

### Sugerencias de dirección

- Con 3 caracteres o más, 400 ms después de la última tecla. Una respuesta vieja se descarta; límite de 5 s.
- **La posición no se envía.** El dispositivo elige los **15 departamentos** (partidos o comunas) de centro más cercano y
  Georef recibe el texto y esos ids. La distancia se calcula en el dispositivo.
- **Referencia para la cercanía**, la primera que haya: el punto del GPS o marcado en este formulario; la ubicación de la
  app (GPS o localidad). Nunca se pide el permiso por escribir.
- **Sin referencia, o sin resultados cerca:** busca en todo el país.
- **Con una coma** ("Caseros 2500, Olivos"), lo que sigue a la última coma es la localidad: busca en esa `localidad` y, sin
  resultados, en ese `departamento`, sin mirar la cercanía. (Georef ignora la coma: la separa la app.)
- **Altura que no existe** ("Caseros 99999"): vuelve a buscar sin la altura y ofrece las calles.
- Hasta **6**, de la más cercana a la más lejana; sin referencia, en el orden de Georef. Una por calle y localidad: las
  cuadras, y las comunas de una misma avenida, se juntan en la más cercana.

| Parte | Formato |
|---|---|
| Renglón principal | "Av. Caseros 2500": en formato título, con AV → Av., DR → Dr., GRL → Gral., PTE → Pte., CNEL → Cnel., DIAG → Diag. |
| Renglón secundario | "Comuna 4, CABA · a 240 m" / "Vicente López, Buenos Aires"; "aprox." si la referencia es una localidad. Una calle sin altura dice solo la localidad y la provincia |

| Estado | Texto |
|---|---|
| Buscando | "Buscando direcciones…" |
| Sin resultados | "No encontramos esa dirección. Podés marcarla en el mapa." |
| Altura inexistente | "No encontramos esa altura. Elegí la calle y marcá el punto en el mapa." |
| Falla, sin conexión o más de 5 s | "No se pudo validar la dirección. Podés guardarla igual." |

### Elegir una sugerencia

- **Con altura:** completa la dirección y el punto pasa a ser el de Georef (reemplaza al del GPS o al marcado).
- **Sin altura:** completa "Av. Caseros " con el cursor al final y el aviso "Agregá la altura". Al escribir el número se
  buscan direcciones **solo de esa calle y localidad**; cambiar el nombre de la calle saca esa condición. Sin número se
  guarda la calle, sin punto nuevo.
- **Calle elegida por altura inexistente:** queda la calle con el número escrito, sin punto nuevo.
- Escribir en Dirección después de elegir descarta el punto que vino de la sugerencia (en "Otro comercio acá" vuelve el
  del GPS). Un punto marcado en el mapa no se descarta.

### El punto

Debajo de los campos, una fila:

| Punto | Qué dice | Acciones |
|---|---|---|
| Sin punto | "Sin punto en el mapa" | **Marcar en el mapa** |
| Del GPS | "Punto: tu ubicación" | **Ver o ajustar**, **Quitar** y, con la dirección vacía, **Completar la dirección** |
| De una sugerencia | "Punto: el de la dirección" | **Ver o ajustar**, **Quitar** |
| Marcado | "Punto: marcado en el mapa" | **Ver o ajustar**, **Quitar** |

### Marcar en el mapa

- Modal a pantalla completa (tarjeta desde `sm`), como el de la spec 16: el **pin queda fijo en el centro** y se mueve el
  mapa. Teclado: las flechas mueven el mapa, y + y − cambian el zoom.
- Centro inicial, lo primero que haya: el punto; la cuadra más cercana de la calle elegida; la ubicación de la app; todo
  el país. Con punto o calle, zoom 17; con ubicación, 15.
- **Usar mi ubicación** centra el mapa en el GPS, sin cambiar la ubicación de la app.
- **Usar este punto**: deshabilitado con zoom menor a 16, con "Acercá el mapa para marcar el punto".
- **Al confirmar un punto movido**, se busca su dirección en Nominatim y **reemplaza** la escrita. Aviso siempre a la vista:
  "El punto se envía a OpenStreetMap para buscar su dirección." Confirmar sin mover el mapa no envía nada.
- Mientras busca, "Buscando la dirección…" en el formulario, ya sin el modal; se puede guardar sin esperar.
- Cerrar con Escape o con el botón no cambia nada, devuelve el foco y **no cierra el modal del carrito** que está debajo.
- Sin conexión o si no carga Leaflet: "No se pudo cargar el mapa" y solo se puede cerrar.

### Del punto a la dirección (Nominatim)

- Solo al tocar **Completar la dirección** (con "El punto se envía a OpenStreetMap" al lado) o al confirmar un punto movido.
  Límite de 8 s; nunca dos a la vez.
- Dirección: calle y altura. Barrio: `suburb`, `neighbourhood`, `town`, `village` o `city`, el primero que haya.
- Reemplaza la dirección. **El barrio escrito a mano no se toca:** solo se completa si está vacío o si lo había completado
  la app. Elegir una sugerencia de Georef vacía un barrio completado por la app.
- Sin calle, si falla o si tarda más de 8 s: el punto queda, los campos no cambian y "No encontramos la dirección de este
  punto. Revisá que coincida con la escrita."
- Si mientras tanto se escribió en Dirección o cambió el punto, la respuesta se descarta.

## Modelo de datos

Sin estructuras guardadas nuevas, sin claves nuevas de `localStorage` y sin migraciones: `StoreRef` ya tiene `address`,
`barrio`, `lat` y `lng`. Los departamentos (17 KB) se piden a Georef una vez por sesión y no se guardan; si fallan, se busca
en todo el país.

```typescript
// src/lib/address.ts
export interface Department { id: string; lat: number; lng: number }

export interface AddressSuggestion {
  street: string;                 // "Av. Caseros"
  number?: string;                // "2500"; sin él es una calle
  place: string;                  // "Comuna 4, CABA"
  locality: string;               // para acotar la búsqueda de la altura
  point: LatLng | null;           // sin altura: la cuadra más cercana, solo para centrar el mapa
  distanceKm: number | null;
}

/** "Caseros 2500, Olivos" → texto, localidad y altura */
export function parseAddressQuery(text: string): { text: string; locality?: string; number?: string };
export function nearestDepartments(departments: Department[], origin: LatLng, max?: number): string[];
/** "AV CASEROS" → "Av. Caseros" */
export function formatStreet(raw: string): string;
/** Respuesta cruda de Georef → sugerencias agrupadas y ordenadas */
export function parseGeoref(raw: unknown, origin: LatLng | null): AddressSuggestion[];
/** Respuesta cruda de Nominatim; null sin calle */
export function parseReverse(raw: unknown): { address: string; barrio?: string } | null;

export type AddressSearch =
  | { status: 'ok'; suggestions: AddressSuggestion[]; unknownNumber: boolean }
  | { status: 'failed' };
/** Caché de sesión por texto y departamentos; un fallo no se guarda */
export function searchAddresses(query: string, origin: LatLng | null): Promise<AddressSearch>;
export function reverseAddress(point: LatLng): Promise<{ address: string; barrio?: string } | null>;

// src/lib/store.ts — con mismo storeKey, los demás ítems del grupo toman el comercio nuevo
// setCartItemStore(itemId, store, price?)
```

## UI/UX

```
Formulario                               Mapa
┌──────────────────────────────────┐     ┌──────────────────────────────────┐
│ Nombre                           │     │ Marcar el comercio           [x] │
│ [Super Luna                    ] │     ├──────────────────────────────────┤
│ Dirección (opcional)             │     │                                  │
│ [Caseros                       ] │     │               (pin)              │
│ ┌──────────────────────────────┐ │     │                              [+] │
│ │ Av. Caseros                  │ │     │                              [-] │
│ │ CABA · a 30 m                │ │     ├──────────────────────────────────┤
│ │ Caseros                      │ │     │ [Usar mi ubicación]              │
│ │ Avellaneda, Buenos Aires     │ │     │ El punto se envía a OpenStreetMap│
│ └──────────────────────────────┘ │     │ para buscar su dirección.        │
│ Barrio (opcional)                │     │ [       Usar este punto        ] │
│ [                              ] │     └──────────────────────────────────┘
│ Sin punto en el mapa             │
│ [Marcar en el mapa]              │
└──────────────────────────────────┘
```

- Sugerencias como `combobox` con `listbox`: flechas para recorrer, Enter elige la resaltada (sin resaltada, usa el
  comercio, como hoy), Escape cierra solo la lista. La cantidad se anuncia.
- La lista va en el flujo, no flotante, para que el teclado del celular y el modal del carrito no la corten.
- Filas y botones de 44 px. Pie: "Direcciones: Georef — datos.gob.ar" con la lista abierta; el mapa conserva la atribución
  de OpenStreetMap.
- Diseño con `/frontend-design` y `/ui-ux-pro-max` al implementar.

## Plan de implementación

1. **Funciones puras (TDD):** `parseAddressQuery`, `nearestDepartments`, `formatStreet`, `parseGeoref` y `parseReverse` en
   `src/lib/address.ts`, con respuestas reales guardadas en `address.test.ts` (Caseros en Parque Patricios y en Olivos,
   calles numeradas de La Plata, respuestas inválidas).
   **Verificar:** `npm test`.
2. **Consultas (TDD):** `searchAddresses` y `reverseAddress` con `fetch` simulado: departamentos, sin resultados cerca →
   todo el país, coma, altura inexistente, límite de tiempo y caché; un test comprueba que la URL de Georef no lleva
   coordenadas.
   **Verificar:** `npm test`.
3. **Formulario compartido:** `OtherStoreForm` pasa de `PriceStorePicker.tsx` a `src/components/OtherStoreForm.tsx`, y
   `CartStoreDialog.tsx` lo usa; `setCartItemStore` completa los demás ítems del mismo comercio (TDD).
   **Verificar:** Cargar precio igual que antes; en el carrito, un comercio con dirección.
4. **Sugerencias:** `src/components/useAddressSearch.ts` y `src/components/AddressField.tsx` en el formulario.
   **Verificar:** "Caseros" con localidad Parque Patricios y con Olivos; sin ubicación; "Caseros 2500, Olivos"; sin conexión.
5. **Mapa:** `src/components/useLeafletMap.ts` (la creación del mapa, sacada de `BranchMap.tsx`) y
   `src/components/PointMapDialog.tsx`, con la fila del punto en el formulario.
   **Verificar:** los mapas de hoy igual; marcar, ajustar y quitar un punto en las dos pantallas; Escape con el modal del
   carrito debajo.
6. **Del punto a la dirección:** **Completar la dirección** y el reemplazo al confirmar un punto movido.
   **Verificar:** en las herramientas de red, Nominatim solo se consulta en esos dos casos.
7. **Privacidad y docs:** `/privacidad` ("Tu ubicación"), el comentario de `src/lib/route.ts` y `src/lib/location.ts`,
   `CLAUDE.md` (Estructura, Arquitectura, Cargar, Carrito, Estado Actual) y una nota en la spec 26.

**A revisar a mano (sin test automático):** en la calle, con el celular: "Otro comercio acá", completar la dirección,
ajustar el punto con el dedo y elegir una sugerencia.

## Criterios de aceptación

- [ ] Con la localidad Parque Patricios, escribir "Caseros" ofrece primero "Av. Caseros"; con Olivos, primero "Caseros".
- [ ] "Caseros 2500, Olivos" ofrece esa dirección aunque la ubicación sea otra.
- [ ] Sin ubicación se ofrecen direcciones de todo el país con su partido y provincia, y no se pide el permiso.
- [ ] Elegir "Av. Caseros 2500" guarda dirección y coordenadas; el precio aparece con distancia y **Mapa**.
- [ ] Elegir "Av. Caseros" pide la altura, y al escribir 2500 ofrece solo esa calle.
- [ ] Editar la dirección después de elegirla saca el punto de la sugerencia.
- [ ] Una dirección inexistente se puede guardar como texto, con el aviso.
- [ ] Sin conexión o con Georef caído, el comercio se puede guardar igual.
- [ ] "Otro comercio acá" sin tocar nada más guarda el punto del GPS y no consulta Nominatim.
- [ ] **Completar la dirección** llena dirección y barrio; un barrio escrito a mano no cambia.
- [ ] Mover el mapa y **Usar este punto** guarda el punto y reemplaza la dirección; sin mover, no se consulta nada.
- [ ] Si Nominatim no responde, el punto queda y los campos no cambian.
- [ ] Con zoom menor a 16, **Usar este punto** está deshabilitado y dice por qué.
- [ ] **Quitar** deja el comercio sin coordenadas.
- [ ] Ninguna consulta a Georef lleva coordenadas.
- [ ] Usar el GPS en el formulario o en su mapa no cambia la ubicación de Buscar.
- [ ] En el carrito, un comercio con punto tiene **Mapa** y entra en el recorrido; uno ya cargado sin dirección la recibe
      en todos sus ítems.
- [ ] Escape en la lista o en el mapa no cierra el modal del carrito.
- [ ] El mapa de un comercio, la ruta y el recorrido (spec 16) siguen igual, y Leaflet no entra en el JS inicial.
- [ ] `/privacidad` dice qué se envía a Georef y a OpenStreetMap, y cuándo.
- [ ] Teclado y lector de pantalla: elegir una sugerencia y marcar un punto sin mouse.
- [ ] 320 y 375 px sin scroll horizontal; `npm run lint`, `npm test` y `npm run build` sin errores ni warnings.

## Decisiones

- **Georef para buscar** (elegido por el usuario): acertó en los puntos probados, es rápido y no recibe la ubicación.
  Descartado: Photon (más lento, recibe la posición y no encontró la avenida) y Nominatim (prohíbe autocompletar).
- **Cercanía calculada en el dispositivo:** Georef no ordena por distancia, y así la ubicación no sale. Los 15
  departamentos dan una idea gruesa de la zona; se aclara en `/privacidad`.
- **Nominatim para ir del punto a la dirección:** Georef no da la calle de un punto. Cambia la decisión de la spec 26 de no
  hacerlo.
- **Con GPS, al tocar un botón** (elegido por el usuario). Descartado: automático, o no completarla.
- **Al mover el punto, la dirección se actualiza** (elegido por el usuario): el aviso está en el modal, antes de confirmar.
  Descartado: cambiar solo el punto.
- **Se puede guardar sin validar** (elegido por el usuario): hay direcciones que Georef no tiene, y el servicio puede
  fallar. Descartado: exigirlo.
- **Cargar precio y carrito, con un solo formulario** (elegido por el usuario). Descartado: solo Cargar precio, o también
  la compra de "Sin comercio".
- **Pin fijo en el centro** (elegido por el usuario): el dedo no tapa el punto. Descartado: tocar o arrastrar.
- **Sin altura, se pide** (elegido por el usuario). Descartado: la cuadra más cercana, que puede no ser la del comercio.
- **La ubicación que haya, sin pedirla** (elegido por el usuario). Descartado: pedir el permiso al escribir.
- **Zoom mínimo 16 para confirmar:** más lejos, el punto puede quedar a varias cuadras.
- **Completar todos los ítems del mismo comercio:** para la app son el mismo, y el mapa usa los datos del primero.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Georef o Nominatim caídos, o con límite de uso | Todo es optativo, con límite de tiempo; siempre se guarda como texto y se puede marcar en el mapa |
| Georef ubica la altura de forma aproximada en la cuadra | **Ver o ajustar** |
| Calle nueva, sin nombre o fuera de Georef | Marcar en el mapa |
| Georef no encuentra palabras incompletas ("cas") | Espera de 400 ms; con la palabra entera aparece |
| Dos comercios con el mismo nombre y barrio y distinta dirección se juntan, como hoy | Escribir el barrio; cambiar `storeKey` queda fuera |
| Límite de uso de Nominatim (1 consulta por segundo) | Solo por acción del usuario y nunca dos a la vez |

## Qué **no** entra en esta spec

- Los campos de comercio al registrar una compra de "Sin comercio".
- Editar comercios ya guardados.
- Cambiar `storeKey`.
- Buscar comercios por nombre en el mapa.
- Georef en el selector de localidad de la app.

Cada una, si llega, va en su propia spec.
