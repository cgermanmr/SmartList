# ── Tareas programadas de Windows para el SEPA ─────
# Registra (o actualiza) las dos tareas del usuario actual, que corren run-local.ps1 desde este repo:
#   - "El Changuito - SEPA ETL":      todos los días a las 04:00, npm run sepa:etl (habilitada)
#   - "El Changuito - SEPA imagenes": domingos a las 06:00, npm run sepa:images (deshabilitada salvo -EnableImages;
#     se habilita si el workflow "SEPA imagenes" de GitHub Actions también recibe 403)
# Si la PC está suspendida la despiertan; si estaba apagada, corren apenas se prende. Necesitan la sesión iniciada.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\sepa\install-tasks.ps1 [-EnableImages]

param([switch]$EnableImages)

$runner = (Resolve-Path (Join-Path $PSScriptRoot 'run-local.ps1')).Path
$repo   = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Register-SepaTask([string]$name, [string]$script, $trigger, [bool]$enabled) {
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $repo -Argument (
    "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`" -Script $script")
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Force `
    -Description "El Changuito: npm run $script en $repo. Logs en %LOCALAPPDATA%\el-changuito\logs" | Out-Null
  if ($enabled) { Enable-ScheduledTask -TaskName $name | Out-Null } else { Disable-ScheduledTask -TaskName $name | Out-Null }
}

Register-SepaTask 'El Changuito - SEPA ETL' 'sepa:etl' (New-ScheduledTaskTrigger -Daily -At '04:00') $true
Register-SepaTask 'El Changuito - SEPA imagenes' 'sepa:images' `
  (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At '06:00') $EnableImages.IsPresent

Get-ScheduledTask -TaskName 'El Changuito - SEPA*' |
  Select-Object TaskName, State, @{ n = 'NextRunTime'; e = { ($_ | Get-ScheduledTaskInfo).NextRunTime } }
