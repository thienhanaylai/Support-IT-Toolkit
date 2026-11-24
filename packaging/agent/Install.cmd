@echo off
setlocal
chcp 65001 >nul
echo ==================================================
echo   CÀI LOCAL AGENT CHO EXTENSION EDGE / CHROME
echo ==================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
set "installExit=%errorlevel%"
if not "%installExit%"=="0" (
  echo.
  echo Cài đặt chưa hoàn tất. Hãy xem thông báo lỗi ở trên.
  pause
  exit /b %installExit%
)
echo.
echo Đã cài Agent. Hãy tải lại extension rồi thử Ping.
pause
exit /b 0
