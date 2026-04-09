param(
  [string]$TaskName = "MarketWatcherTelegramBot"
)

$ErrorActionPreference = "Stop"

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Task '$TaskName' removed."
