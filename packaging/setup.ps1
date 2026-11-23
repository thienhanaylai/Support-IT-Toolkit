param(
  [string[]]$ExtensionIds,
  [switch]$ReuseExistingIds,
  [ValidateSet('Chrome', 'Edge', 'None')][string]$Browser
)

$ErrorActionPreference = 'Stop'
$bundle = $PSScriptRoot
$sourceExtension = Join-Path $bundle 'extension'
$agentBinary = Join-Path $bundle 'agent\it-support-host.exe'
$agentInstaller = Join-Path $bundle 'install-agent.ps1'
$installRoot = Join-Path $env:LOCALAPPDATA 'ITSupportToolkit'
$installedExtension = Join-Path $installRoot 'extension'
$marker = Join-Path $installedExtension '.it-support-toolkit-installed'
$hostManifest = Join-Path $installRoot 'com.itsupport.toolkit.json'

foreach ($file in @((Join-Path $sourceExtension 'manifest.json'), $agentBinary, $agentInstaller)) {
  if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
    throw "Incomplete package: $file"
  }
}
if ((Test-Path -LiteralPath $installedExtension) -and !(Test-Path -LiteralPath $marker -PathType Leaf)) {
  throw "The destination is not managed by this installer: $installedExtension"
}
$previousInstall = Test-Path -LiteralPath $marker -PathType Leaf

New-Item -Path $installedExtension -ItemType Directory -Force | Out-Null
Get-ChildItem -LiteralPath $sourceExtension -Force | Copy-Item -Destination $installedExtension -Recurse -Force
[System.IO.File]::WriteAllText($marker, 'IT Support Toolkit installer', (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Extension files: $installedExtension"

if (!$ExtensionIds -or $ExtensionIds.Count -eq 0) {
  $existingIds = @()
  if (Test-Path -LiteralPath $hostManifest -PathType Leaf) {
    try {
      $installedHost = Get-Content -LiteralPath $hostManifest -Raw | ConvertFrom-Json
      $existingIds = @($installedHost.allowed_origins | ForEach-Object {
        if ($_ -cmatch '^chrome-extension://([a-p]{32})/$') { $Matches[1] }
      })
    } catch { $existingIds = @() }
  }
  if ($ReuseExistingIds -and $previousInstall -and $existingIds.Count -gt 0) {
    $ExtensionIds = $existingIds
    Write-Host "Updating existing installation for Extension ID(s): $($existingIds -join ', ')"
  } else {
    Write-Host "Select this exact folder: $installedExtension"
    Write-Host 'If an older copy is loaded from another folder, remove it after confirming the new copy works.'
    if (!$Browser) {
      Write-Host 'Choose the browser to open for Load unpacked:'
      Write-Host '  1. Google Chrome'
      Write-Host '  2. Microsoft Edge'
      Write-Host '  3. Do not open a browser (open the extensions page yourself)'
      do {
        $selection = (Read-Host 'Enter 1, 2 or 3').Trim()
      } until ($selection -in @('1', '2', '3'))
      $Browser = @{ '1' = 'Chrome'; '2' = 'Edge'; '3' = 'None' }[$selection]
    }
    if ($Browser -ne 'None') {
      $paths = if ($Browser -eq 'Chrome') { @(
        (Join-Path ${env:ProgramFiles} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:LOCALAPPDATA} 'Google\Chrome\Application\chrome.exe')
      ) } else { @(
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path ${env:ProgramFiles} 'Microsoft\Edge\Application\msedge.exe')
      ) }
      $browserPath = $paths | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
      if ($browserPath) {
        $page = if ($Browser -eq 'Chrome') { 'chrome://extensions/' } else { 'edge://extensions/' }
        Start-Process -FilePath $browserPath -ArgumentList $page
      } else {
        Write-Warning "$Browser was not found. Open its extensions page manually."
      }
    }
    Write-Host 'Enable Developer mode, then Load unpacked from the folder above.'
    $default = $existingIds -join ','
    $hint = if ($default) { "Extension ID(s) [$default]" } else { 'Extension ID(s) shown by the browser' }
    $entered = Read-Host "$hint (separate Chrome/Edge IDs with commas)"
    if (!$entered.Trim()) { $entered = $default }
    $ExtensionIds = @($entered -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  }
}

if (!$ExtensionIds -or $ExtensionIds.Count -eq 0) { throw 'At least one Extension ID is required.' }
foreach ($id in $ExtensionIds) {
  if ($id -cnotmatch '^[a-p]{32}$') { throw "Invalid Extension ID: $id" }
}
& $agentInstaller -ExtensionIds $ExtensionIds -AgentBinary $agentBinary
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'Agent installation failed.' }
Write-Host 'Ready. Reload the extension in Chrome/Edge and try Ping.'
