$ErrorActionPreference = 'Stop'
$agent = Join-Path $PSScriptRoot 'agent\it-support-host.exe'
$installer = Join-Path $PSScriptRoot 'install-agent.ps1'
if (!(Test-Path -LiteralPath $agent -PathType Leaf) -or !(Test-Path -LiteralPath $installer -PathType Leaf)) {
  throw 'Gói Agent thiếu file. Hãy giải nén toàn bộ ZIP trước khi chạy Install.cmd.'
}

$manifest = Join-Path $env:LOCALAPPDATA 'ITSupportToolkit\com.itsupport.toolkit.json'
$existing = @()
if (Test-Path -LiteralPath $manifest -PathType Leaf) {
  try {
    $saved = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
    $existing = @($saved.allowed_origins | ForEach-Object {
      if ($_ -cmatch '^chrome-extension://([a-p]{32})/$') { $Matches[1] }
    })
  } catch { $existing = @() }
}
if ($existing.Count) { Write-Host "ID đang được Agent cho phép: $($existing -join ', ')" }
Write-Host 'Mở edge://extensions/ và sao chép ID của bản IT Support Toolkit cài từ Edge Add-ons.'
Write-Host 'Nếu dùng Chrome, lấy ID tại chrome://extensions/.'
$entered = (Read-Host 'Dán Extension ID (nếu có nhiều ID, ngăn cách bằng dấu phẩy)').Trim()
$newIds = @($entered -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if (!$newIds.Count) { throw 'Cần nhập Extension ID của bản vừa cài từ Edge Add-ons hoặc Chrome.' }
foreach ($id in $newIds) {
  if ($id -cnotmatch '^[a-p]{32}$') { throw "Extension ID không hợp lệ: $id" }
}
$ids = @($existing + $newIds | Select-Object -Unique)
& $installer -ExtensionIds $ids -AgentBinary $agent
Write-Host "Agent đã đăng ký Extension ID: $($ids -join ', ')"
