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

**Fuera de alcance:**

- Historial de precios SEPA (spec futura, con el tamaño medido en la spec 08).
- Cambios en la lógica del ETL, salvo la salida para el *job summary*.
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

## Reglas

- **Archivo del día:** el ETL elige el recurso con `last_modified` más reciente. Si su fecha no es la de hoy
  (hora argentina), registra la carga como `omitida` con motivo "sin archivo nuevo" y termina con código 0: no es
  un error que el portal se atrase.
- **Ya cargado:** si el archivo ya tiene una carga `ok`, termina con código 0 (lo resuelve la regla 1 de la spec 08).
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
3. **Secret.** GitHub → *Settings → Secrets and variables → Actions → New repository secret* →
   `SUPABASE_DB_URL` con la cadena del Session pooler.
4. **Workflow.** Crear `.github/workflows/sepa.yml`. Verificar: *Actions → SEPA → Run workflow* termina en verde,
   con el resumen visible y una fila nueva en `sepa_cargas`.
5. **Ejecución programada.** Verificar al día siguiente que corrió sola y cargó el archivo nuevo.
6. **Documentación.** `CLAUDE.md` (*Build y Despliegue*: workflow SEPA, secret, horario) y feature 06.

## Criterios de aceptación

- [ ] La ejecución manual termina en verde y muestra el resumen en el *job summary*.
- [ ] La ejecución programada corre sola y deja una fila `ok` en `sepa_cargas` con la fecha del día.
- [ ] Una segunda ejecución manual el mismo día termina en verde sin cargar (estado `omitida` o sin cambios).
- [ ] Con `force` activado vuelve a cargar sin duplicar filas.
- [ ] Si se rompe el secret a propósito, la ejecución falla y llega el mail de GitHub; después se restaura.
- [ ] El workflow tarda menos de 15 minutos.
- [ ] `ci.yml` no cambia y sigue pasando.

## Decisiones

- **Sí:** GitHub Actions. Ya se usa para el CI, es gratis para este volumen y tiene disco y memoria de sobra para el archivo de 325 MB.
- **No:** Supabase Edge Functions ni Vercel Cron. Tienen límites de tiempo y memoria pensados para pedidos cortos, no para recorrer 14 millones de filas.
- **Sí:** 15:30 hora argentina. Deja dos horas de margen sobre la publicación habitual; los cron de GitHub pueden demorarse en horas pico.
- **Sí:** que "sin archivo nuevo" no sea error. Evita mails falsos; el aviso real llega si pasan más de 3 días.
- **Sí:** `concurrency` sin cancelar. Una ejecución manual nunca corta a la programada a mitad de la transacción.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| GitHub desactiva los workflows programados de un repo **público** tras 60 días sin actividad | Mail de aviso de GitHub; reactivar desde *Actions*. Con commits regulares no pasa |
| El cron se demora o se saltea en horas pico | La regla de "más de 3 días" avisa si se acumula |
| Supabase pausa el proyecto | La carga diaria lo mantiene activo; si se pausara, la ejecución falla y avisa |
| Cambia la URL o el nombre de los recursos en CKAN | El ETL busca por `package_show`, no por URL fija; si no encuentra ZIP, falla y avisa |

## Lo que **no** incluye esta spec

- Historial de precios SEPA.
- Alertas fuera de GitHub.
- Cambios en la app.
