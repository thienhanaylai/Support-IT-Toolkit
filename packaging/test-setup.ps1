$ErrorActionPreference = 'Stop'
$source = $PSScriptRoot
$root = Join-Path $env:LOCALAPPDATA ('Temp\opencode\it-support-setup-test-' + [guid]::NewGuid().ToString('N'))
$savedLocal = $env:LOCALAPPDATA
$savedProgramFiles = $env:ProgramFiles
$savedProgramFilesX86 = ${env:ProgramFiles(x86)}
$id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

try {
  New-Item -Path $root -ItemType Directory -Force | Out-Null
  function global:Read-Host {
    param([string]$Prompt)
    if (!$global:answers.Count) { throw 'Unexpected installer prompt.' }
    $answer = $global:answers[0]
    $global:answers = @($global:answers | Select-Object -Skip 1)
    return $answer
  }

  foreach ($test in @(
    @{ choice = '1'; browser = 'Chrome'; page = 'chrome://extensions/' },
    @{ choice = '2'; browser = 'Edge'; page = 'edge://extensions/' },
    @{ choice = '3'; browser = 'None'; page = '' }
  )) {
    $env:LOCALAPPDATA = Join-Path $root $test.choice
    $bundle = Join-Path $env:LOCALAPPDATA 'bundle'
    New-Item -Path (Join-Path $bundle 'extension'), (Join-Path $bundle 'agent') -ItemType Directory -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $source 'setup.ps1') -Destination $bundle
    Set-Content -LiteralPath (Join-Path $bundle 'extension\manifest.json') -Value '{}'
    Set-Content -LiteralPath (Join-Path $bundle 'agent\it-support-host.exe') -Value 'test agent'
    Set-Content -LiteralPath (Join-Path $bundle 'install-agent.ps1') -Value 'param([string[]]$ExtensionIds,[string]$AgentBinary) [IO.File]::WriteAllText((Join-Path $env:LOCALAPPDATA "ids.txt"),($ExtensionIds -join ","))'
    $global:answers = @($test.choice, $id)
    $output = & (Join-Path $bundle 'setup.ps1') 6>&1 | Out-String
    if ((Get-Content -LiteralPath (Join-Path $env:LOCALAPPDATA 'ids.txt') -Raw) -ne $id) {
      throw "Wrong Extension ID for $($test.browser)"
    }
    if ($global:answers.Count -ne 0) { throw "Unused prompt answers for $($test.browser)" }
    if ($test.browser -eq 'None') {
      if (!$output.Contains('chrome://extensions/') -or !$output.Contains('edge://extensions/')) {
        throw 'None should show instructions for both browsers.'
      }
    } else {
      $heading = if ($test.browser -eq 'Chrome') { 'HƯỚNG DẪN GOOGLE CHROME' } else { 'HƯỚNG DẪN MICROSOFT EDGE' }
      $otherPage = if ($test.browser -eq 'Chrome') { 'edge://extensions/' } else { 'chrome://extensions/' }
      if (!$output.Contains($heading) -or !$output.Contains($test.page) -or $output.Contains($otherPage)) {
        throw "Missing localized instructions for $($test.browser)"
      }
    }
    Write-Host "Installer $($test.browser): PASS"
  }

  $cmdBundle = Join-Path $root 'cmd'
  New-Item -Path $cmdBundle -ItemType Directory -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $source 'Install.cmd') -Destination $cmdBundle
  [IO.File]::WriteAllText((Join-Path $cmdBundle 'setup.ps1'), "Write-Host 'HƯỚNG DẪN MICROSOFT EDGE'", (New-Object Text.UTF8Encoding($true)))
  [IO.File]::WriteAllText((Join-Path $cmdBundle 'input.txt'), "x`r`n")
  $cmdPath = Join-Path $cmdBundle 'Install.cmd'
  $outputPath = Join-Path $cmdBundle 'output.txt'
  $process = Microsoft.PowerShell.Management\Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/c', "`"$cmdPath`"") `
    -RedirectStandardInput (Join-Path $cmdBundle 'input.txt') -RedirectStandardOutput $outputPath -Wait -PassThru
  $text = (New-Object Text.UTF8Encoding($false, $true)).GetString([IO.File]::ReadAllBytes($outputPath))
  if ($process.ExitCode -ne 0 -or !$text.Contains('CÀI ĐẶT IT SUPPORT TOOLKIT') -or
      !$text.Contains('HƯỚNG DẪN MICROSOFT EDGE') -or !$text.Contains('Cài đặt hoàn tất')) {
    throw 'Install.cmd did not output readable Vietnamese UTF-8.'
  }
  Write-Host 'Installer CMD UTF-8: PASS'

  [IO.File]::WriteAllText((Join-Path $cmdBundle 'setup.ps1'), "throw 'test error'", (New-Object Text.UTF8Encoding($true)))
  $errorOutput = Join-Path $cmdBundle 'error-output.txt'
  $failed = Microsoft.PowerShell.Management\Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/c', "`"$cmdPath`"") `
    -RedirectStandardInput (Join-Path $cmdBundle 'input.txt') -RedirectStandardOutput $errorOutput `
    -RedirectStandardError (Join-Path $cmdBundle 'error-log.txt') -Wait -PassThru
  $errorText = (New-Object Text.UTF8Encoding($false, $true)).GetString([IO.File]::ReadAllBytes($errorOutput))
  if ($failed.ExitCode -eq 0 -or !$errorText.Contains('Cài đặt chưa hoàn tất')) {
    throw 'Install.cmd did not report a failed installation correctly.'
  }
  Write-Host 'Installer CMD failure handling: PASS'
} finally {
  $env:LOCALAPPDATA = $savedLocal
  $env:ProgramFiles = $savedProgramFiles
  ${env:ProgramFiles(x86)} = $savedProgramFilesX86
  Remove-Item Function:Read-Host -ErrorAction SilentlyContinue
  Remove-Variable answers -Scope Global -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
