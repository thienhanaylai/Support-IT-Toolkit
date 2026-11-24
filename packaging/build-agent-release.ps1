param(
  [string]$Version = '0.1.4',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$manifest = Get-Content -LiteralPath (Join-Path $repo 'extension\public\manifest.json') -Raw | ConvertFrom-Json
if ($manifest.version -ne $Version) { throw "Agent package version $Version differs from extension version $($manifest.version)." }
$release = Join-Path $repo 'release'
$zipPath = Join-Path $release 'ITSupportToolkit-Agent-Windows.zip'
$cmdPath = Join-Path $release 'Install.cmd'
if (!$Force -and ((Test-Path -LiteralPath $zipPath) -or (Test-Path -LiteralPath $cmdPath))) {
  throw 'Agent release files already exist (pass -Force to replace them).'
}
$go = (Get-Command go.exe -ErrorAction SilentlyContinue).Source
if (!$go -and (Test-Path 'C:\Program Files\Go\bin\go.exe')) { $go = 'C:\Program Files\Go\bin\go.exe' }
if (!$go) { throw 'Go 1.22+ is required to build the Windows Agent.' }
$staging = Join-Path $env:LOCALAPPDATA ("Temp\opencode\it-support-agent-release-" + [guid]::NewGuid().ToString('N'))
New-Item -Path (Join-Path $staging 'agent') -ItemType Directory -Force | Out-Null
try {
  Push-Location (Join-Path $repo 'native-agent')
  try {
    & $go build -o (Join-Path $staging 'agent\it-support-host.exe') ./cmd/host
    if ($LASTEXITCODE -ne 0) { throw 'Agent build failed' }
  } finally { Pop-Location }
  $setup = Join-Path $PSScriptRoot 'agent\setup.ps1'
  $bytes = [System.IO.File]::ReadAllBytes($setup)
  if ($bytes.Length -lt 6 -or $bytes[0] -ne 239 -or $bytes[1] -ne 187 -or $bytes[2] -ne 191 -or
      ($bytes[3] -eq 239 -and $bytes[4] -eq 187 -and $bytes[5] -eq 191)) {
    throw 'Agent setup.ps1 needs exactly one UTF-8 BOM for Windows PowerShell 5.1.'
  }
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'agent\Install.cmd') -Destination $staging
  Copy-Item -LiteralPath $setup -Destination $staging
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'install.ps1') -Destination (Join-Path $staging 'install-agent.ps1')
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'agent\readme.txt') -Destination $staging
  New-Item -Path $release -ItemType Directory -Force | Out-Null
  Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zipPath -Force
  Add-Type -AssemblyName System.IO.Compression
  $archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $files = @($archive.Entries | Where-Object { $_.Name })
    if ($files.Count -ne 5) { throw "Agent ZIP must contain 5 files, got $($files.Count)." }
    foreach ($name in @('Install.cmd', 'setup.ps1', 'install-agent.ps1', 'readme.txt', 'agent/it-support-host.exe')) {
      $entry = $files | Where-Object { $_.FullName.Replace('\', '/') -eq $name } | Select-Object -First 1
      if (!$entry) { throw "Agent ZIP is missing $name" }
      $source = Join-Path $staging ($name.Replace('/', '\'))
      $stream = $entry.Open()
      try {
        $hashBytes = [System.Security.Cryptography.SHA256]::Create()
        try { $actual = [BitConverter]::ToString($hashBytes.ComputeHash($stream)).Replace('-', '') }
        finally { $hashBytes.Dispose() }
      } finally { $stream.Dispose() }
      if ($actual -ne (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash) {
        throw "Agent ZIP differs from staging file: $name"
      }
    }
  } finally { $archive.Dispose() }
  $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
  $template = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'agent\Install-Online.cmd.in') -Raw -Encoding UTF8
  $cmd = $template.Replace('__VERSION__', $Version).Replace('__SHA256__', $hash)
  if ($cmd -match '__VERSION__|__SHA256__') { throw 'Online installer template contains unresolved placeholders.' }
  $cmd = ($cmd -replace "`r?`n", "`r`n")
  [System.IO.File]::WriteAllText($cmdPath, $cmd, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "Agent ZIP: $zipPath"
  Write-Host "Agent ZIP SHA256: $hash"
  Write-Host "Standalone installer: $cmdPath"
} finally {
  Remove-Item -LiteralPath $staging -Recurse -Force
}
