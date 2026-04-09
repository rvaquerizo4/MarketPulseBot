$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $projectRoot "logs"
$logFile = Join-Path $logDir "bot.log"

if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

Set-Location $projectRoot

# Keeps the process alive inside the scheduled task and logs output.
node ".\src\index.js" *>> $logFile
