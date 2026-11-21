# ── Corrida local de los scripts del SEPA ─────
# El portal datos.produccion.gob.ar responde 403 a los runners de GitHub Actions desde el 17/11/2026: la carga
# corre en una PC con IP argentina, con las tareas programadas que registra install-tasks.ps1.
# Corre `npm run <script>` en el repo y guarda la salida en %LOCALAPPDATA%\el-changuito\logs\<script>-AAAA-MM-DD.log
# (sepa-etl-… o sepa-images-…); borra los logs de más de 30 días. Si existe %LOCALAPPDATA%\el-changuito\mail.xml
# (lo crea set-mail.ps1), manda un mail con el resultado de cada corrida, salga bien o mal.
# Devuelve el código de salida del script.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\sepa\run-local.ps1 -Script sepa:etl
#
# Se guarda en UTF-8 con BOM: sin BOM, PowerShell 5.1 lo lee como ANSI y rompe los acentos.

param(
  [ValidateSet('sepa:etl', 'sepa:images')]
  [string]$Script = 'sepa:etl'
)

$repo    = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$baseDir = Join-Path $env:LOCALAPPDATA 'el-changuito'
$logDir  = Join-Path $baseDir 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$name = $Script -replace ':', '-'
$log  = Join-Path $logDir ('{0}-{1:yyyy-MM-dd}.log' -f $name, (Get-Date))
$utf8 = New-Object Text.UTF8Encoding $false

function Write-Log([string]$text) { [IO.File]::AppendAllText($log, "$text`r`n", $utf8) }

# ── Corrida ─────
$inicio = Get-Date
Write-Log ('=== Inicio {0:dd/MM/yyyy HH:mm:ss} · npm run {1} ===' -f $inicio, $Script)
Set-Location $repo
# cmd redirige la salida de npm tal cual (UTF-8), sin los ErrorRecord de PowerShell 5.1 con stderr
cmd /c "npm run $Script >> `"$log`" 2>&1"
$code = $LASTEXITCODE
$fin  = Get-Date
Write-Log ('=== Fin {0:dd/MM/yyyy HH:mm:ss} · código {1} ===' -f $fin, $code)

# ── Resultado ─────
# Solo las líneas de esta corrida: el log del día puede tener otras anteriores
$lines = [IO.File]::ReadAllLines($log, $utf8)
$from  = 0
for ($i = $lines.Count - 1; $i -ge 0; $i--) { if ($lines[$i].StartsWith('=== Inicio')) { $from = $i; break } }
$run = $lines[$from..($lines.Count - 1)]

$tarea  = if ($Script -eq 'sepa:etl') { 'SEPA ETL' } else { 'SEPA imágenes' }
$estado = @($run -match '^Estado:\s')   # ok / omitida / error del ETL
if ($code -ne 0) {
  $resultado = 'FALLÓ'
} elseif (@($run -match '^Sin archivo nuevo').Count -gt 0) {
  $resultado = 'sin archivo nuevo'
} elseif ($estado.Count -gt 0) {
  $resultado = ($estado[-1] -replace '^Estado:\s+', '').Trim()
} else {
  $resultado = 'ok'
}

# ── Aviso por mail ─────
$mailConfig = Join-Path $baseDir 'mail.xml'
if (Test-Path $mailConfig) {
  try {
    $cred = Import-Clixml $mailConfig   # PSCredential cifrado con DPAPI: solo lo lee este usuario en esta PC
    $msg = New-Object Net.Mail.MailMessage
    $msg.From = $cred.UserName
    $msg.To.Add($cred.UserName)
    $msg.SubjectEncoding = [Text.Encoding]::UTF8
    $msg.BodyEncoding = [Text.Encoding]::UTF8
    $msg.Subject = '[El Changuito] {0}: {1} · {2:dd/MM/yyyy HH:mm}' -f $tarea, $resultado, $inicio
    $duracion = [math]::Round(($fin - $inicio).TotalMinutes, 1).ToString([Globalization.CultureInfo]'es-AR')
    $msg.Body = "Resultado: $resultado (código $code) · $duracion min`r`nEquipo: $env:COMPUTERNAME`r`nLog: $log`r`n`r`n" +
      ($run -join "`r`n")
    $smtp = New-Object Net.Mail.SmtpClient('smtp.gmail.com', 587)
    $smtp.EnableSsl = $true
    $smtp.Credentials = $cred.GetNetworkCredential()
    $smtp.Send($msg)
    Write-Log "Mail enviado a $($cred.UserName)"
  } catch {
    Write-Log "No se pudo mandar el mail: $($_.Exception.Message)"
  }
} else {
  Write-Log "Sin aviso por mail: falta $mailConfig (crearlo con scripts\sepa\set-mail.ps1)"
}

Get-ChildItem $logDir -Filter "$name-*.log" |
  Where-Object LastWriteTime -lt (Get-Date).AddDays(-30) |
  Remove-Item -ErrorAction SilentlyContinue

exit $code
