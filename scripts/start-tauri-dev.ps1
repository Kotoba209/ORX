$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$logDir = Join-Path $projectRoot "run-logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$allLog = Join-Path $logDir "tauri-dev-$stamp.all.log"
$command = "cd `"$projectRoot`"; .\scripts\tauri-msvc.cmd dev *> `"$allLog`""

$process = Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command) `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -PassThru

[PSCustomObject]@{
  Pid = $process.Id
  Log = $allLog
}
