param(
  [string]$OutputPath,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$extension = Join-Path $repo 'extension'
$dist = Join-Path $extension 'dist'
$readme = Join-Path $PSScriptRoot 'readme.txt'
if (!$OutputPath) { $OutputPath = Join-Path $repo 'release\ITSupportToolkit-Edge-Store.zip' }
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
if ((Test-Path -LiteralPath $OutputPath) -and !$Force) {
  throw "Package already exists: $OutputPath (pass -Force to replace it)"
}
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (!$npm) { throw 'Node.js/npm is required to build the extension.' }

Push-Location $extension
try {
  if (!(Test-Path -LiteralPath 'node_modules' -PathType Container)) {
    & $npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
  }
  & $npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Extension build failed' }
} finally { Pop-Location }

$manifestPath = Join-Path $dist 'manifest.json'
if (!(Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Built extension is missing manifest.json.' }
if (!(Test-Path -LiteralPath $readme -PathType Leaf)) { throw 'Missing Edge package readme.txt.' }
if (Test-Path -LiteralPath (Join-Path $dist 'readme.txt')) { throw 'Build output already contains readme.txt.' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.manifest_version -ne 3) { throw 'Expected a Manifest V3 extension.' }
$required = @(
  'welcome.html',
  $manifest.action.default_popup,
  $manifest.background.service_worker,
  $manifest.options_page,
  $manifest.side_panel.default_path
) + @($manifest.icons.PSObject.Properties.Value)
foreach ($path in $required) {
  if (!$path -or [System.IO.Path]::IsPathRooted($path) -or $path -match '(^|[\\/])\.\.([\\/]|$)' -or
      !(Test-Path -LiteralPath (Join-Path $dist $path) -PathType Leaf)) {
    throw "Extension references a missing or unsafe file: $path"
  }
}

# Compress the *contents* of dist, never the dist/ or extension/ directory.
New-Item -Path (Split-Path $OutputPath -Parent) -ItemType Directory -Force | Out-Null
$zipItems = @((Join-Path $dist '*'), $readme)
Compress-Archive -Path $zipItems -DestinationPath $OutputPath -Force
Add-Type -AssemblyName System.IO.Compression
$zip = [System.IO.Compression.ZipFile]::OpenRead($OutputPath)
try {
  $entries = @($zip.Entries | Where-Object { $_.Name })
  if (!($entries | Where-Object { $_.FullName -eq 'manifest.json' })) {
    throw 'Store ZIP must have manifest.json at its root.'
  }
  if (!($entries | Where-Object { $_.FullName -eq 'readme.txt' })) {
    throw 'Store ZIP must have readme.txt at its root.'
  }
  if ($entries | Where-Object { $_.FullName -match '^(extension|dist|agent)/|\.exe$|\.ps1$|\.cmd$' }) {
    throw 'Store ZIP contains a wrapper directory or installer file.'
  }
  $sourceFiles = @(Get-ChildItem -LiteralPath $dist -Recurse -File)
  if ($entries.Count -ne $sourceFiles.Count + 1) { throw 'Store ZIP file count does not match the build output plus readme.txt.' }
  $hash = [System.Security.Cryptography.SHA256]::Create()
  try {
    foreach ($entry in $entries) {
      $source = if ($entry.FullName -eq 'readme.txt') { $readme } else { Join-Path $dist ($entry.FullName.Replace('/', '\')) }
      if (!(Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Unexpected file in Store ZIP: $($entry.FullName)"
      }
      $stream = $entry.Open()
      try {
        $zippedHash = [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '')
      } finally { $stream.Dispose() }
      if ($zippedHash -ne (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash) {
        throw "Store ZIP differs from the build output: $($entry.FullName)"
      }
    }
  } finally { $hash.Dispose() }
  $count = $entries.Count
} finally { $zip.Dispose() }
Write-Host "Edge Add-ons ZIP: $OutputPath"
Write-Host "Version: $($manifest.version); files: $count"
Write-Host "SHA256: $((Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash)"
