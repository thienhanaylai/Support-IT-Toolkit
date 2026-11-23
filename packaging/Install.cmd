@echo off
setlocal
chcp 65001 >nul
echo ==================================================
echo   CÀI ĐẶT IT SUPPORT TOOLKIT - WINDOWS
echo ==================================================
echo.
echo Bộ cài sẽ hỏi bạn chọn Chrome hoặc Edge và hướng dẫn
echo tải extension vào đúng trình duyệt đã chọn.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
set "installExit=%errorlevel%"
if not "%installExit%"=="0" (
  echo.
  echo Cài đặt chưa hoàn tất. Hãy xem thông báo lỗi phía trên.
  echo Nhấn phím bất kỳ để đóng cửa sổ...
  pause >nul
  exit /b %installExit%
)
echo.
echo Cài đặt hoàn tất. Nếu extension đã mở, hãy tải lại
echo extension trong trình duyệt bạn đã chọn.
echo Nhấn phím bất kỳ để đóng cửa sổ...
pause >nul
exit /b 0
