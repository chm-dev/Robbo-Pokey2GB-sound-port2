<#
.SYNOPSIS
  Build the standalone Robbo POKEY SFX ROM (v2).

.DESCRIPTION
  Compiles src/*.c with the GBDK-2020 install in this workspace and links a
  ROM-only DMG cartridge: sound-port2/roms/robbo-sfx2.gb

.EXAMPLE
  ./sound-port2/tools/build.ps1
  ./sound-port2/tools/build.ps1 -Clean
  ./sound-port2/tools/build.ps1 -ExtraCFlags "-DTEST_NOTE=3"
#>
[CmdletBinding()]
param(
    [switch]$Clean,
    [string]$ExtraCFlags = ''
)

$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repoRoot    = (Resolve-Path (Join-Path $projectRoot '..')).Path
$gbdk        = Join-Path $repoRoot 'gbdk'
$lcc         = Join-Path $gbdk 'bin\lcc.exe'
$srcDir      = Join-Path $projectRoot 'src'
$objDir      = Join-Path $projectRoot 'build\obj'
$romDir      = Join-Path $projectRoot 'roms'

if (-not (Test-Path $lcc)) {
    throw "GBDK not found at $gbdk (expected bin\lcc.exe)"
}

if ($Clean -and (Test-Path $objDir)) {
    Remove-Item -Recurse -Force $objDir
}
New-Item -ItemType Directory -Force -Path $objDir, $romDir | Out-Null

$extra = @()
if ($ExtraCFlags) { $extra = $ExtraCFlags -split ' ' }

$sources = Get-ChildItem -Path $srcDir -Filter *.c -File | Sort-Object Name
if (-not $sources) { throw "No .c files in $srcDir" }

$objects = @()
foreach ($source in $sources) {
    $object = Join-Path $objDir ($source.BaseName + '.o')
    Write-Host "CC  $($source.Name)"
    & $lcc -c @extra -o $object $source.FullName
    if ($LASTEXITCODE -ne 0) { throw "Compile failed: $($source.Name)" }
    $objects += $object
}

$rom = Join-Path $romDir 'robbo-sfx2.gb'
Write-Host "LD  $rom"
& $lcc -Wm-yt0x00 -Wm-ya1 -Wm-ynROBBO_SFX2 -o $rom @objects
if ($LASTEXITCODE -ne 0) { throw "Link failed" }

$size = (Get-Item $rom).Length
Write-Host ("ROM {0} ({1} bytes, {2:N1} KiB)" -f $rom, $size, ($size / 1KB))
