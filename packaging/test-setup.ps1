$ErrorActionPreference = 'Stop'
$source = $PSScriptRoot
$root = Join-Path $env:LOCALAPPDATA ('Temp\opencode\it-support-setup-test-' + [guid]::NewGuid().ToString('N'))
$savedLocal = $env:LOCALAPPDATA
$savedProgramFiles = $env:ProgramFiles
$savedProgramFilesX86 = ${env:ProgramFiles(x86)}

try {
  New-Item -Path $root -ItemType Directory -Force | Out-Null
  $global:copiedPaths = @()
  $global:openedPaths = @()
  function global:Set-Clipboard {
    [CmdletBinding()]
    param([string]$Value)
    $global:copiedPaths += $Value
  }
  function global:Start-Process {
    [CmdletBinding()]
    param(
      [string]$FilePath,
      [object[]]$ArgumentList,
      [switch]$Wait,
      [switch]$PassThru
    )
    $global:openedPaths += "$FilePath|$($ArgumentList -join ' ')"
    if ($PassThru) { return [pscustomobject]@{ ExitCode = 0 } }
  }
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
    New-Item -Path (Join-Path $bundle 'extension') -ItemType Directory -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $source 'setup.ps1') -Destination $bundle
    Set-Content -LiteralPath (Join-Path $bundle 'extension\manifest.json') -Value '{}'
    $global:answers = @($test.choice)
    $openedBefore = $global:openedPaths.Count
    $output = & (Join-Path $bundle 'setup.ps1') 6>&1 | Out-String
    if ($global:answers.Count -ne 0) { throw "Unused prompt answers for $($test.browser)" }
    $expectedPath = Join-Path $env:LOCALAPPDATA 'ITSupportToolkit\extension'
    $opened = @($global:openedPaths | Select-Object -Skip $openedBefore)
    if ($global:copiedPaths[-1] -ne $expectedPath -or !($opened | Where-Object { $_ -like "explorer.exe|*$expectedPath*" })) {
      throw "Installer did not copy and open the extension path for $($test.browser)"
    }
    $navigation = @($opened | Where-Object { $_ -like 'powershell.exe|*' })
    $expectedNavigationCount = if ($test.browser -eq 'None') { 2 } else { 1 }
    if ($navigation.Count -ne $expectedNavigationCount) {
      throw "Installer did not launch the expected browser navigation for $($test.browser)"
    }
    $decodedScripts = @($navigation | ForEach-Object {
      $encoded = ($_ -split ' ')[-1]
      [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($encoded))
    })
    if ($navigation | Where-Object { $_ -notmatch '\|-NoProfile -STA -EncodedCommand ' }) {
      throw "Browser navigation did not use PowerShell STA for $($test.browser)"
    }
    if ($test.browser -eq 'Chrome' -and
        !($decodedScripts | Where-Object { $_.Contains("'chrome.exe'") -and $_.Contains("'chrome://extensions/'") })) {
      throw 'Chrome navigation script is missing its executable or extension page.'
    }
    if ($test.browser -eq 'Edge' -and
        !($decodedScripts | Where-Object { $_.Contains("'msedge.exe'") -and $_.Contains("'edge://extensions/'") })) {
      throw 'Edge navigation script is missing its executable or extension page.'
    }
    if ($test.browser -eq 'None' -and
        (!($decodedScripts | Where-Object { $_.Contains("'chrome.exe'") -and $_.Contains("'chrome://extensions/'") }) -or
         !($decodedScripts | Where-Object { $_.Contains("'msedge.exe'") -and $_.Contains("'edge://extensions/'") }))) {
      throw 'Both-browser choice did not create Chrome and Edge navigation scripts.'
    }
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
      if (!$output.Contains('Ctrl+L, Ctrl+V') -or !$output.Contains('Chọn thư mục')) {
        throw "Missing paste-path instructions for $($test.browser)"
      }
    }
    Write-Host "Installer $($test.browser): PASS"
  }

  $env:LOCALAPPDATA = Join-Path $root 'update'
  $updateBundle = Join-Path $env:LOCALAPPDATA 'bundle'
  $updateSource = Join-Path $updateBundle 'extension'
  $updateInstalled = Join-Path $env:LOCALAPPDATA 'ITSupportToolkit\extension'
  New-Item -Path (Join-Path $updateSource 'assets'), (Join-Path $updateInstalled 'assets') -ItemType Directory -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $source 'setup.ps1') -Destination $updateBundle
  Set-Content -LiteralPath (Join-Path $updateSource 'manifest.json') -Value '{"version":"0.2.1"}'
  Set-Content -LiteralPath (Join-Path $updateSource 'assets\current.js') -Value 'current bundle'
  Set-Content -LiteralPath (Join-Path $updateInstalled 'manifest.json') -Value '{"version":"0.1.6"}'
  Set-Content -LiteralPath (Join-Path $updateInstalled 'assets\stale.js') -Value 'stale bundle'
  Set-Content -LiteralPath (Join-Path $updateInstalled '.it-support-toolkit-installed') -Value 'IT Support Toolkit installer'
  $global:answers = @()
  $updateOutput = & (Join-Path $updateBundle 'setup.ps1') -ReuseExistingIds -SkipOpenExtensionFolder 6>&1 | Out-String
  if (Test-Path -LiteralPath (Join-Path $updateInstalled 'assets\stale.js')) {
    throw 'Dev update did not remove a stale extension bundle.'
  }
  if (!(Test-Path -LiteralPath (Join-Path $updateInstalled 'assets\current.js')) -or
      !(Test-Path -LiteralPath (Join-Path $updateInstalled '.it-support-toolkit-installed'))) {
    throw 'Dev update did not install the current bundle or preserve its installer marker.'
  }
  if (!$updateOutput.Contains('0.1.6 -> 0.2.1') -or !$updateOutput.Contains('Không gỡ hoặc Load unpacked lại') -or
      !$updateOutput.Contains('chrome://extensions/') -or !$updateOutput.Contains('edge://extensions/')) {
    throw 'Dev update instructions are incomplete.'
  }
  Write-Host 'Installer dev update: PASS'

  $cmdBundle = Join-Path $root 'cmd'
  New-Item -Path $cmdBundle -ItemType Directory -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $source 'Install.cmd') -Destination $cmdBundle
  [IO.File]::WriteAllText((Join-Path $cmdBundle 'setup.ps1'), "param([switch]`$ReuseExistingIds); if (!`$ReuseExistingIds) { throw 'missing update flag' }; Write-Host 'HƯỚNG DẪN MICROSOFT EDGE'", (New-Object Text.UTF8Encoding($true)))
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
  Remove-Item Function:Set-Clipboard -ErrorAction SilentlyContinue
  Remove-Item Function:Start-Process -ErrorAction SilentlyContinue
  Remove-Variable answers -Scope Global -ErrorAction SilentlyContinue
  Remove-Variable copiedPaths -Scope Global -ErrorAction SilentlyContinue
  Remove-Variable openedPaths -Scope Global -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
