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
    if ($major -lt 22) { throw 'Node.js 22.13 or newer is required.' }
    & $nodeExe -e "require('node:sqlite')"
    if ($LASTEXITCODE -ne 0) { throw 'Install Node.js 22.13 or newer for SQLite support.' }
    if (Test-Path -LiteralPath $pnpm) {
        $storePath = Join-Path $PSScriptRoot '.pnpm-store'
        $modulesFile = Join-Path $PSScriptRoot 'node_modules\.modules.yaml'
        if (Test-Path -LiteralPath $modulesFile) {
            $storeLine = Select-String -LiteralPath $modulesFile -Pattern '^storeDir: (.+)$'
            if ($storeLine) { $storePath = $storeLine.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'") }
        }
        & $pnpm install --frozen-lockfile --ignore-scripts --store-dir $storePath
    } else {
        $npmCommand = Get-Command npm.cmd -ErrorAction Stop
        & $npmCommand.Source install --ignore-scripts --omit=dev
    }
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Host 'Node-RED and Dashboard 2.0 are installed.'
} finally { Pop-Location }
