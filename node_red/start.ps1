param([int]$Port = 1880, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodeExe)) { throw 'Node.js not found. Install Node.js 22 or newer.' }
$entry = Join-Path $PSScriptRoot 'node_modules\node-red\red.js'
if (-not (Test-Path -LiteralPath $entry)) { throw 'Run cai_dat_node_red.bat first.' }
$dataDir = Join-Path $PSScriptRoot 'data'
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
$baseTopic = if ($env:IOT_MQTT_BASE) { $env:IOT_MQTT_BASE } else { 'nhom26/room1' }
$statusUrl = 'http://127.0.0.1:' + $Port + '/api/status'
$existing = $null
try { $existing = Invoke-RestMethod -Uri $statusUrl -TimeoutSec 2 } catch {}
if ($null -ne $existing) {
    if ($existing.baseTopic -ne $baseTopic) { throw 'Port is already used by another Node-RED instance.' }
    Write-Host ('Node-RED is already running: http://localhost:' + $Port + '/dashboard/room')
    if (-not $NoBrowser) { Start-Process ('http://localhost:' + $Port + '/dashboard/room') }
    exit 0
}

$env:PORT = [string]$Port
$nodeArgs = @('--max-old-space-size=384', ('"{0}"' -f $entry), '--userDir', ('"{0}"' -f $PSScriptRoot),
    '--settings', ('"{0}"' -f (Join-Path $PSScriptRoot 'settings.js')), '--port', [string]$Port)
$service = Start-Process -FilePath $nodeExe -ArgumentList $nodeArgs -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $dataDir 'node-red.log') -RedirectStandardError (Join-Path $dataDir 'node-red-error.log')
@{ pid = $service.Id; port = $Port; baseTopic = $baseTopic; userDir = $PSScriptRoot; startedAt = $service.StartTime.ToString('o') } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dataDir 'service.json') -Encoding UTF8
Write-Host 'Starting Node-RED. Please wait...'
$ready = $false
for ($attempt = 0; $attempt -lt 45; $attempt++) {
    if ($service.HasExited) { throw ('Node-RED exited. See ' + (Join-Path $dataDir 'node-red-error.log')) }
    try {
        $runtimeUrl = 'http://127.0.0.1:' + $Port + '/flows/state'
        $runtime = Invoke-RestMethod -Uri $runtimeUrl -TimeoutSec 1
        if ($runtime.state -ne 'start') {
            Invoke-RestMethod -Uri $runtimeUrl -Method Post -ContentType 'application/json' -Body '{"state":"start"}' -TimeoutSec 3 | Out-Null
        }
        $status = Invoke-RestMethod -Uri $statusUrl -TimeoutSec 1
        if ($status.baseTopic -eq $baseTopic) { $ready = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
}
if (-not $ready) { throw ('Node-RED is not ready yet. See ' + (Join-Path $dataDir 'node-red.log')) }
Write-Host ('Dashboard: http://localhost:' + $Port + '/dashboard/room')
Write-Host ('Flow editor: http://localhost:' + $Port)
Write-Host 'Node-RED is running in the background. Use tat_node_red.bat to stop it.'
if (-not $NoBrowser) { Start-Process ('http://localhost:' + $Port + '/dashboard/room') }
