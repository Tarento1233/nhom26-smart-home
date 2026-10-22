param([string]$CompileDatabase = (Join-Path $PSScriptRoot 'build\cache\compile_commands.json'))

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $CompileDatabase)) {
    throw 'Build the firmware first to create the Arduino compile database.'
}
$entries = @(Get-Content -LiteralPath $CompileDatabase -Raw | ConvertFrom-Json)
$sketch = $entries | Where-Object { $_.file -match '[\\/]sketch\.ino\.cpp$' } | Select-Object -First 1
if (-not $sketch) { throw 'Sketch compiler settings were not found in the build database.' }

function Expand-ResponseFiles([string[]]$Arguments, [int]$Depth = 0) {
    if ($Depth -gt 5) { throw 'Compiler response files are nested too deeply.' }
    foreach ($argument in $Arguments) {
        if ($argument.StartsWith('@')) {
            $responsePath = $argument.Substring(1).Trim('"')
            if (-not [IO.Path]::IsPathRooted($responsePath)) { $responsePath = Join-Path $sketch.directory $responsePath }
            $contents = Get-Content -LiteralPath $responsePath -Raw
            if ([string]::IsNullOrWhiteSpace($contents)) { continue }
            $tokens = @([regex]::Matches([string]$contents, '(?:[^\s"]+|"[^"]*")+') | ForEach-Object { $_.Value })
            Expand-ResponseFiles -Arguments $tokens -Depth ($Depth + 1)
        } else { $argument }
    }
}

$arguments = @(Expand-ResponseFiles -Arguments $sketch.arguments)
$includes = New-Object 'System.Collections.Generic.List[string]'
$defines = New-Object 'System.Collections.Generic.List[string]'
$includes.Add($PSScriptRoot.Replace('\', '/'))
$prefix = ''
for ($i = 1; $i -lt $arguments.Count; $i++) {
    $arg = $arguments[$i]
    $include = $null
    if ($arg -eq '-iprefix') {
        $prefix = $arguments[++$i].Trim('"')
    } elseif ($arg -eq '-iwithprefixbefore' -or $arg -eq '-iwithprefix') {
        $include = $prefix + $arguments[++$i].Trim('"')
    } elseif ($arg -eq '-I' -or $arg -eq '-isystem' -or $arg -eq '-iquote') {
        $include = $arguments[++$i].Trim('"')
    } elseif ($arg.StartsWith('-I')) {
        $include = $arg.Substring(2).Trim('"')
    } elseif ($arg.StartsWith('-D')) {
        $defines.Add($arg.Substring(2).Replace('\"', '"'))
    }
    if ($include) {
        if (-not [IO.Path]::IsPathRooted($include)) { $include = Join-Path $sketch.directory $include }
        if (Test-Path -LiteralPath $include -PathType Container) { $includes.Add($include.Replace('\', '/')) }
    }
}
$includePaths = @($includes | Select-Object -Unique)
foreach ($header in @('WiFi.h', 'PubSubClient.h', 'DHT.h', 'LiquidCrystal_I2C.h', 'Arduino.h')) {
    $found = $includePaths | Where-Object { Test-Path -LiteralPath (Join-Path $_ $header) -PathType Leaf } | Select-Object -First 1
    if (-not $found) { throw ('Header was not found in Arduino include paths: ' + $header) }
    if ($header -eq 'Arduino.h') { $arduinoHeader = (Join-Path $found $header).Replace('\', '/') }
}
$compiler = [string]$sketch.arguments[0]
if (-not (Test-Path -LiteralPath $compiler) -and (Test-Path -LiteralPath ($compiler + '.exe'))) { $compiler += '.exe' }
if (-not (Test-Path -LiteralPath $compiler)) { throw ('Compiler not found: ' + $compiler) }
$configuration = [ordered]@{
    configurations = @([ordered]@{
        name = 'ESP32 Arduino CLI'
        compilerPath = $compiler.Replace('\', '/')
        includePath = $includePaths
        defines = @($defines | Select-Object -Unique)
        forcedInclude = @($arduinoHeader)
        cStandard = 'gnu17'
        cppStandard = 'gnu++20'
    })
    version = 4
}
$configDir = Join-Path $PSScriptRoot '.vscode'
New-Item -ItemType Directory -Path $configDir -Force | Out-Null
$configPath = Join-Path $configDir 'c_cpp_properties.json'
$json = $configuration | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText($configPath, $json + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))
Write-Host ('VS Code IntelliSense configured: ' + $includePaths.Count + ' include paths, all project headers found.')
