$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = $scriptDir
$logDir = Join-Path $projectDir "logs"
$stdoutLog = Join-Path $logDir "backend-8000.out.log"
$stderrLog = Join-Path $logDir "backend-8000.err.log"

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

$existingConnection = Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existingConnection) {
    $existingProcess = Get-Process -Id $existingConnection.OwningProcess -ErrorAction SilentlyContinue
    if ($existingProcess) {
        Write-Output "Backend is already listening on 127.0.0.1:8000 with PID $($existingProcess.Id)."
        exit 0
    }
}

$arguments = @(
    "manage.py"
    "runserver"
    "127.0.0.1:8000"
    "--noreload"
)

$process = Start-Process `
    -FilePath "python" `
    -ArgumentList $arguments `
    -WorkingDirectory $projectDir `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -PassThru

Start-Sleep -Seconds 3

$listeningConnection = Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listeningConnection) {
    Write-Error "Backend failed to start. Check $stderrLog and $stdoutLog."
}

Write-Output "Backend started on 127.0.0.1:8000 with PID $($process.Id)."
