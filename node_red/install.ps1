$ErrorActionPreference = 'Stop'
$runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$pnpm = Join-Path $runtimeRoot 'bin\fallback\pnpm.cmd'
Push-Location $PSScriptRoot
try {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    $nodeExe = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $runtimeRoot 'node\bin\node.exe' }
    if (-not (Test-Path -LiteralPath $nodeExe)) { throw 'Install Node.js 22 or newer first.' }
    $env:PATH = (Split-Path $nodeExe) + ';' + $env:PATH
    $major = [int]((& $nodeExe --version).TrimStart('v').Split('.')[0])
    if ($major -lt 22) { throw 'Node.js 22 or newer is required.' }
    if (Test-Path -LiteralPath $pnpm) {
        & $pnpm install --frozen-lockfile --ignore-scripts --store-dir (Join-Path $PSScriptRoot '.pnpm-store')
    } else {
        $npmCommand = Get-Command npm.cmd -ErrorAction Stop
        & $npmCommand.Source install --ignore-scripts --omit=dev
    }
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Host 'Node-RED and Dashboard 2.0 are installed.'
} finally { Pop-Location }
