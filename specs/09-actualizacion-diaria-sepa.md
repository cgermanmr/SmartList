# SPEC 09 — Actualización diaria automática de la base SEPA

> **Estado:** Borrador
> **Depende de:** [SPEC 08](08-base-sepa-supabase.md)
> **Fecha:** 2026-10-31
> **Objetivo:** Ejecutar el ETL de la spec 08 todos los días con GitHub Actions, sin intervención manual, y enterarse cuando falla.

## Por qué existe esta spec

El SEPA publica un archivo nuevo cada día (~13:20 hora argentina) y el portal solo guarda los últimos 7. Si la
carga depende de correr un comando a mano, los precios de referencia quedan viejos. Además, un proyecto gratuito
de Supabase se **pausa tras 7 días sin actividad**: la carga diaria lo mantiene activo.

## Alcance

**Incluye:**

- Workflow `.github/workflows/sepa.yml` con ejecución programada diaria y manual.
- Secret `SUPABASE_DB_URL` en el repositorio.
- Resumen de cada ejecución en el *job summary* de GitHub.
- Aviso por mail cuando falla (notificación estándar de GitHub para workflows programados).
- Bloqueo en la base (`pg_try_advisory_lock`) para que dos cargas no corran a la vez, aunque una sea local.

**Fuera de alcance:**

- Historial de precios SEPA (spec futura, con el tamaño medido en la spec 08).
- Cambios en la lógica del ETL, salvo la salida para el *job summary*, los reintentos de descarga, las reglas de
  "sin archivo nuevo" y "más de 3 días", y el bloqueo.
- Alertas por otros canales (Slack, Telegram).

## Workflow — `.github/workflows/sepa.yml`

```yaml
name: SEPA

# Carga diaria de los precios de referencia del SEPA en Supabase (spec 08)
on:
  schedule:
    - cron: '30 18 * * *'   # 15:30 hora argentina; el portal publica ~13:20
  workflow_dispatch:
    inputs:
      force:
        description: 'Volver a cargar aunque el archivo del día ya esté cargado'
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

## Reglas

- **Archivo del día:** el ETL elige el recurso con `last_modified` más reciente. Si su fecha no es la de hoy
  (hora argentina), registra la carga como `omitida` con motivo "sin archivo nuevo" y termina con código 0: no es
  un error que el portal se atrase.
- **Ya cargado:** si el archivo ya tiene una carga `ok`, termina con código 0 (lo resuelve la regla 2 de la carga
  en la spec 08).
- **Una carga a la vez:** el `concurrency` del workflow evita que dos ejecuciones de GitHub se pisen, pero no ve un
  `npm run sepa:etl` local corriendo al mismo tiempo. Por eso `loadSepa` toma
  `pg_try_advisory_lock(<clave fija>)` al empezar, **antes** de las reglas 1 a 3 de la spec 08 (así ninguna carga
  evalúa las reglas mientras otra está escribiendo), y lo suelta con `pg_advisory_unlock` al final, también si falla.
  Si el bloqueo está tomado, registra la carga como `omitida` con motivo "otra carga en curso" y termina con
  código 0. Si el proceso muere, Postgres suelta el bloqueo al cerrarse la conexión. `--dry-run` no se conecta y
  no lo toma.
- **Error:** freno del 50 %, encabezados inválidos, descarga fallida (después de 3 reintentos con espera de
  1, 2 y 4 minutos) o error de base → estado `error` en `sepa_cargas` y código de salida ≠ 0 (GitHub avisa por mail).
- **Varios días sin archivo nuevo:** si la última carga `ok` tiene más de 3 días, la ejecución termina con
  código ≠ 0 aunque no haya error, para que llegue el aviso.
- **Job summary:** el ETL escribe en `$GITHUB_STEP_SUMMARY` (si existe) una tabla Markdown con fecha del archivo,
  estado, banderas cargadas, omitidos con motivo, filas leídas, filas de precios y duración.

## Plan de implementación

1. **Salida para GitHub.** En `scripts/sepa/etl.ts`, escribir el resumen en `process.env.GITHUB_STEP_SUMMARY`
   si está definida, y aplicar las reglas de "sin archivo nuevo" y "más de 3 días". Verificar: en local, con
   `GITHUB_STEP_SUMMARY=resumen.md npm run sepa:etl -- --dry-run`, se genera la tabla.
2. **Reintentos de descarga.** Verificar: test con un `fetch` simulado que falla dos veces y la tercera responde.
3. **Bloqueo.** En `scripts/sepa/load.ts`, `pg_try_advisory_lock` al principio de `loadSepa` y
   `pg_advisory_unlock` en un `finally`. Verificar: con una sesión de `psql` (o el editor SQL de Supabase sobre el
   pooler) que tenga tomado el bloqueo, `npm run sepa:etl -- --file <zip> --force` termina como `omitida` con
   "otra carga en curso" y sin tocar las tablas; al soltarlo, la misma carga pasa.
4. **Secret.** GitHub → *Settings → Secrets and variables → Actions → New repository secret* →
   `SUPABASE_DB_URL` con la cadena del Session pooler.
5. **Workflow.** Crear `.github/workflows/sepa.yml`. Verificar: *Actions → SEPA → Run workflow* termina en verde,
   con el resumen visible y una fila nueva en `sepa_cargas`. Anotar en esta spec la duración del job y la de cada
   etapa (descarga, lectura, carga) medidas en el runner.
6. **Ejecución programada.** Verificar al día siguiente que corrió sola y cargó el archivo nuevo.
7. **Documentación.** `CLAUDE.md` (*Build y Despliegue*: workflow SEPA, secret, horario) y feature 06.

## Criterios de aceptación

- [ ] La ejecución manual termina en verde y muestra el resumen en el *job summary*.
- [ ] La ejecución programada corre sola y deja una fila `ok` en `sepa_cargas` con la fecha del día.
- [ ] Una segunda ejecución manual el mismo día termina en verde sin cargar (estado `omitida` o sin cambios).
- [ ] Con `force` activado vuelve a cargar sin duplicar filas.
- [ ] Si se rompe el secret a propósito, la ejecución falla y llega el mail de GitHub; después se restaura.
- [ ] Con otra carga en curso (bloqueo tomado), la ejecución termina como `omitida` con "otra carga en curso" sin
      tocar las tablas.
- [ ] El workflow tarda menos de 15 minutos, **medido en el runner**. En local la carga tardó entre 5 y 8 minutos
      (spec 08); el runner tiene otra red y otra latencia hasta el pooler, así que el número hay que tomarlo ahí.
- [ ] `ci.yml` no cambia y sigue pasando.

## Decisiones

- **Sí:** GitHub Actions. Ya se usa para el CI, es gratis para este volumen y tiene disco y memoria de sobra para el archivo de 325 MB.
- **No:** Supabase Edge Functions ni Vercel Cron. Tienen límites de tiempo y memoria pensados para pedidos cortos, no para recorrer 14 millones de filas.
- **Sí:** 15:30 hora argentina. Deja dos horas de margen sobre la publicación habitual; los cron de GitHub pueden demorarse en horas pico.
- **Sí:** que "sin archivo nuevo" no sea error. Evita mails falsos; el aviso real llega si pasan más de 3 días.
- **Sí:** `concurrency` sin cancelar. Una ejecución manual nunca corta a la programada a mitad de la transacción.
- **Sí:** bloqueo de sesión con `pg_try_advisory_lock` además del `concurrency`. Es lo único que también frena a una
  carga local; vive en la base, así que lo respetan todas las cargas sin importar desde dónde corran.
- **Sí:** que el bloqueo tomado sea `omitida`, no error ni espera. La otra carga ya está haciendo el trabajo; si
  esa falla, avisa ella o, a los 3 días, la regla de "más de 3 días". Esperar el bloqueo alargaría el job sin
  ganar nada.
- **No:** `pg_advisory_xact_lock` (de transacción). Las reglas 1 a 3 se evalúan antes de abrir la transacción, y el
  bloqueo tiene que cubrirlas para que la segunda carga no pase las reglas con datos viejos.
- **Sí:** certificado versionado en vez de secret. Es público (lo publica Supabase) y `actions/checkout` ya lo trae.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| GitHub desactiva los workflows programados de un repo **público** tras 60 días sin actividad | Mail de aviso de GitHub; reactivar desde *Actions*. Con commits regulares no pasa |
| El cron se demora o se saltea en horas pico | La regla de "más de 3 días" avisa si se acumula |
| Supabase pausa el proyecto | La carga diaria lo mantiene activo; si se pausara, la ejecución falla y avisa |
| Cambia la URL o el nombre de los recursos en CKAN | El ETL busca por `package_show`, no por URL fija; si no encuentra ZIP, falla y avisa |
| Alguien corre `npm run sepa:etl` local mientras corre el workflow | Bloqueo `pg_try_advisory_lock`: la segunda termina como `omitida` sin tocar las tablas |
| Supabase cambia su certificado | La conexión falla con `SELF_SIGNED_CERT_IN_CHAIN` y avisa; reemplazar `supabase/prod-ca-2021.crt` (*Project Settings → Database → SSL Configuration*) |
| El runner es más lento que la máquina local (5 a 8 min) | Se mide en el paso 5; `timeout-minutes: 30` deja margen y `statement_timeout` de 10 min corta una carga trabada |

## Lo que **no** incluye esta spec

- Historial de precios SEPA.
- Alertas fuera de GitHub.
- Cambios en la app.
