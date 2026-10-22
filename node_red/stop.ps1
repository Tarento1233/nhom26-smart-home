$ErrorActionPreference = 'Stop'
$manifest = Join-Path $PSScriptRoot 'data\service.json'
if (-not (Test-Path -LiteralPath $manifest)) { Write-Host 'No managed Node-RED service found.'; exit 0 }
$serviceInfo = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
$service = Get-Process -Id $serviceInfo.pid -ErrorAction SilentlyContinue
if (-not $service) { Write-Host 'Node-RED is already stopped.'; exit 0 }
if ($service.ProcessName -ne 'node' -or $service.StartTime.ToString('o') -ne $serviceInfo.startedAt) {
    throw 'Process identity changed. Refusing to stop an unrelated process.'
}
$processInfo = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $serviceInfo.pid)
if (-not $processInfo.CommandLine.Contains($PSScriptRoot) -or -not $processInfo.CommandLine.Contains('node-red')) {
    throw 'This process does not belong to the project.'
}
try {
    $stopUrl = 'http://127.0.0.1:' + $serviceInfo.port + '/flows/state'
    Invoke-RestMethod -Uri $stopUrl -Method Post -ContentType 'application/json' -Body '{"state":"stop"}' -TimeoutSec 5 | Out-Null
} catch { Write-Host 'Runtime did not respond; stopping the managed process.' }
Stop-Process -Id $serviceInfo.pid
Write-Host 'Node-RED stopped. Logs and flows are preserved.'
