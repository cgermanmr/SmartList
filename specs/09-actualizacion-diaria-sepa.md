# SPEC 09 — Actualización diaria automática de la base SEPA

> **Estado:** Aprobado
> **Depende de:** [SPEC 08](08-base-sepa-supabase.md)
> **Fecha:** 2026-11-04
> **Objetivo:** Ejecutar el ETL de la spec 08 todos los días con GitHub Actions, sin intervención manual, y enterarse cuando falla.

## Por qué existe esta spec

El SEPA publica un archivo nuevo cada día (~13:20 hora argentina) y el portal solo guarda los últimos 7. Si la
carga depende de correr un comando a mano, los precios de referencia quedan viejos. Además, un proyecto gratuito
de Supabase se **pausa tras 7 días sin actividad**: la carga diaria lo mantiene activo.

## Alcance

**Incluye:**

- Workflow `.github/workflows/sepa.yml` con dos ejecuciones programadas por día (15:30 y 21:30 hora argentina) y
  ejecución manual.
- Secret `SUPABASE_DB_URL` en el repositorio.
- Chequeo previo a la descarga: si el portal no publicó nada desde la última carga `ok`, termina sin bajar el ZIP.
- Reintentos de la consulta a CKAN y de la descarga.
- Bloqueo en la base (`pg_try_advisory_lock`) para que dos cargas no corran a la vez, aunque una sea local.
- Regla de "más de 3 días" sin precios nuevos, que hace fallar la ejecución para que llegue el aviso.
- Resumen de cada ejecución en el *job summary* de GitHub, con la duración de cada etapa.
- Aviso por mail cuando falla (notificación estándar de GitHub para workflows programados).

**Fuera de alcance:**

- Historial de precios SEPA (spec futura, con el tamaño medido en la spec 08).
- Cambios en la lógica de lectura, limpieza, agregación y carga de la spec 08. Solo se suman el chequeo previo,
  los reintentos, el bloqueo, la regla de "más de 3 días" y el resumen.
- Migraciones: `sepa_cargas` no cambia.
- Alertas por otros canales (Slack, Telegram).
- Cambios en la app.

## Modelo de datos

Esta spec no agrega tablas ni columnas: usa `sepa_cargas` de la spec 08 tal como está (`fecha_archivo` sigue
siendo `not null`). Lo que cambia es **qué** se registra:

| Caso | ¿Fila en `sepa_cargas`? | Código de salida |
|---|---|---|
| Carga completa | `ok` (como en la spec 08) | 0, salvo regla de 3 días |
| Sin archivo nuevo (chequeo previo) | **No** | 0, salvo regla de 3 días |
| Otra carga en curso (bloqueo tomado) | `omitida`, detalle `otra carga en curso` | 0, salvo regla de 3 días |
| Reglas 1 y 2 de la spec 08 (archivo anterior o ya cargado) | `omitida` (como en la spec 08) | 0, salvo regla de 3 días |
| Freno del 50 %, encabezados inválidos, error de base | `error` (como en la spec 08) | 1 |
| Falla de CKAN o de la descarga tras los reintentos | **No** (no hay `fecha_archivo`) | 1 |
| Más de 3 días sin carga `ok` nueva | No agrega fila propia | 1 |

Bloqueo: `pg_try_advisory_lock(hashtext('sepa_etl'))`, de sesión. La clave sale del texto, no de un número suelto.

## Workflow — `.github/workflows/sepa.yml`

```yaml
name: SEPA

# Carga diaria de los precios de referencia del SEPA en Supabase (specs 08 y 09)
on:
  schedule:
    - cron: '30 18 * * *'   # 15:30 hora argentina; el portal publica ~13:20
    - cron: '30 0 * * *'    # 21:30 hora argentina; cubre atrasos del portal
  workflow_dispatch:
    inputs:
      force:
        description: 'Volver a cargar aunque el archivo ya esté cargado'
        type: boolean
        default: false

concurrency:
  group: sepa
  cancel-in-progress: false

jobs:
  etl:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run sepa:etl -- ${{ inputs.force && '--force' || '' }}
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
```

- **Certificado:** `load.ts` conecta con SSL verificando contra `supabase/prod-ca-2021.crt`. El archivo ya está
  versionado, así que `actions/checkout` lo deja en el runner: no hace falta un secret ni un paso extra. Si falta o
  cambia, la conexión falla con `SELF_SIGNED_CERT_IN_CHAIN`.
- **Cadena de conexión:** la del *Session pooler* (puerto 5432), como en local. La conexión directa es solo IPv6 y
  el runner no la alcanza; el *Transaction pooler* (6543) no sirve para el bloqueo de sesión (ver *Reglas*).
- **Duración en el peor caso:** 7 min de esperas de reintento + descarga + ~2 min de lectura + 3 a 6 min de carga
  (números locales de la spec 08). `timeout-minutes: 30` deja margen.

## Reglas

Orden de una ejecución sin `--dry-run`: conectar → chequeo previo → descarga → lectura → bloqueo → reglas 1 a 3 de
la spec 08 → carga → regla de 3 días → resumen.

- **Chequeo previo (sin archivo nuevo):** antes de descargar, el ETL toma el recurso ZIP de `last_modified` más
  reciente y lo compara con el `inicio` de la última carga `ok`
  (`order by fecha_archivo desc, inicio desc limit 1`). Si `last_modified` **no es posterior**, termina con
  "sin archivo nuevo", sin bajar el ZIP y sin fila en `sepa_cargas`. Si es posterior, sigue, aunque el archivo no
  sea de hoy: así se recupera el de un día en que el cron falló.
  - Se compara contra la carga de mayor `fecha_archivo`, no contra la más reciente: un `--force` de un ZIP viejo
    no tapa el archivo nuevo del día.
  - `last_modified` de CKAN viene en UTC; si no trae zona horaria, se interpreta como UTC (no como hora local).
    `pickLatestZip` usa la misma interpretación.
  - No aplica con `--force`, con `--file` ni con `--dry-run`.
  - Es solo un atajo: no toma el bloqueo. La decisión final la toman las reglas 1 a 3 de la spec 08, que se vuelven
    a evaluar bajo el bloqueo.
- **Reintentos:** la consulta a `package_show` y la descarga del ZIP se intentan hasta 4 veces (1 + 3 reintentos),
  con esperas de 1, 2 y 4 minutos. Un corte a mitad de la descarga reintenta la descarga entera y sobrescribe el
  temporal. Si fallan los 4 intentos, termina con código 1 y **sin fila** en `sepa_cargas`: el aviso es el job
  fallido. Las esperas se pasan como parámetro para que el test no espere de verdad.
- **Una carga a la vez:** el `concurrency` del workflow evita que dos ejecuciones de GitHub se pisen, pero no ve un
  `npm run sepa:etl` local corriendo al mismo tiempo. Por eso `loadSepa` toma
  `pg_try_advisory_lock(hashtext('sepa_etl'))` al empezar, **antes** de las reglas 1 a 3 de la spec 08 (así
  ninguna carga evalúa las reglas mientras otra está escribiendo), y lo suelta con `pg_advisory_unlock` en un
  `finally`, también si falla. Si el bloqueo está tomado, registra la carga como `omitida` con detalle
  "otra carga en curso" y termina con código 0. Si el proceso muere, Postgres suelta el bloqueo al cerrarse la
  conexión. `--dry-run` no se conecta y no lo toma.
- **Ya cargado:** si el archivo ya tiene una carga `ok`, termina como `omitida` con código 0 (regla 2 de la carga
  en la spec 08). Con el chequeo previo casi no ocurre; queda como respaldo.
- **Error:** freno del 50 %, encabezados inválidos o error de base → estado `error` en `sepa_cargas` y código 1
  (como en la spec 08). GitHub avisa por mail.
- **Más de 3 días:** al terminar sin error (carga `ok`, `omitida` o "sin archivo nuevo"), el ETL calcula
  hoy (hora argentina) − la `fecha_archivo` más reciente con carga `ok`. Si es **mayor que 3**, o si no hay ninguna
  carga `ok`, lo informa y termina con código 1 para que llegue el aviso. Aplica también en local; no aplica con
  `--dry-run`.
- **Job summary:** si existe `GITHUB_STEP_SUMMARY`, el ETL escribe una tabla Markdown con: resultado (`ok`,
  `omitida`, `error`, "sin archivo nuevo" o "descarga fallida"), detalle o mensaje de error, fecha del archivo,
  `last_modified` del recurso, banderas cargadas, omitidos con motivo, filas leídas, filas de precios, duración de
  cada etapa (descarga, lectura, carga) y total, y el aviso de "más de 3 días" si corresponde. Se escribe también
  cuando la ejecución falla. Los campos que no llegaron a calcularse se muestran como `—`.

## Plan de implementación

1. **Reintentos.** En `scripts/sepa/etl.ts`, `fetchWithRetry(url, delays)` exportada, usada por `package_show` y
   por la descarga del ZIP. Verificar: test en `etl.test.ts` con un `fetch` simulado que falla dos veces y la
   tercera responde, y otro que falla cuatro veces y propaga el error; las esperas son `[0, 0, 0]`.
2. **Fecha de CKAN.** `parseCkanDate(texto)` exportada (UTC si no trae zona), usada por `pickLatestZip`. Verificar:
   tests con y sin zona; mirar la respuesta real de `package_show` y anotar acá el formato de `last_modified`.
   - *Formato real (04/11/2026):* `2026-11-04T16:19:50.656844` — ISO 8601 **sin zona** y con microsegundos. Los
     siete ZIP diarios tienen `last_modified` entre 16:19 y 16:20, que leídos como UTC son las ~13:20 hora argentina
     de la publicación: confirma que es UTC. `parseCkanDate` trunca los microsegundos a milisegundos.
3. **Chequeo previo.** En `etl.ts`, conectar antes de descargar (salvo `--dry-run`), consultar el `inicio` de la
   última carga `ok` de mayor `fecha_archivo` y decidir con una función pura `hasNewFile(lastModified, inicio)`.
   Verificar: tests de `hasNewFile` (posterior, igual, anterior, sin cargas previas); en local, si el archivo del
   día ya está cargado, `npm run sepa:etl` termina en segundos con "sin archivo nuevo" y sin fila nueva en
   `sepa_cargas`.
4. **Bloqueo.** En `scripts/sepa/load.ts`, `pg_try_advisory_lock(hashtext('sepa_etl'))` al principio de
   `loadSepa` y `pg_advisory_unlock` en un `finally`. Verificar: con una sesión del editor SQL de Supabase (o
   `psql`) sobre el pooler que tenga tomado el bloqueo, `npm run sepa:etl -- --file <zip> --force` termina como
   `omitida` con "otra carga en curso" y sin tocar las tablas; al soltarlo, la misma carga pasa.
5. **Más de 3 días.** Función pura `isStale(fechaArchivo, hoy)` en `etl.ts` y su uso al final de `main`. Verificar:
   tests con 3 días (no falla), 4 días (falla) y sin cargas `ok` (falla).
6. **Job summary.** `scripts/sepa/summary.ts` con `buildSummary(resultado)` pura que arma el Markdown, y su
   escritura desde `main` en un `finally`. Medir la duración de descarga, lectura y carga por separado.
   Verificar: tests en `summary.test.ts` (carga ok, sin archivo nuevo, descarga fallida); en local,
   `GITHUB_STEP_SUMMARY=resumen.md npm run sepa:etl -- --dry-run` genera la tabla.
7. **Secret.** GitHub → *Settings → Secrets and variables → Actions → New repository secret* →
   `SUPABASE_DB_URL` con la cadena del Session pooler.
8. **Workflow.** Crear `.github/workflows/sepa.yml`. Verificar: *Actions → SEPA → Run workflow* termina en verde,
   con el resumen visible. Anotar en esta spec la duración del job y la de cada etapa medidas en el runner.
9. **Ejecución programada.** Verificar al día siguiente: la corrida de las 15:30 cargó el archivo nuevo y la de las
   21:30 terminó con "sin archivo nuevo" sin descargar.
10. **Documentación.** `CLAUDE.md`: *Build y Despliegue* (workflow SEPA, secret, horarios), *Base de precios SEPA*
    (reemplazar "Carga manual por ahora" y sumar el chequeo previo, el bloqueo y la regla de 3 días), árbol con
    `sepa.yml` y `summary.ts`, *Estado Actual*. Feature 06.

## Criterios de aceptación

- [ ] `npm run lint` y `npm test` pasan, con los tests nuevos de reintentos, fecha de CKAN, chequeo previo, regla
      de 3 días y resumen.
- [ ] La ejecución manual termina en verde y muestra el resumen en el *job summary* con la duración de cada etapa.
- [ ] La ejecución programada de las 15:30 corre sola y deja una fila `ok` en `sepa_cargas` con la fecha del día.
- [ ] La de las 21:30 (o una segunda ejecución manual sin `force`) termina en verde con "sin archivo nuevo", sin
      descargar el ZIP y sin fila nueva en `sepa_cargas`.
- [ ] Con `force` activado vuelve a cargar sin duplicar filas.
- [ ] Si se rompe el secret a propósito, la ejecución falla y llega el mail de GitHub; después se restaura.
- [ ] Con otra carga en curso (bloqueo tomado), la ejecución termina como `omitida` con "otra carga en curso" sin
      tocar las tablas.
- [ ] El workflow tarda menos de 15 minutos sin reintentos, **medido en el runner**. En local la lectura tardó
      ~2 min y la carga entre 3 y 6 min (spec 08); el runner tiene otra red y otra latencia hasta el pooler, así
      que el número hay que tomarlo ahí.
- [ ] `ci.yml` no cambia y sigue pasando.

## Decisiones

- **Sí:** GitHub Actions. Ya se usa para el CI, es gratis para este volumen (repo público) y tiene disco y memoria
  de sobra para el archivo de 325 MB.
- **No:** Supabase Edge Functions ni Vercel Cron. Tienen límites de tiempo y memoria pensados para pedidos cortos,
  no para recorrer 14 millones de filas.
- **Sí:** dos corridas, 15:30 y 21:30 hora argentina. La primera deja dos horas de margen sobre la publicación
  habitual; la segunda cubre atrasos del portal y demoras del cron de GitHub. Con el chequeo previo, la segunda
  cuesta ~30 s cuando no hay nada nuevo.
- **No:** una sola corrida a las 15:30. Un atraso del portal dejaba el día sin cargar hasta el siguiente.
- **Sí:** chequeo previo con `last_modified` contra el `inicio` de la última carga `ok`. Evita bajar 325 MB y leer
  2 minutos para nada, y no depende de que la fecha de la carpeta del ZIP coincida con `last_modified`.
- **No:** la regla anterior "si el archivo no es de hoy, omitida". Perdía para siempre el archivo de un día en que
  el cron falló.
- **No:** chequear con la fecha de la carpeta del ZIP. Solo se conoce después de descargar.
- **Sí:** que "sin archivo nuevo" no deje fila en `sepa_cargas`. Con dos corridas por día habría una fila inútil
  diaria; el job summary ya lo muestra. `sepa_cargas` queda para las ejecuciones que leyeron un archivo.
- **Sí:** que una falla de descarga no deje fila en `sepa_cargas`. `fecha_archivo` es `not null` y sin archivo no
  hay fecha; el job fallido y su mail son el registro.
- **No:** migración para hacer `fecha_archivo` nullable, ni registrar con la fecha de hoy. Lo primero complica las
  consultas de las reglas por un caso que ya avisa GitHub; lo segundo mezcla una fecha que no es la del archivo.
- **Sí:** que "sin archivo nuevo" no sea error. Evita mails falsos; el aviso real llega si pasan más de 3 días.
- **Sí:** medir los 3 días contra `fecha_archivo`. Mide lo viejos que están los precios, que es lo que importa.
- **No:** medirlos contra la hora de la última carga. Un `--force` de un ZIP viejo lo reiniciaría.
- **Sí:** `concurrency` sin cancelar. Una ejecución manual nunca corta a la programada a mitad de la transacción.
- **Sí:** bloqueo de sesión con `pg_try_advisory_lock` además del `concurrency`. Es lo único que también frena a una
  carga local; vive en la base, así que lo respetan todas las cargas sin importar desde dónde corran.
- **Sí:** clave `hashtext('sepa_etl')`. Se lee qué bloquea y no hay un número mágico que coordinar.
- **Sí:** que el bloqueo tomado sea `omitida`, no error ni espera. La otra carga ya está haciendo el trabajo; si
  esa falla, avisa ella o, a los 3 días, la regla de "más de 3 días". Esperar el bloqueo alargaría el job sin
  ganar nada.
- **No:** `pg_advisory_xact_lock` (de transacción). Las reglas 1 a 3 se evalúan antes de abrir la transacción, y el
  bloqueo tiene que cubrirlas para que la segunda carga no pase las reglas con datos viejos.
- **No:** tomar el bloqueo en el chequeo previo. Habría que sostenerlo durante la descarga y la lectura; el chequeo
  es solo un atajo y las reglas se vuelven a evaluar bajo el bloqueo.
- **Sí:** certificado versionado en vez de secret. Es público (lo publica Supabase) y `actions/checkout` ya lo trae.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| GitHub desactiva los workflows programados de un repo **público** tras 60 días sin actividad | Mail de aviso de GitHub; reactivar desde *Actions*. Con commits regulares no pasa |
| El mail de falla de un workflow programado le llega a quien modificó por última vez el `cron` | Es el dueño del repo; si cambia, revisar las notificaciones de *Actions* en GitHub |
| El cron se demora o se saltea en horas pico | La segunda corrida de las 21:30 y la regla de "más de 3 días" |
| `last_modified` sin zona horaria interpretado como hora local | `parseCkanDate` lo toma como UTC; el paso 2 verifica el formato real |
| CKAN cambia `last_modified` sin cambiar el contenido | Se descarga de más; la regla 2 de la spec 08 lo termina como `omitida` |
| Supabase pausa el proyecto | La carga diaria lo mantiene activo; si se pausara, la conexión falla y avisa |
| Cambia la URL o el nombre de los recursos en CKAN | El ETL busca por `package_show`, no por URL fija; si no encuentra ZIP, falla y avisa |
| Alguien corre `npm run sepa:etl` local mientras corre el workflow | Bloqueo `pg_try_advisory_lock`: la segunda termina como `omitida` sin tocar las tablas |
| Supabase cambia su certificado | La conexión falla con `SELF_SIGNED_CERT_IN_CHAIN` y avisa; reemplazar `supabase/prod-ca-2021.crt` (*Project Settings → Database → SSL Configuration*) |
| El runner es más lento que la máquina local | Se mide en el paso 8; `timeout-minutes: 30` deja margen y `statement_timeout` de 10 min corta una carga trabada |

## Lo que **no** incluye esta spec

- Historial de precios SEPA.
- Migraciones o columnas nuevas en `sepa_cargas`.
- Alertas fuera de GitHub.
- Cambios en la app.
