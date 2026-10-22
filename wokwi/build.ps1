param(
    [string]$ArduinoCli = 'D:\Tools\arduino\arduino-cli.exe',
    [string]$ArduinoConfig = 'D:\Tools\arduino\arduino-cli.yaml',
    [string]$Fqbn = 'esp32:esp32:esp32'
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $ArduinoCli -PathType Leaf)) {
    $cliCommand = Get-Command arduino-cli -ErrorAction SilentlyContinue
    if (-not $cliCommand) {
        throw 'Arduino CLI not found. Install it or pass -ArduinoCli <path>.'
    }
    $ArduinoCli = $cliCommand.Source
}

$outputDir = Join-Path $PSScriptRoot 'build'
$sketchDir = Join-Path $outputDir 'source\sketch'
$cacheDir = Join-Path $outputDir 'cache'
New-Item -ItemType Directory -Path $sketchDir, $cacheDir -Force | Out-Null

# Arduino requires sketch.ino to be inside a folder named sketch.
# Keep the editable Wokwi source in place and stage a build copy locally.
$sourcePath = Join-Path $PSScriptRoot 'sketch.ino'
$stagedSourcePath = Join-Path $sketchDir 'sketch.ino'
Copy-Item -LiteralPath $sourcePath -Destination $stagedSourcePath -Force

# Use .NET directly: Get-FileHash may be unavailable in the VS Code task shell.
# Hash the staged copy so the manifest describes the source actually compiled.
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$sourceStream = $null
try {
    $sourceStream = [System.IO.File]::OpenRead($stagedSourcePath)
    $sourceSha256 = [BitConverter]::ToString($sha256.ComputeHash($sourceStream)).Replace('-', '')
}
finally {
    if ($null -ne $sourceStream) { $sourceStream.Dispose() }
    $sha256.Dispose()
}

$cliArgs = @()
if (Test-Path -LiteralPath $ArduinoConfig -PathType Leaf) {
    $cliArgs += @('--config-file', $ArduinoConfig)
}
$cliArgs += @(
    'compile', '--fqbn', $Fqbn,
    '--jobs', '2', '--warnings', 'default',
    '--build-path', $cacheDir,
    '--output-dir', $outputDir,
    $sketchDir
)

Write-Host 'Building ESP32 firmware for Wokwi...'
& $ArduinoCli @cliArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

foreach ($artifact in @('sketch.ino.merged.bin', 'sketch.ino.elf')) {
    if (-not (Test-Path -LiteralPath (Join-Path $outputDir $artifact) -PathType Leaf)) {
        throw "Build did not produce $artifact. Check the ESP32 board package."
    }
}
$buildInfo = [ordered]@{
    source = 'sketch.ino'
    sourceSha256 = $sourceSha256
    fqbn = $Fqbn
    builtAt = [DateTimeOffset]::Now.ToString('o')
}
$buildInfo | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $outputDir 'build-info.json') -Encoding UTF8
& (Join-Path $PSScriptRoot 'configure-intellisense.ps1') -CompileDatabase (Join-Path $cacheDir 'compile_commands.json')
Write-Host 'Build OK. Press F1 > Wokwi: Start Simulator in VS Code.'
