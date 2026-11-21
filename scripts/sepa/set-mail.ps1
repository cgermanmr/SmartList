# ── Cuenta de Gmail para los avisos de las tareas del SEPA ─────
# Guarda en %LOCALAPPDATA%\el-changuito\mail.xml la cuenta que manda (y recibe) el mail de cada corrida de
# run-local.ps1. La contraseña es una "contraseña de aplicación" de Google (myaccount.google.com/apppasswords,
# requiere la verificación en dos pasos), no la de la cuenta. El archivo queda cifrado con DPAPI: solo lo puede
# leer este usuario de Windows en esta PC. Para probarlo, manda un mail de prueba.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\sepa\set-mail.ps1
#
# Se corre en una ventana de PowerShell propia: Get-Credential abre el cuadro de usuario y contraseña.
# Se guarda en UTF-8 con BOM: sin BOM, PowerShell 5.1 lo lee como ANSI y rompe los acentos.

param([string]$Address = 'elchanguito.app@gmail.com')

$baseDir = Join-Path $env:LOCALAPPDATA 'el-changuito'
New-Item -ItemType Directory -Force $baseDir | Out-Null
$file = Join-Path $baseDir 'mail.xml'

$cred = Get-Credential -UserName $Address -Message 'Contraseña de aplicación de Google (16 letras, sin espacios)'
if (-not $cred) { Write-Host 'Cancelado.'; exit 1 }
# Google muestra la contraseña de aplicación en grupos de 4 con espacios: se guardan sin ellos
$password = ConvertTo-SecureString ($cred.GetNetworkCredential().Password -replace '\s', '') -AsPlainText -Force
$cred = New-Object Management.Automation.PSCredential($cred.UserName, $password)

try {
  $smtp = New-Object Net.Mail.SmtpClient('smtp.gmail.com', 587)
  $smtp.EnableSsl = $true
  $smtp.Credentials = $cred.GetNetworkCredential()
  $msg = New-Object Net.Mail.MailMessage($cred.UserName, $cred.UserName)
  $msg.SubjectEncoding = [Text.Encoding]::UTF8
  $msg.BodyEncoding = [Text.Encoding]::UTF8
  $msg.Subject = '[El Changuito] Prueba de avisos del SEPA'
  $msg.Body = "Los avisos de las tareas programadas del SEPA van a llegar a esta casilla.`r`nEquipo: $env:COMPUTERNAME"
  $smtp.Send($msg)
} catch {
  Write-Host "No se pudo mandar el mail de prueba: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'No se guardó nada. Revisá que sea una contraseña de aplicación y volvé a correrlo.'
  exit 1
}

$cred | Export-Clixml $file
Write-Host "Listo: mail de prueba enviado a $($cred.UserName) y cuenta guardada en $file" -ForegroundColor Green
