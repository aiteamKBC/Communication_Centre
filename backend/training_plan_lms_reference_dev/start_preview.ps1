$ErrorActionPreference = 'Stop'
$backendDir = Split-Path -Parent $PSScriptRoot
$privateDir = Join-Path $PSScriptRoot 'private'
$pythonExe = Join-Path $backendDir 'venv\Scripts\python.exe'

function Test-PreviewPort([int] $Port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connecting = $client.ConnectAsync('127.0.0.1', $Port)
        return ($connecting.Wait(500) -and $client.Connected)
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Wait-PreviewPort([int] $Port, $Process) {
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if (Test-PreviewPort $Port) { return }
        if ($Process.HasExited) {
            throw "Preview process for port $Port exited. Check logs in $privateDir."
        }
        Start-Sleep -Milliseconds 250
    }
    throw "Preview port $Port did not become available. Check logs in $privateDir."
}

if (-not (Test-Path (Join-Path $privateDir 'isolation.json'))) {
    throw 'The isolated preview has not been prepared. Restore its local copies before starting it.'
}
if (-not (Test-Path $pythonExe)) {
    throw 'The backend virtual environment is missing.'
}
$nodeExe = (Get-Command node -ErrorAction Stop).Source

Push-Location $backendDir
try {
    if (-not (Test-PreviewPort 55432)) {
        $pgCtl = Join-Path $PSScriptRoot 'pgsql\bin\pg_ctl.exe'
        $pgProcess = Start-Process -FilePath $pgCtl -WorkingDirectory $backendDir -WindowStyle Hidden `
            -ArgumentList @('start', '-D', 'training_plan_lms_reference_dev/private/pgdata',
                '-l', 'training_plan_lms_reference_dev/private/postgres.log', '-w', '-t', '15') `
            -RedirectStandardOutput (Join-Path $privateDir 'pg-start.out.log') `
            -RedirectStandardError (Join-Path $privateDir 'pg-start.err.log') -PassThru
        # Wait for pg_ctl itself; Start-Process -Wait also waits for the server tree.
        if (-not $pgProcess.WaitForExit(20000) -or $pgProcess.ExitCode -ne 0) {
            throw "Preview PostgreSQL could not start. Check pg-start logs in $privateDir."
        }
    }
    & $pythonExe -m training_plan_lms_reference_dev.verify
    if ($LASTEXITCODE -ne 0) { throw 'Preview database isolation verification failed.' }

    if (-not (Test-PreviewPort 8101)) {
        $backendProcess = Start-Process -FilePath $pythonExe -WorkingDirectory $backendDir -WindowStyle Hidden `
            -ArgumentList @('manage.py', 'runserver', '127.0.0.1:8101', '--noreload',
                '--settings=training_plan_lms_reference_dev.settings') `
            -RedirectStandardOutput (Join-Path $privateDir 'backend.out.log') `
            -RedirectStandardError (Join-Path $privateDir 'backend.err.log') -PassThru
        Wait-PreviewPort 8101 $backendProcess
    }
    & $pythonExe -m training_plan_lms_reference_dev.verify --api
    if ($LASTEXITCODE -ne 0) { throw 'The running backend did not pass preview verification.' }

    if (-not (Test-PreviewPort 3100)) {
        $frontendProcess = Start-Process -FilePath $nodeExe -WorkingDirectory $backendDir -WindowStyle Hidden `
            -ArgumentList @('training_plan_lms_reference_dev/frontend.mjs') `
            -RedirectStandardOutput (Join-Path $privateDir 'frontend.out.log') `
            -RedirectStandardError (Join-Path $privateDir 'frontend.err.log') -PassThru
        Wait-PreviewPort 3100 $frontendProcess
    }
    Write-Output 'Isolated preview: http://127.0.0.1:3100/training-plan'
    Write-Output "Preview login credentials: $(Join-Path $privateDir 'preview-access.json')"
} finally {
    Pop-Location
}
