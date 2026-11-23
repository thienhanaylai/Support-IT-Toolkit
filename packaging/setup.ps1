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
    throw "Gói cài thiếu file: $file"
  }
}
if ((Test-Path -LiteralPath $installedExtension) -and !(Test-Path -LiteralPath $marker -PathType Leaf)) {
  throw "Thư mục đích không thuộc bộ cài này, sẽ không ghi đè: $installedExtension"
}
$previousInstall = Test-Path -LiteralPath $marker -PathType Leaf

New-Item -Path $installedExtension -ItemType Directory -Force | Out-Null
Get-ChildItem -LiteralPath $sourceExtension -Force | Copy-Item -Destination $installedExtension -Recurse -Force
[System.IO.File]::WriteAllText($marker, 'IT Support Toolkit installer', (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Đã chép extension vào: $installedExtension"

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
      Write-Host '  3. Xem hướng dẫn cho cả hai trình duyệt'
      do {
        $selection = (Read-Host 'Nhập 1, 2 hoặc 3').Trim()
        if ($selection -notin @('1', '2', '3')) {
          Write-Host 'Lựa chọn không hợp lệ. Vui lòng nhập 1, 2 hoặc 3.'
        }
      } until ($selection -in @('1', '2', '3'))
      $Browser = @{ '1' = 'Chrome'; '2' = 'Edge'; '3' = 'None' }[$selection]
    }
    if ($Browser -ne 'None') {
      $page = if ($Browser -eq 'Chrome') { 'chrome://extensions/' } else { 'edge://extensions/' }
      if ($Browser -eq 'Chrome') {
        Write-Host 'HƯỚNG DẪN GOOGLE CHROME:'
        Write-Host "  1. Mở Chrome, nhập $page vào thanh địa chỉ rồi nhấn Enter."
        Write-Host '  2. Bật Chế độ dành cho nhà phát triển (Developer mode) ở góc trên bên phải.'
        Write-Host '  3. Nhấn Tải tiện ích đã giải nén (Load unpacked) ở góc trên bên trái.'
      } else {
        Write-Host 'HƯỚNG DẪN MICROSOFT EDGE:'
        Write-Host "  1. Mở Edge, nhập $page vào thanh địa chỉ rồi nhấn Enter."
        Write-Host '  2. Bật Chế độ nhà phát triển (Developer mode) ở thanh bên trái.'
        Write-Host '  3. Nhấn Tải tiện ích đã giải nén (Load unpacked).'
      }
      Write-Host "  4. Chọn thư mục: $installedExtension"
      Write-Host '  5. Sao chép ID của extension trên trang quản lý, quay lại cửa sổ cài để nhập.'
    } else {
      Write-Host 'HƯỚNG DẪN CHO CẢ HAI TRÌNH DUYỆT:'
      Write-Host '  Chrome: nhập chrome://extensions/ vào thanh địa chỉ; bật Developer mode ở góc trên bên phải.'
      Write-Host '  Edge: nhập edge://extensions/ vào thanh địa chỉ; bật Developer mode ở thanh bên trái.'
      Write-Host "  Nhấn Load unpacked, chọn: $installedExtension"
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
Write-Host 'Đã sẵn sàng. Tải lại extension trong trình duyệt vừa chọn rồi thử Ping.'
