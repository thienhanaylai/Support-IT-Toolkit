param(
  [string[]]$ExtensionIds,
  [switch]$ReuseExistingIds,
  [switch]$SkipOpenExtensionFolder,
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

function Get-ExtensionVersion {
  param([Parameter(Mandatory = $true)][string]$ManifestPath)
  try {
    $manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
    if ($manifest.version) { return [string]$manifest.version }
  } catch {}
  return 'không rõ'
}

function Remove-StaleExtensionAssets {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )
  $sourceRoot = [System.IO.Path]::GetFullPath((Join-Path $Source 'assets')).TrimEnd('\')
  $destinationRoot = [System.IO.Path]::GetFullPath((Join-Path $Destination 'assets')).TrimEnd('\')
  if (!(Test-Path -LiteralPath $sourceRoot -PathType Container) -or
      !(Test-Path -LiteralPath $destinationRoot -PathType Container)) { return }
  $currentFiles = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
  Get-ChildItem -LiteralPath $sourceRoot -File -Recurse -Force | ForEach-Object {
    [void]$currentFiles.Add($_.FullName.Substring($sourceRoot.Length + 1))
  }
  Get-ChildItem -LiteralPath $destinationRoot -File -Recurse -Force | ForEach-Object {
    $relative = $_.FullName.Substring($destinationRoot.Length + 1)
    if (!$currentFiles.Contains($relative)) {
      Remove-Item -LiteralPath $_.FullName -Force
    }
  }
  Get-ChildItem -LiteralPath $destinationRoot -Directory -Recurse -Force |
    Sort-Object { $_.FullName.Length } -Descending | ForEach-Object {
      if (!(Get-ChildItem -LiteralPath $_.FullName -Force | Select-Object -First 1)) {
        Remove-Item -LiteralPath $_.FullName -Force
      }
    }
}

function Open-ExtensionManagementPage {
  param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string]$Page,
    [Parameter(Mandatory = $true)][string]$DisplayName
  )

  # Chromium browsers turn internal URLs passed on the command line into a New Tab page.
  # Open a normal window, focus the omnibox and navigate with UI Automation instead.
  $navigationScript = @'
Start-Process '__EXECUTABLE__' -ArgumentList '--new-window','about:blank'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Start-Sleep -Milliseconds 300
[System.Windows.Forms.SendKeys]::SendWait('{F4}')
$a = $null
for ($i = 0; $i -lt 30; $i++) {
  $a = [System.Windows.Automation.AutomationElement]::FocusedElement
  if ($a.Current.ClassName -eq 'OmniboxViewViews' -or $a.Current.AutomationId -eq 'addressEditBox') { break }
  Start-Sleep -Milliseconds 50
}
if (!$a -or ($a.Current.ClassName -ne 'OmniboxViewViews' -and $a.Current.AutomationId -ne 'addressEditBox')) {
  throw 'Address bar not focused'
}
Set-Clipboard '__PAGE__'
[System.Windows.Forms.SendKeys]::SendWait('^a')
[System.Windows.Forms.SendKeys]::SendWait('^v')
$v = $a.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
for ($i = 0; $i -lt 20; $i++) {
  if ($a.Current.HasKeyboardFocus -and $v.Current.Value -eq '__PAGE__') {
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    exit 0
  }
  Start-Sleep -Milliseconds 50
}
throw 'Navigation cancelled'
'@
  $navigationScript = $navigationScript.Replace('__EXECUTABLE__', $Executable).Replace('__PAGE__', $Page)
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($navigationScript))
  try {
    $process = Start-Process -FilePath 'powershell.exe' `
      -ArgumentList @('-NoProfile', '-STA', '-EncodedCommand', $encoded) `
      -Wait -PassThru -ErrorAction Stop
    if ($process -and $process.ExitCode -ne 0) {
      throw "$DisplayName navigation exited with code $($process.ExitCode)."
    }
    Write-Host "Đã tự động mở $Page trên $DisplayName."
    return $true
  } catch {
    Write-Host "Không thể tự động mở $Page trên $DisplayName; hãy mở thủ công."
    return $false
  }
}

foreach ($file in @((Join-Path $sourceExtension 'manifest.json'), $agentBinary, $agentInstaller)) {
  if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
    throw "Gói cài thiếu file: $file"
  }
}
if ((Test-Path -LiteralPath $installedExtension) -and !(Test-Path -LiteralPath $marker -PathType Leaf)) {
  throw "Thư mục đích không thuộc bộ cài này, sẽ không ghi đè: $installedExtension"
}
$previousInstall = Test-Path -LiteralPath $marker -PathType Leaf
$previousVersion = if ($previousInstall -and (Test-Path -LiteralPath (Join-Path $installedExtension 'manifest.json') -PathType Leaf)) {
  Get-ExtensionVersion (Join-Path $installedExtension 'manifest.json')
} else { $null }
$newVersion = Get-ExtensionVersion (Join-Path $sourceExtension 'manifest.json')

New-Item -Path $installedExtension -ItemType Directory -Force | Out-Null
Get-ChildItem -LiteralPath $sourceExtension -Force | Copy-Item -Destination $installedExtension -Recurse -Force
Remove-StaleExtensionAssets -Source $sourceExtension -Destination $installedExtension
[System.IO.File]::WriteAllText($marker, 'IT Support Toolkit installer', (New-Object System.Text.UTF8Encoding($false)))
if ($previousInstall) {
  Write-Host "Đã cập nhật extension dev: $previousVersion -> $newVersion"
} else {
  Write-Host "Đã cài extension dev phiên bản $newVersion"
}
Write-Host "Thư mục extension: $installedExtension"

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
    Write-Host "Đang cập nhật với Extension ID đã đăng ký: $($existingIds -join ', ')"
  } else {
    Write-Host "Thư mục cần chọn khi Load unpacked: $installedExtension"
    Write-Host 'Nếu bản cũ cài từ thư mục khác, chỉ gỡ sau khi xác nhận bản mới hoạt động.'
    if (!$Browser) {
      Write-Host 'Chọn trình duyệt cần cài extension:'
      Write-Host '  1. Google Chrome'
      Write-Host '  2. Microsoft Edge'
      Write-Host '  3. Cả Google Chrome và Microsoft Edge'
      do {
        $selection = (Read-Host 'Nhập 1, 2 hoặc 3').Trim()
        if ($selection -notin @('1', '2', '3')) {
          Write-Host 'Lựa chọn không hợp lệ. Vui lòng nhập 1, 2 hoặc 3.'
        }
      } until ($selection -in @('1', '2', '3'))
      $Browser = @{ '1' = 'Chrome'; '2' = 'Edge'; '3' = 'None' }[$selection]
    }
    if (!$SkipOpenExtensionFolder) {
      try {
        Start-Process -FilePath 'explorer.exe' -ArgumentList "`"$installedExtension`"" -ErrorAction Stop | Out-Null
        Write-Host 'Đã mở sẵn thư mục extension trong File Explorer.'
      } catch {
        Write-Host 'Không thể tự mở File Explorer; hãy mở thủ công thư mục hiển thị ở trên.'
      }
    }
    $browserTargets = if ($Browser -eq 'Chrome') {
      @(@{ Executable = 'chrome.exe'; Page = 'chrome://extensions/'; DisplayName = 'Google Chrome' })
    } elseif ($Browser -eq 'Edge') {
      @(@{ Executable = 'msedge.exe'; Page = 'edge://extensions/'; DisplayName = 'Microsoft Edge' })
    } else {
      @(
        @{ Executable = 'chrome.exe'; Page = 'chrome://extensions/'; DisplayName = 'Google Chrome' },
        @{ Executable = 'msedge.exe'; Page = 'edge://extensions/'; DisplayName = 'Microsoft Edge' }
      )
    }
    foreach ($target in $browserTargets) {
      Open-ExtensionManagementPage @target | Out-Null
    }
    if (!$SkipOpenExtensionFolder) {
      try {
        # The navigation helper temporarily puts the internal URL on the clipboard.
        # Restore the extension folder so Ctrl+V works in the Load unpacked dialog.
        Set-Clipboard -Value $installedExtension -ErrorAction Stop
        Write-Host 'Đã sao chép đường dẫn thư mục extension vào clipboard.'
      } catch {
        Write-Host 'Không thể tự sao chép đường dẫn; hãy sao chép thủ công đường dẫn hiển thị ở trên.'
      }
    }
    if ($Browser -ne 'None') {
      $page = if ($Browser -eq 'Chrome') { 'chrome://extensions/' } else { 'edge://extensions/' }
      if ($Browser -eq 'Chrome') {
        Write-Host 'HƯỚNG DẪN GOOGLE CHROME:'
        Write-Host "  1. Trang $page đã được tự động mở trên Chrome."
        Write-Host '  2. Bật Chế độ dành cho nhà phát triển (Developer mode) ở góc trên bên phải.'
        Write-Host '  3. Nhấn Tải tiện ích đã giải nén (Load unpacked) ở góc trên bên trái.'
      } else {
        Write-Host 'HƯỚNG DẪN MICROSOFT EDGE:'
        Write-Host "  1. Trang $page đã được tự động mở trên Edge."
        Write-Host '  2. Bật Chế độ nhà phát triển (Developer mode) ở thanh bên trái.'
        Write-Host '  3. Nhấn Tải tiện ích đã giải nén (Load unpacked).'
      }
      Write-Host '  4. Trong cửa sổ chọn thư mục, nhấn Ctrl+L, Ctrl+V rồi Enter.'
      Write-Host '     Đường dẫn đã được sao chép và thư mục cũng đã mở sẵn trong File Explorer.'
      Write-Host "     Nếu cần, chọn thủ công: $installedExtension"
      Write-Host '  5. Nhấn Chọn thư mục (Select Folder).'
      Write-Host '  6. Sao chép ID của extension trên trang quản lý, quay lại cửa sổ cài để nhập.'
    } else {
      Write-Host 'HƯỚNG DẪN CHO CẢ HAI TRÌNH DUYỆT:'
      Write-Host '  Đã thử tự động mở chrome://extensions/ và edge://extensions/.'
      Write-Host '  Chrome: bật Developer mode ở góc trên bên phải.'
      Write-Host '  Edge: bật Developer mode ở thanh bên trái.'
      Write-Host '  Nhấn Load unpacked; trong cửa sổ chọn thư mục, nhấn Ctrl+L, Ctrl+V rồi Enter.'
      Write-Host "  Đường dẫn đã sao chép: $installedExtension"
      Write-Host '  Sao chép Extension ID và quay lại cửa sổ cài để nhập.'
    }
    $default = $existingIds -join ','
    $hint = if ($default) { "Extension ID đã dùng [$default]" } else { 'Extension ID hiện trên trang quản lý' }
    $entered = Read-Host "$hint (nếu cài cả Chrome và Edge, ngăn cách các ID bằng dấu phẩy)"
    if (!$entered.Trim()) { $entered = $default }
    $ExtensionIds = @($entered -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  }
}

if (!$ExtensionIds -or $ExtensionIds.Count -eq 0) { throw 'Cần nhập ít nhất một Extension ID.' }
foreach ($id in $ExtensionIds) {
  if ($id -cnotmatch '^[a-p]{32}$') { throw "Extension ID không hợp lệ: $id" }
}
& $agentInstaller -ExtensionIds $ExtensionIds -AgentBinary $agentBinary
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'Cài đặt Agent thất bại.' }
if ($ReuseExistingIds -and $previousInstall -and $existingIds.Count -gt 0) {
  Write-Host 'BẢN DEV ĐÃ ĐƯỢC CẬP NHẬT. Không gỡ hoặc Load unpacked lại.'
  Write-Host 'Chrome: mở chrome://extensions/ và bấm Reload tại IT Support Toolkit.'
  Write-Host 'Edge: mở edge://extensions/ và bấm Tải lại/Reload tại IT Support Toolkit.'
  Write-Host 'Sau đó refresh các tab Portal đang mở để nạp content script mới.'
} else {
  Write-Host 'Đã sẵn sàng. Tải lại extension trong trình duyệt vừa chọn rồi thử Ping.'
}
