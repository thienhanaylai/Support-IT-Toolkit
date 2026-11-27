IT SUPPORT TOOLKIT - GÓI CÀI THỦ CÔNG TRÊN WINDOWS
=================================================

Đây là gói cài cho Windows 10/11 x64. Không tải ZIP này lên Edge Add-ons.

Cách cài từ ZIP:
1. Giải nén toàn bộ ITSupportToolkit-Windows.zip.
2. Chạy Install.cmd trong thư mục vừa giải nén.
3. Chọn Chrome, Edge hoặc cả hai trình duyệt. Bộ cài tự mở cửa sổ
   trình duyệt mới và điều hướng đến trang quản lý extension:
   - Chrome: chrome://extensions/; bật Developer mode ở góc trên
     bên phải, nhấn Load unpacked ở góc trên bên trái.
   - Edge: edge://extensions/; bật Developer mode ở thanh bên
     trái, nhấn Load unpacked.
   Nếu tự động điều hướng thất bại, hãy nhập địa chỉ trên thủ công.
4. Chọn thư mục hiện trong cửa sổ cài:
   %LOCALAPPDATA%\ITSupportToolkit\extension
   Bộ cài tự sao chép đường dẫn này vào clipboard và mở sẵn thư mục.
   Trong cửa sổ Load unpacked, có thể nhấn Ctrl+L, Ctrl+V, Enter rồi
   nhấn Chọn thư mục (Select Folder).
5. Tải lại extension, sau đó thử IP Public, HTTP Ping hoặc DNS over HTTPS.

ITSupportToolkit-Windows.exe là lựa chọn một file, không cần giải nén;
EXE chép trực tiếp extension vào thư mục cài, không gọi PowerShell, không chạy
script tạm, không dùng UI Automation và không tải mã từ mạng. Lần cài mới vẫn
cần tự mở trang quản lý extension và chọn Load unpacked.
Khi cập nhật trên cùng máy, EXE hoặc Install.cmd từ ZIP mới cập nhật extension.
Không gỡ hoặc Load unpacked
lại. Mở chrome://extensions/ hoặc edge://extensions/, bấm Reload/Tải lại
trên thẻ IT Support Toolkit, rồi refresh các tab Portal đang mở.

Giữ nguyên thư mục và Extension ID sẽ giữ Authenticator, lịch sử
và tùy chọn. Dữ liệu tạm trong phiên có thể mất khi tải lại trình duyệt.

Gói chỉ gồm extension Browser-only và trình cài extension; không có Agent,
Native Messaging, service hoặc chương trình kiểm tra mạng native.
Không cần Node.js/Go hoặc quyền Administrator để cài. Không chạy bộ cài
từ nguồn không tin cậy; EXE chưa được ký số nên Windows có thể cảnh báo.

Lưu ý: trình duyệt không cho tự bật extension unpacked chỉ bằng một click.
