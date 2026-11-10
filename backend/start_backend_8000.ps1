$Local = $false
if ($args -contains "-Local" -or $args -contains "-local") {
    $Local = $true
}

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = $scriptDir
$venvPython = Join-Path $projectDir "venv\Scripts\python.exe"
$pythonExe = if (Test-Path $venvPython) { $venvPython } else { "python" }
$logDir = Join-Path $projectDir "logs"
$stdoutLog = Join-Path $logDir "backend-8000.out.log"
$stderrLog = Join-Path $logDir "backend-8000.err.log"

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

function Test-BackendPort {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        return ($client.ConnectAsync('127.0.0.1', 8000).Wait(500) -and $client.Connected)
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

if (Test-BackendPort) {
    Write-Output "Backend is already listening on 127.0.0.1:8000."
    exit 0
}

if ($Local) {
    $env:DJANGO_ENV = "local"
} else {
    Remove-Item Env:DJANGO_ENV -ErrorAction SilentlyContinue
}

$arguments = @(
    "manage.py"
    "runserver"
    "127.0.0.1:8000"
    "--noreload"
)

$process = Start-Process `
    -FilePath $pythonExe `
    -WindowStyle Hidden `
    -ArgumentList $arguments `
    -WorkingDirectory $projectDir `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -PassThru

for ($attempt = 0; $attempt -lt 20; $attempt++) {
    $listening = Test-BackendPort
    if ($listening) { break }
    if ($process.HasExited) { break }
    Start-Sleep -Milliseconds 500
}

if (-not $listening) {
    Write-Error "Backend failed to start. Check $stderrLog and $stdoutLog."
}

Write-Output "Backend started on 127.0.0.1:8000 with PID $($process.Id)."
if ($Local) {
    Write-Output "Backend environment: local (.env.local / optional .env.login.local)."
} else {
    Write-Output "Backend environment: default (.env / .env.login)."
}
