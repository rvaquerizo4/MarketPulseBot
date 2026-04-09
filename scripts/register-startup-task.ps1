param(
  [string]$TaskName = "MarketWatcherTelegramBot"
)

$ErrorActionPreference = "Stop"

$runScript = Join-Path $PSScriptRoot "run-bot.ps1"
$powershellPath = (Get-Command powershell).Source
$userId = "$env:USERDOMAIN\$env:USERNAME"

$action = New-ScheduledTaskAction -Execute $powershellPath -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runScript`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Task '$TaskName' registered successfully."
Write-Host "It will run at Windows sign-in."
