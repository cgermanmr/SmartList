# 06 — Precios de referencia de Precios Claros (SEPA)

- **Estado:** Analizado
- **Fase:** 1–2 (ETL propio + Supabase de solo lectura; los datos propios siguen en localStorage)

> Relevamiento hecho el 31/10/2026 descargando el ZIP del día y probando la API del portal. Los números de
> abajo son de ese día; conviene volver a medirlos antes de implementar.

## Problema

Los precios de la app son solo los que carga la familia. Para saber si un precio es caro o barato hace falta
una **referencia externa**: cuánto sale el mismo producto hoy en las grandes cadenas. Esa referencia existe y
es pública: el **SEPA** (Sistema Electrónico de Publicidad de Precios Argentinos), que alimenta
[preciosclaros.gob.ar](https://www.preciosclaros.gob.ar). Las cadenas están obligadas a informar ahí sus
precios.

## Qué existe hoy

- `Product` no tiene código de barras (EAN), y el SEPA identifica todo por EAN: no hay forma de cruzar datos.
- `Product` tampoco tiene presentación (tamaño + unidad); el SEPA sí la trae.
- No hay backend (Fase 1): todo vive en `localStorage`.

## Fuentes disponibles

### A. Datos abiertos oficiales (ZIP diario) — la fuente confiable

Dataset [Precios Claros - Base SEPA](https://datos.produccion.gob.ar/dataset/sepa-precios) en el portal CKAN de
la Secretaría de Comercio.

| Aspecto | Detalle |
|---|---|
| Frecuencia | **Diaria** (no semanal). Hay 7 recursos fijos, uno por día de la semana (`sepa_lunes.zip` … `sepa_domingo.zip`), que se **sobrescriben**: solo están los últimos 7 días, sin historial |
| URL | `https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource/{resource_id}/download/sepa_{dia}.zip`; los `resource_id` son estables |
| Metadatos | API CKAN: `https://datos.produccion.gob.ar/api/3/action/package_show?id=sepa-precios` (lista recursos, tamaño y `last_modified`). Sin `datastore`: no se puede consultar por API, solo bajar el archivo |
| Publicación | ~16:20 UTC (13:20 hora argentina) |
| Tamaño | ~310–330 MB comprimido por día |
| Licencia | **CC-BY-4.0**: se puede usar y redistribuir citando la fuente |
| Contacto | soportesepa@comercio.gob.ar |

**Estructura** (ZIP anidado):

```
sepa_viernes.zip
└── 2026-10-30/
    ├── sepa_1_comercio-sepa-15_2026-10-30_09-05-10.zip   ← un ZIP por comercio
    │   ├── comercio.csv     (razón social, banderas)
    │   ├── sucursales.csv   (dirección, lat/lng, barrio, localidad, provincia, horarios)
    │   └── productos.csv    (un precio por producto y sucursal)
    └── ...
```

- CSV separado por `|`, UTF-8 (a veces con BOM), con una **última línea de pie** `Última actualización: <fecha>`
  que hay que descartar.
- Columnas de `productos.csv`: `id_comercio`, `id_bandera`, `id_sucursal`, `id_producto` (EAN de 13 dígitos),
  `productos_ean` (1/0), `productos_descripcion`, `productos_cantidad_presentacion`,
  `productos_unidad_medida_presentacion`, `productos_marca`, `productos_precio_lista`,
  `productos_precio_referencia`, `productos_cantidad_referencia`, `productos_unidad_medida_referencia`,
  `productos_precio_unitario_promo1`, `productos_leyenda_promo1`, `productos_precio_unitario_promo2`,
  `productos_leyenda_promo2`.
- La sucursal se identifica con la terna `id_comercio` + `id_bandera` + `id_sucursal`. La provincia viene como
  código ISO (`AR-C`, `AR-B`, …); el dataset trae un Excel para traducirlo.

**Volumen del 30/10/2026:**

| Medida | Valor |
|---|---|
| Comercios | 14 ZIP (Coto, DIA, Carrefour/Maxi/Express, Disco/Jumbo/Vea, Changomás, La Anónima, Cooperativa Obrera, Toledo, Comodín, California, Axion, …) |
| Sucursales | 2.626 (961 en CABA, 889 en provincia de Buenos Aires) |
| Filas de precios | 14,3 millones |
| EAN distintos | 78.006 (5.930 aparecen en 5 o más cadenas) |
| Pares EAN × bandera | 243.734 |
| Ternas EAN × bandera × provincia | 2,04 millones |
| Índice EAN + descripción | ~3,5 MB sin comprimir |

**Problemas de calidad encontrados:**

- Un ZIP interno vacío (0 bytes, `comercio-sepa-36`): hay que tolerar archivos rotos sin cortar la carga.
- Comercios desactualizados: Unicoop informa precios del 11/06/2025. Hay que filtrar por la fecha de
  `comercio_ultima_actualizacion` / el pie del archivo.
- Caracteres ya rotos en origen (`Ciudad Aut�noma de Buenos Aires` en las sucursales de Carrefour).
- Texto con relleno de espacios y números con ceros adelante (`04210.00`, `00250`).
- Unidades sin normalizar: `KG`, `KGM`, `KGR`, `KG.`, `GRM`, `GR.`, `gr`, `LT`, `LTR`, `L`, `LT.`, `ML.`,
  `CM3`, `UNI`, `UD`, `EA`, … Hay que mapearlas a `g` / `ml` / `u` (las mismas de la calculadora).
- Solo informan las **grandes cadenas**: no hay almacenes, verdulerías ni mayoristas chicos de barrio.

### B. API interna del portal preciosclaros.gob.ar — rápida pero frágil

El sitio consulta una API en `https://d3e6htiiul5ek9.cloudfront.net/prod/` (AWS API Gateway + Lambda + Postgres):

| Endpoint | Parámetros | Devuelve |
|---|---|---|
| `/sucursales` | `lat`, `lng`, `limit` | Sucursales cercanas |
| `/productos` | `string` (texto), `array_sucursales` (`10-1-1,2-1-014`), `offset`, `limit`, `sort` | Búsqueda de productos con precio en esas sucursales |
| `/producto` | `id_producto` (EAN), `array_sucursales` | Precio de un producto en cada sucursal |

- Responde con `Access-Control-Allow-Origin: *`: se podría llamar **directo desde el navegador**, sin backend.
- **No está documentada ni es oficial**: puede cambiar o cerrarse sin aviso.
- El 31/10/2026 **todas las llamadas fallaron** (`remaining connection slots are reserved…`: el Postgres sin
  conexiones libres, y un `UnboundLocalError` en `/productos`). No se puede depender de ella.

### C. Proyectos de terceros — referencia, no dependencia

- [OpenDataCordoba/precios_claros](https://github.com/OpenDataCordoba/precios_claros): scraper (Scrapy) de la API
  del portal; útil para entender los endpoints, hereda su fragilidad.
- ETL de ejemplo sobre el ZIP oficial:
  [Nicaleluc/precios-supermercados-etl](https://github.com/Nicaleluc/precios-supermercados-etl),
  [AlexisRobledoo/comparador-precios](https://github.com/AlexisRobledoo/comparador-precios) (filtra Gran Rosario a
  SQLite), [LMANMAI/PP-ofertar#14](https://github.com/LMANMAI/PP-ofertar/pull/14) (bug del BOM en `comercio.csv`).
- Servidores MCP / APIs comunitarias con SEPA (p. ej. `abenassi/argentina-data-mcp`): sin garantía de
  disponibilidad; no sirven como base de un feature.

### Comparación

| | A. ZIP oficial | B. API del portal | C. Terceros |
|---|---|---|---|
| Oficial / estable | Sí | No | No |
| Necesita backend o ETL | Sí (300 MB/día) | No (CORS abierto) | Depende |
| Cercanía (sucursal) | Sí, con lat/lng | Sí | Depende |
| Historial | No (7 días); hay que archivarlo | No | Algunos |
| Riesgo | Calidad de datos | Caídas, cambios sin aviso | Abandono |

## Specs

Decidido el 31/10/2026: ZIP oficial → ETL propio → **Supabase**, resumido por **EAN × bandera** a nivel nacional.

| Spec | Qué hace |
|---|---|
| [08 — Base SEPA en Supabase](../../specs/08-base-sepa-supabase.md) | Tablas, limpieza, agregación y carga (manual) |
| [09 — Actualización diaria](../../specs/09-actualizacion-diaria-sepa.md) | GitHub Actions todos los días a las 15:30 |
| [10 — Productos con código de barras](../../specs/10-productos-con-codigo-de-barras.md) | EAN, marca y presentación en `Product`; buscador del catálogo SEPA |
| [11 — Lector de códigos de barras](../../specs/11-lector-codigo-de-barras.md) | Cámara desde la web (API nativa + ponyfill ZXing) |
| [12 — Precio de referencia](../../specs/12-precio-de-referencia-sepa.md) | Referencia por cadena en el detalle y el carrito |

Pendiente para una spec futura: historial semanal de precios SEPA (decidir con el tamaño medido en la spec 08).

## Recomendación

**Usar el ZIP oficial con un ETL propio** y no depender de la API del portal salvo para un prototipo.

1. **ETL en GitHub Actions** (cron diario después de las 14:00 hora argentina): bajar el ZIP del día, descartar
   ZIP rotos y comercios desactualizados, normalizar unidades y **agregar por EAN × bandera** (mínimo, mediana y
   máximo de `productos_precio_lista`, cantidad de sucursales, presentación normalizada). Son ~244 mil filas en
   lugar de 14 millones.
2. **Publicar el resultado** sin pasar por el repo (los datos diarios lo inflarían):
   - Fase 1: archivos JSON estáticos repartidos por prefijo de EAN (o un índice de búsqueda aparte, ~3,5 MB sin
     comprimir) en un almacenamiento con CDN (Vercel Blob, Supabase Storage o un asset de GitHub Release).
     La app los pide solo cuando los necesita.
   - Fase 2: tabla en Supabase. Guardar todos los días el detalle por sucursal no entra en el plan gratuito
     (500 MB); sí entra el agregado vigente más una foto **semanal** (o solo de los EAN que los usuarios tengan
     vinculados).
3. **Archivar** un snapshot semanal agregado: el portal no guarda historial y es lo que habilitaría comparar la
   inflación propia contra la de las cadenas ([SPEC 04](../../specs/04-inflacion-personal.md)).

## Alcance MVP

- **EAN opcional en `Product`**: cargarlo a mano o elegirlo de una búsqueda en el catálogo SEPA ("Agregar
  producto" con autocompletar por descripción). Al elegirlo se completan nombre, marca y presentación.
- **Detalle de producto** (si tiene EAN): bloque "Precio de referencia" con mínimo, mediana y máximo en las
  cadenas, la cadena más barata y la fecha del dato. Marcar si el último precio propio está por encima o por
  debajo de la mediana.
- **Carrito**: badge opcional contra la mediana SEPA, además del de la última compra.
- Atribución visible: "Fuente: SEPA — Secretaría de Comercio (CC-BY-4.0)".

## Evolución futura

- Elegir sucursales cercanas (geolocalización o barrio) y comparar contra esas en vez del promedio nacional.
- Escanear el código de barras: `BarcodeDetector` en Chrome Android desde la web; cámara nativa en Fase 3.
- Comparar la canasta de una compra entera contra cada cadena ("en Coto te salía $X").
- Usar las promos (`promo1` / `promo2` y sus leyendas) en la calculadora de precio unitario.

## Modelo de datos propuesto

```typescript
interface Product {
  // ...
  ean?: string;           // 13 dígitos; vincula con SEPA
  brand?: string;
  size?: number;          // presentación, p. ej. 500
  sizeUnit?: Unit;        // 'g' | 'ml' | 'u' (mismo tipo que la calculadora)
}

interface ReferencePrice {  // salida del ETL, no se guarda en localStorage salvo como caché
  ean: string;
  bandera: string;        // "Coto", "Carrefour Market", ...
  min: number;
  median: number;
  max: number;
  branches: number;       // sucursales que lo informan
  date: string;           // ISO, fecha del archivo SEPA
}
```

- Caché opcional en `preciolocal_sepa_cache` (por EAN, con fecha) para no repetir pedidos.
- El campo `size` + `sizeUnit` resuelve también el prerrequisito transversal **Presentación del producto**.

## UI/UX

- Lo propio y lo de referencia separados visualmente: el precio SEPA es contexto, no se mezcla con el
  historial ni con las estadísticas propias (`getPriceStats`).
- Si no hay dato (producto sin EAN, EAN no informado, archivo del día caído) no mostrar nada en lugar de un error.

## Dependencias

- **Presentación del producto** (prerrequisito transversal) — se resuelve acá mismo.
- Almacenamiento con CDN para la salida del ETL (Fase 1) o Supabase (Fase 2).
- [02 — Comparación por comercio](02-comparacion-por-comercio.md): comparte el concepto de comercio/cadena.

## Preguntas abiertas

- ¿Referencia nacional, por provincia o por sucursales cercanas? Cambia el tamaño de la salida del ETL
  (244 mil filas por bandera vs 2 millones por bandera × provincia).
- ¿Dónde se publica la salida en Fase 1 (Vercel Blob, Supabase Storage, GitHub Release)?
- ¿Cómo se vinculan los productos ya cargados (texto libre) con un EAN: a mano, o sugiriendo coincidencias por
  descripción?
- ¿Qué precio mostrar: `precio_lista` o el de la promo cuando existe?
