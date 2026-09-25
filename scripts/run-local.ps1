param(
    [ValidateRange(1024, 65535)][int]$BackendPort = 8000,
    [ValidateRange(1024, 65535)][int]$FrontendPort = 5173,
    [switch]$NoBrowser,
    [switch]$Lan,
    [switch]$Check
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# Some Windows launchers inherit both Path and PATH. Normalize only this process
# before Start-Process builds its case-insensitive environment dictionary.
$inheritedPath = [Environment]::GetEnvironmentVariable('Path', 'Process')
foreach ($pathKey in @('Path', 'PATH', 'Path', 'PATH')) {
    [Environment]::SetEnvironmentVariable($pathKey, $null, 'Process')
}
[Environment]::SetEnvironmentVariable('Path', $inheritedPath, 'Process')
$projectRoot = Split-Path -Parent $PSScriptRoot
$frontendRoot = Join-Path $projectRoot 'frontend'
$logDirectory = Join-Path $projectRoot '.runtime'
$ownedProcesses = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()
$backendUrl = "http://127.0.0.1:$BackendPort"
$frontendUrl = "http://127.0.0.1:$FrontendPort"

function Get-LocalResponse([string]$Url) {
    try { return Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2 } catch { return $null }
}

function Assert-FreePort([int]$Port) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    try { $listener.Start() } catch { throw "Cong $Port dang duoc ung dung khac su dung. Hay dong ung dung do va chay lai run.bat." }
    finally { $listener.Stop() }
}

function Wait-Ready([string]$Url, [System.Diagnostics.Process]$Process, [string]$LogPath) {
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    do {
        if ($Process.HasExited) { throw "May chu dung som. Xem $LogPath" }
        $response = Get-LocalResponse $Url
        if ($response -and $response.StatusCode -eq 200) { return }
        Start-Sleep -Milliseconds 350
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "May chu chua san sang sau 60 giay. Xem $LogPath"
}

try {
    Set-Location -LiteralPath $projectRoot
    if ($BackendPort -eq $FrontendPort) { throw 'Backend va frontend phai dung hai cong khac nhau.' }
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    Write-Host 'QuantumShield FinEdu - dang kiem tra moi truong...'

    $existingBackend = Get-LocalResponse "$backendUrl/v1/health"
    if ($existingBackend -and ($existingBackend.Content | ConvertFrom-Json).policy_weights -eq 'policy.pth') {
        Write-Host "Dung backend dang chay: $backendUrl"
    } else {
        Assert-FreePort $BackendPort
        $pythonPath = @('.venv-release\Scripts\python.exe', '.venv\Scripts\python.exe') |
            ForEach-Object { Join-Path $projectRoot $_ } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
        if (-not $pythonPath) { throw 'Chua co moi truong Python. Xem README.md de cai backend/requirements.txt vao .venv.' }
        & $pythonPath -c 'import fastapi, uvicorn, torch, numpy, cryptography'
        if ($LASTEXITCODE -ne 0) { throw "Thieu thu vien Python. Chay: `"$pythonPath`" -m pip install -r backend/requirements.txt" }
        $env:FORCE_CPU = '1'
        $env:GRADIO_ANALYTICS_ENABLED = 'False'
        $backendLog = Join-Path $logDirectory "backend-$BackendPort.err.log"
        $backendProcess = Start-Process -FilePath $pythonPath -ArgumentList @('-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', "$BackendPort", '--workers', '1') `
            -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $logDirectory "backend-$BackendPort.out.log") -RedirectStandardError $backendLog
        $ownedProcesses.Add($backendProcess)
        Wait-Ready "$backendUrl/v1/health" $backendProcess $backendLog
    }

    $existingFrontend = Get-LocalResponse $frontendUrl
    if ($Lan -and $existingFrontend) {
        throw "Cong $FrontendPort da co web dang chay. Hay dung cua so run-lan.bat cu truoc khi mo lai de dam bao ban demo moi nhat."
    }
    if ($existingFrontend -and $existingFrontend.Content -match 'QuantumShield FinEdu') {
        Write-Host "Dung web dang chay: $frontendUrl"
    } else {
        Assert-FreePort $FrontendPort
        $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
        if (-not $nodeCommand) { throw 'Chua co Node.js. Cai Node.js 24 LTS, sau do mo lai run.bat.' }
        $vitePath = Join-Path $frontendRoot 'node_modules\vite\bin\vite.js'
        if (-not (Test-Path -LiteralPath $vitePath)) { throw 'Thieu thu vien frontend. Mo terminal trong frontend va chay npm ci, sau do mo lai run.bat.' }
        $env:VITE_API_URL = '/api'
        $env:QKD_API_TARGET = $backendUrl
        $frontendHost = '127.0.0.1'
        $viteArguments = @("`"$vitePath`"")
        if ($Lan) {
            $frontendHost = '0.0.0.0'
            Write-Host 'Dang build ban demo LAN...'
            Push-Location -LiteralPath $frontendRoot
            try {
                & $nodeCommand.Source 'node_modules/typescript/bin/tsc' '-b'
                if ($LASTEXITCODE -ne 0) { throw 'Kiem tra TypeScript that bai.' }
                & $nodeCommand.Source $vitePath 'build'
                if ($LASTEXITCODE -ne 0) { throw 'Build web that bai.' }
            } finally { Pop-Location }
            $viteArguments += 'preview'
        }
        $viteArguments += @('--host', $frontendHost, '--port', "$FrontendPort", '--strictPort')
        $frontendLog = Join-Path $logDirectory "frontend-$FrontendPort.err.log"
        $frontendProcess = Start-Process -FilePath $nodeCommand.Source -ArgumentList $viteArguments `
            -WorkingDirectory $frontendRoot -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $logDirectory "frontend-$FrontendPort.out.log") -RedirectStandardError $frontendLog
        $ownedProcesses.Add($frontendProcess)
        Wait-Ready $frontendUrl $frontendProcess $frontendLog
    }

    Write-Host "San sang: $frontendUrl" -ForegroundColor Green
    Write-Host "API: $backendUrl | Nhat ky: $logDirectory"
    if ($Lan) {
        Write-Host 'TV va may tinh can cung mang. Mo mot trong cac dia chi LAN sau tren TV:' -ForegroundColor Cyan
        [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
            Where-Object { $_.OperationalStatus -eq 'Up' -and $_.NetworkInterfaceType -ne 'Loopback' -and $_.GetIPProperties().GatewayAddresses.Count -gt 0 } |
            ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
            Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' -and $_.Address.ToString() -notlike '169.254.*' } |
            ForEach-Object { Write-Host "  http://$($_.Address):$FrontendPort" -ForegroundColor Green }
        Write-Host 'Chi mo cong web cho mang noi bo; API backend van nghe tren 127.0.0.1.'
    }
    if (-not $NoBrowser -and -not $Check) { Start-Process $frontendUrl }
    if (-not $Check) {
        Write-Host 'Giu cua so nay khi su dung. Nhan Enter de dung cac may chu vua duoc run.bat mo.'
        Write-Host 'May chu da chay tu truoc se duoc giu nguyen. Sau khi sua backend, dung va mo lai run.bat.'
        [void](Read-Host)
    }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    foreach ($ownedProcess in $ownedProcesses) {
        if (-not $ownedProcess.HasExited) {
            # Start the server executables directly (no wrapper/reloader workers).
            # Stop only the process object created by this invocation.
            Stop-Process -InputObject $ownedProcess -Force -ErrorAction Continue
        }
        $ownedProcess.Dispose()
    }
}
