param(
  [string]$OutputPath,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
if (!$OutputPath) { $OutputPath = Join-Path $repo 'release\ITSupportToolkit-Windows.zip' }
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$installerOutput = [System.IO.Path]::ChangeExtension($OutputPath, '.exe')
if (!$Force) {
  foreach ($path in @($OutputPath, $installerOutput)) {
    if (Test-Path -LiteralPath $path) {
      throw "Package already exists: $path (pass -Force to replace it)"
    }
  }
}
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (!$npm) { throw 'Node.js/npm is required to build the extension.' }
$go = (Get-Command go.exe -ErrorAction SilentlyContinue).Source
if (!$go -and (Test-Path 'C:\Program Files\Go\bin\go.exe')) { $go = 'C:\Program Files\Go\bin\go.exe' }
if (!$go) { throw 'Go 1.22+ is required to build the Windows Agent.' }

$staging = Join-Path $env:LOCALAPPDATA ("Temp\opencode\it-support-toolkit-release-" + [guid]::NewGuid().ToString('N'))
New-Item -Path (Join-Path $staging 'extension'), (Join-Path $staging 'agent') -ItemType Directory -Force | Out-Null
try {
  Push-Location (Join-Path $repo 'extension')
  try {
    if (!(Test-Path -LiteralPath 'node_modules' -PathType Container)) {
      & $npm ci
      if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    }
    & $npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Extension build failed' }
  } finally { Pop-Location }

  Push-Location (Join-Path $repo 'native-agent')
  try {
    & $go build -o (Join-Path $staging 'agent\it-support-host.exe') ./cmd/host
    if ($LASTEXITCODE -ne 0) { throw 'Agent build failed' }
  } finally { Pop-Location }

  Copy-Item -Path (Join-Path $repo 'extension\dist\*') -Destination (Join-Path $staging 'extension') -Recurse -Force
  foreach ($name in @('setup.ps1', 'install.ps1')) {
    $scriptBytes = [System.IO.File]::ReadAllBytes((Join-Path $PSScriptRoot $name))
    if ($scriptBytes.Length -lt 6 -or $scriptBytes[0] -ne 239 -or $scriptBytes[1] -ne 187 -or $scriptBytes[2] -ne 191 -or
        ($scriptBytes[3] -eq 239 -and $scriptBytes[4] -eq 187 -and $scriptBytes[5] -eq 191)) {
      throw "$name must use exactly one UTF-8 BOM so Windows PowerShell 5.1 reads Vietnamese correctly."
    }
  }
  $agentScript = Join-Path $PSScriptRoot 'install.ps1'
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Install.cmd') -Destination $staging
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'setup.ps1') -Destination $staging
  Copy-Item -LiteralPath $agentScript -Destination (Join-Path $staging 'install-agent.ps1')
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'INSTALL.md') -Destination $staging
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'windows-readme.txt') -Destination (Join-Path $staging 'readme.txt')

  New-Item -Path (Split-Path $OutputPath -Parent) -ItemType Directory -Force | Out-Null
  Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $OutputPath -Force
  $launcher = Join-Path $staging 'launcher'
  New-Item -Path $launcher -ItemType Directory -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'launcher\main.go') -Destination $launcher
  Copy-Item -LiteralPath $OutputPath -Destination (Join-Path $launcher 'payload.zip')
  & $go build -trimpath -ldflags '-s -w' -o $installerOutput (Join-Path $launcher 'main.go')
  if ($LASTEXITCODE -ne 0) { throw 'One-file installer build failed' }
  & $installerOutput --verify
  if ($LASTEXITCODE -ne 0) { throw 'One-file installer verification failed' }
  $hash = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash
  $installerHash = (Get-FileHash -LiteralPath $installerOutput -Algorithm SHA256).Hash
  Write-Host "ZIP: $OutputPath"
  Write-Host "ZIP SHA256: $hash"
  Write-Host "One-file installer: $installerOutput"
  Write-Host "Installer SHA256: $installerHash"
} finally {
  Remove-Item -LiteralPath $staging -Recurse -Force
}
