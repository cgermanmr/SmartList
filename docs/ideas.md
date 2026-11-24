# Bandeja de ideas

Ideas sin analizar. Cuando una se define mejor, se crea su archivo en [`features/`](features/) y se agrega a
la tabla del [índice](README.md). Las ideas chicas pueden pasar directo a una spec en [`specs/`](../specs/): se
enlazan acá con `→ spec NN` y se borran de la bandeja cuando la spec se implementa.

## Análisis de gastos

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

- **Comunidad abierta:** precios públicos para todos los usuarios, no solo para un grupo, después de la validación.
  Se construye sobre las specs 22 y 23 (hechas: grupos y validación dentro del grupo). Requiere:
  - tabla pública aparte de `user_records`, solo con precios que tengan EAN y un comercio identificable;
  - validación por usuarios cercanos al comercio (alguien de otra ciudad no puede confirmar un precio);
  - controles contra el abuso: límite por día, nadie valida lo propio, reputación simple y vencimiento del precio
    validado;
  - autor oculto o con alias, y texto nuevo en `/privacidad`;
  - en la UI, una tercera fuente junto al SEPA: "Informado por vecinos · validado · hace 2 días".

  Contexto en [08 — Consulta y aportes](features/08-consulta-y-aportes.md).
- Cupones y promociones (ver [04 — Promociones](features/04-promociones-comercios.md))
- Recomendaciones personalizadas
- Billeteras digitales / pagos integrados
- Chat con comerciantes

## Calidad y deuda técnica

- (vacío por ahora)
