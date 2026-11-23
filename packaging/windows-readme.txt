IT SUPPORT TOOLKIT - GÓI CÀI THỦ CÔNG TRÊN WINDOWS
=================================================

Đây là gói cài cho Windows 10/11 x64. Không tải ZIP này lên Edge Add-ons.

Cách cài từ ZIP:
1. Giải nén toàn bộ ITSupportToolkit-Windows.zip.
2. Chạy Install.cmd trong thư mục vừa giải nén.
3. Chọn Chrome hoặc Edge. Trình cài chỉ mở trang quản lý extension
   của trình duyệt được chọn. Có thể chọn không mở trình duyệt.
4. Trong trang extension, bật Developer mode > Load unpacked rồi
   chọn thư mục hiện trong cửa sổ cài:
   %LOCALAPPDATA%\ITSupportToolkit\extension
5. Sao chép Extension ID trên trang quản lý, dán vào cửa sổ cài
   rồi nhấn Enter. Nếu cần đăng ký cả hai trình duyệt, nhập
   cả hai ID cách nhau bằng dấu phẩy.
6. Tải lại extension, sau đó thử Ping.

ITSupportToolkit-Windows.exe là lựa chọn một file, không cần giải nén;
lần cài mới vẫn cần chọn trình duyệt, Load unpacked và nhập ID.
Khi cập nhật trên cùng máy, EXE dùng lại ID đã đăng ký; tải lại extension.

Gói gồm extension, Windows Local Agent và bộ cài Native Messaging.
Không cần Node.js/Go hoặc quyền Administrator để cài. Không chạy bộ cài
từ nguồn không tin cậy; EXE chưa được ký số nên Windows có thể cảnh báo.

Lưu ý: trình duyệt không cho tự bật extension unpacked chỉ bằng một click.
Nếu đã cài bản trên Edge Add-ons, cần đăng ký đúng ID của bản trên chợ.
