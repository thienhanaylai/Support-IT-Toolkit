$ErrorActionPreference = 'Stop'
$hostName = 'com.itsupport.toolkit'
$installDir = Join-Path $env:LOCALAPPDATA 'ITSupportToolkit'
$manifestPath = Join-Path $installDir "$hostName.json"
foreach ($browser in @('Google\Chrome', 'Microsoft\Edge')) {
  $key = "HKCU:\Software\$browser\NativeMessagingHosts\$hostName"
  if (Test-Path $key) {
    $registered = (Get-Item $key).GetValue('')
    if ($registered -eq $manifestPath) { Remove-Item $key -Force }
  }
}
foreach ($file in @($manifestPath, (Join-Path $installDir 'it-support-host.exe'))) {
  if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
}
if ((Test-Path $installDir) -and !(Get-ChildItem -LiteralPath $installDir -Force | Select-Object -First 1)) {
  Remove-Item -LiteralPath $installDir
}
Write-Host 'Đã gỡ Native Agent. Lịch sử trong extension không bị xóa.'
