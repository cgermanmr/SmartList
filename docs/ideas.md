# Bandeja de ideas

Ideas sin analizar. Cuando una se define mejor, se crea su archivo en [`features/`](features/) y se agrega a
la tabla del [índice](README.md). Las ideas chicas pueden pasar directo a una spec en [`specs/`](../specs/): se
enlazan acá con `→ spec NN` y se borran de la bandeja cuando la spec se implementa.

## Análisis de gastos

- **Panel de gasto mensual**: total gastado por mes, por categoría y por medio de pago, a partir de `Purchase`.
  → [spec 03](../specs/03-panel-gasto-mensual.md)
- **Inflación personal**: variación de la canasta propia entre compras o entre meses (mismos productos, mismas
  cantidades), para comparar contra la inflación oficial. → [spec 04](../specs/04-inflacion-personal.md)
- Exportar historial de compras y precios a CSV. → [spec 05](../specs/05-exportar-csv.md)

## Productos y precios

- Favoritos
- Alertas de precio bajo
- Lector de código de barras para cargar productos y precios (Fase 3)
- Foto del ticket para cargar una compra completa

## Compras

- Listas de compra personalizadas (ver [03 — Lista compartida](features/03-lista-compartida.md))
- Compartir carrito
- Presupuesto mensual con aviso al acercarse al límite

## Comercios y comunidad

- Cupones y promociones (ver [04 — Promociones](features/04-promociones-comercios.md))
- Recomendaciones personalizadas
- Billeteras digitales / pagos integrados
- Chat con comerciantes

## Calidad y deuda técnica

- **Botón anidado en el historial de compras** (`pages/purchases/purchases.component.html`): el botón
  "🛒 Repetir" está dentro del botón que expande la compra. Es HTML inválido (un `<button>` no puede contener
  otro), los lectores de pantalla lo anuncian mal y depende de `$event.stopPropagation()` para no expandir al
  hacer clic. Sacar "Repetir" fuera del botón de expandir (p. ej. el encabezado como `div` con dos botones
  hermanos). → [spec 02](../specs/02-boton-repetir-historial.md)
