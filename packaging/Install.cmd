@echo off
setlocal
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
if errorlevel 1 (
  echo.
  echo Installation did not finish. See the error above.
  pause
  exit /b 1
)
echo.
echo Installation finished. Reload the extension in the selected browser if it was already open.
pause
