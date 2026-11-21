# ── Servidor SMTP para los avisos de las tareas del SEPA ─────
# Guarda en %LOCALAPPDATA%\el-changuito\mail.xml el servidor y la cuenta con que run-local.ps1 manda el mail de
# cada corrida. Sirve cualquier SMTP con STARTTLS (puerto 587 o 25) o sin cifrado (-NoSsl); el TLS directo del
# puerto 465 no: System.Net.Mail no lo soporta. Antes de guardar manda un mail de prueba; si falla, no guarda nada.
# El archivo queda cifrado con DPAPI: solo lo puede leer este usuario de Windows en esta PC.
#
#   # Gmail (por defecto): contraseña de aplicación de myaccount.google.com/apppasswords, con verificación en 2 pasos
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\sepa\set-mail.ps1
#
#   # Otro servidor: el usuario puede ser distinto del remitente (Brevo, Mailgun, SendGrid usan uno propio)
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\sepa\set-mail.ps1 `
#     -SmtpHost smtp-relay.brevo.com -Port 587 -User <usuario> -From avisos@dominio -To elchanguito.app@gmail.com
#
#   # Servidor sin autenticación (relay de la red local): -NoAuth, y -NoSsl si no tiene STARTTLS
#
# Se corre en una ventana de PowerShell propia: Get-Credential abre el cuadro de usuario y contraseña.
# Se guarda en UTF-8 con BOM: sin BOM, PowerShell 5.1 lo lee como ANSI y rompe los acentos.

param(
  [string]$SmtpHost = 'smtp.gmail.com',
  [int]$Port = 587,
  [string]$To = 'elchanguito.app@gmail.com',
  [string]$From,          # por defecto, el usuario (o el destinatario con -NoAuth)
  [string]$User,          # por defecto, el destinatario
  [switch]$NoSsl,
  [switch]$NoAuth
)

if ($Port -eq 465) {
  Write-Host 'El puerto 465 (TLS directo) no funciona con System.Net.Mail: usá el 587 con STARTTLS.' -ForegroundColor Red
  exit 1
}

$baseDir = Join-Path $env:LOCALAPPDATA 'el-changuito'
New-Item -ItemType Directory -Force $baseDir | Out-Null
$file = Join-Path $baseDir 'mail.xml'

$cred = $null
if (-not $NoAuth) {
  if (-not $User) { $User = $To }
  $cred = Get-Credential -UserName $User -Message "Contraseña de $User en $SmtpHost (en Gmail, la de aplicación)"
  if (-not $cred) { Write-Host 'Cancelado.'; exit 1 }
  if ($SmtpHost -eq 'smtp.gmail.com') {
    # Google muestra la contraseña de aplicación en grupos de 4 con espacios: se guarda sin ellos
    $password = ConvertTo-SecureString ($cred.GetNetworkCredential().Password -replace '\s', '') -AsPlainText -Force
    $cred = New-Object Management.Automation.PSCredential($cred.UserName, $password)
  }
}
if (-not $From) { $From = if ($cred) { $cred.UserName } else { $To } }

$config = [pscustomobject]@{
  Host       = $SmtpHost
  Port       = $Port
  EnableSsl  = -not $NoSsl
  From       = $From
  To         = $To
  Credential = $cred
}

try {
  $smtp = New-Object Net.Mail.SmtpClient($config.Host, $config.Port)
  $smtp.EnableSsl = $config.EnableSsl
  if ($config.Credential) { $smtp.Credentials = $config.Credential.GetNetworkCredential() }
  $msg = New-Object Net.Mail.MailMessage($config.From, $config.To)
  $msg.SubjectEncoding = [Text.Encoding]::UTF8
  $msg.BodyEncoding = [Text.Encoding]::UTF8
  $msg.Subject = '[El Changuito] Prueba de avisos del SEPA'
  $msg.Body = "Los avisos de las tareas programadas del SEPA van a llegar a esta casilla.`r`n" +
    "Servidor: $($config.Host):$($config.Port)`r`nEquipo: $env:COMPUTERNAME"
  $smtp.Send($msg)
} catch {
  $detail = if ($_.Exception.InnerException) { $_.Exception.InnerException.Message } else { $_.Exception.Message }
  Write-Host "No se pudo mandar el mail de prueba: $detail" -ForegroundColor Red
  Write-Host 'No se guardó nada. Revisá el servidor, el puerto y la contraseña, y volvé a correrlo.'
  exit 1
}

$config | Export-Clixml $file
Write-Host "Listo: mail de prueba enviado a $($config.To) por $($config.Host) y configuración guardada en $file" `
  -ForegroundColor Green
