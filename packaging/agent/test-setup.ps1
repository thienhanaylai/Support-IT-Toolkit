$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA ('Temp\opencode\it-support-agent-test-' + [guid]::NewGuid().ToString('N'))
$savedLocal = $env:LOCALAPPDATA
$oldId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
$newId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
try {
  $env:LOCALAPPDATA = Join-Path $root 'user'
  $bundle = Join-Path $root 'bundle'
  New-Item -Path (Join-Path $bundle 'agent'), (Join-Path $env:LOCALAPPDATA 'ITSupportToolkit') -ItemType Directory -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'setup.ps1') -Destination $bundle
  Set-Content -LiteralPath (Join-Path $bundle 'agent\it-support-host.exe') -Value 'fake agent'
  Set-Content -LiteralPath (Join-Path $bundle 'install-agent.ps1') -Value @'
param([string[]]$ExtensionIds,[string]$AgentBinary)
[IO.File]::WriteAllText((Join-Path $env:LOCALAPPDATA 'registered.txt'), ($ExtensionIds -join ','))
'@
  @{ allowed_origins = @("chrome-extension://$oldId/") } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $env:LOCALAPPDATA 'ITSupportToolkit\com.itsupport.toolkit.json')
  function global:Read-Host { param([string]$Prompt) return $newId }
  & (Join-Path $bundle 'setup.ps1') 6>&1 | Out-Null
  if ((Get-Content -LiteralPath (Join-Path $env:LOCALAPPDATA 'registered.txt') -Raw) -ne "$oldId,$newId") {
    throw 'Installer did not preserve the existing ID and add the Edge Store ID.'
  }
  Write-Host 'Agent ID registration: PASS'
  Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA 'registered.txt')
  function global:Read-Host { param([string]$Prompt) return 'not-an-extension-id' }
  $failed = $false
  try { & (Join-Path $bundle 'setup.ps1') 6>&1 | Out-Null } catch { $failed = $true }
  if (!$failed -or (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'registered.txt'))) {
    throw 'Installer accepted an invalid Extension ID.'
  }
  Write-Host 'Invalid ID rejected: PASS'
  Remove-Item Function:Read-Host -ErrorAction SilentlyContinue

  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Install.cmd') -Destination $bundle
  [IO.File]::WriteAllText((Join-Path $bundle 'setup.ps1'), "Write-Host 'Đã đăng ký Agent'", (New-Object Text.UTF8Encoding($true)))
  [IO.File]::WriteAllText((Join-Path $root 'input.txt'), "x`r`n")
  $output = Join-Path $root 'output.txt'
  $process = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/c', "`"$(Join-Path $bundle 'Install.cmd')`"") `
    -RedirectStandardInput (Join-Path $root 'input.txt') -RedirectStandardOutput $output `
    -RedirectStandardError (Join-Path $root 'error.txt') -Wait -PassThru
  $text = (New-Object Text.UTF8Encoding($false, $true)).GetString([IO.File]::ReadAllBytes($output))
  if ($process.ExitCode -ne 0 -or !$text.Contains('CÀI LOCAL AGENT') -or
      !$text.Contains('Đã đăng ký Agent') -or !$text.Contains('Đã cài Agent')) {
    throw 'Install.cmd did not print readable Vietnamese or propagate success.'
  }
  Write-Host 'Agent CMD Vietnamese output: PASS'
} finally {
  $env:LOCALAPPDATA = $savedLocal
  Remove-Item Function:Read-Host -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
