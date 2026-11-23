param(
  [Parameter(Mandatory = $true)][string[]]$ExtensionIds,
  [string]$AgentBinary
)
$ErrorActionPreference = 'Stop'
$hostName = 'com.itsupport.toolkit'
$installDir = Join-Path $env:LOCALAPPDATA 'ITSupportToolkit'
$exe = Join-Path $installDir 'it-support-host.exe'
$manifestPath = Join-Path $installDir "$hostName.json"
$repo = Split-Path $PSScriptRoot -Parent

foreach ($id in $ExtensionIds) {
  if ($id -cnotmatch '^[a-p]{32}$') { throw "Extension ID không hợp lệ: $id" }
}
New-Item -Path $installDir -ItemType Directory -Force | Out-Null
if ($AgentBinary) {
  if (!(Test-Path -LiteralPath $AgentBinary -PathType Leaf)) { throw "Không tìm thấy AgentBinary: $AgentBinary" }
  Copy-Item -LiteralPath $AgentBinary -Destination $exe -Force
} else {
  $go = (Get-Command go -ErrorAction SilentlyContinue).Source
  if (!$go -and (Test-Path 'C:\Program Files\Go\bin\go.exe')) { $go = 'C:\Program Files\Go\bin\go.exe' }
  if (!$go) { throw 'Chưa cài Go. Cài Go 1.22+ hoặc truyền -AgentBinary path\to\it-support-host.exe' }
  Push-Location (Join-Path $repo 'native-agent')
  try {
    & $go build -o $exe ./cmd/host
    if ($LASTEXITCODE -ne 0) { throw 'Build Agent thất bại' }
  } finally { Pop-Location }
}

$manifest = @{
  name = $hostName
  description = 'IT Support Toolkit Native Messaging Host'
  path = $exe
  type = 'stdio'
  allowed_origins = @($ExtensionIds | ForEach-Object { "chrome-extension://$_/" })
}
# Windows PowerShell 5.1 writes UTF-8 with BOM; Native Messaging requires plain UTF-8.
$json = $manifest | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($manifestPath, $json, (New-Object System.Text.UTF8Encoding($false)))
foreach ($browser in @('Google\Chrome', 'Microsoft\Edge')) {
  $key = "HKCU:\Software\$browser\NativeMessagingHosts\$hostName"
  New-Item -Path $key -Force | Out-Null
  Set-Item -Path $key -Value $manifestPath
}
Write-Host "Đã cài Native Agent tại $exe"
Write-Host 'Tải lại extension trong trình duyệt đã cài, sau đó thử Ping từ popup.'
