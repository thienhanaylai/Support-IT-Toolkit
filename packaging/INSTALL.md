# Cài IT Support Toolkit trên Windows

Gói này được build cho **Windows 10/11 x64** với Chrome hoặc Edge.

**Dùng một file:** mở `ITSupportToolkit-Windows.exe`. Không cần giải nén, Node.js, Go, PowerShell hoặc quyền Administrator. EXE chỉ chứa các file extension production và chép trực tiếp vào thư mục cài; nó không giải nén/chạy script trong thư mục tạm, không tải mã từ mạng và không tự điều khiển trình duyệt.

1. Trình cài chép extension vào `%LOCALAPPDATA%\ITSupportToolkit\extension` và hiển thị đường dẫn cần chọn. Sau đó mở trang quản lý extension thủ công:
   - **Chrome:** vào `chrome://extensions/`, bật **Developer mode** ở góc trên bên phải, bấm **Load unpacked** ở góc trên bên trái.
   - **Edge:** vào `edge://extensions/`, bật **Developer mode** ở thanh bên trái, bấm **Load unpacked**.
   - Chọn đúng thư mục `%LOCALAPPDATA%\ITSupportToolkit\extension`.
2. Tải lại extension và thử IP Public, HTTP Ping hoặc DNS over HTTPS. Bản Load unpacked/dev không tự kiểm tra hoặc tải bản mới. Những lần cập nhật sau, mở file EXE mới hoặc chạy `Install.cmd` từ ZIP mới. Bộ cài cập nhật extension ở cùng thư mục và dọn bundle build cũ. Không gỡ extension và không bấm Load unpacked lần nữa. Mở `chrome://extensions/` hoặc `edge://extensions/`, bấm **Reload/Tải lại** trên thẻ IT Support Toolkit, rồi refresh các tab Portal đang mở.

**Phương án ZIP cài tay:** giải nén toàn bộ `ITSupportToolkit-Windows.zip`, đọc `readme.txt`, chạy `Install.cmd` và làm theo hướng dẫn. Gói ZIP dùng script PowerShell có mã nguồn đọc được; script có thể mở sẵn trình duyệt, thư mục extension và sao chép đường dẫn để hỗ trợ thao tác Load unpacked.

Trình cài không cài Local Agent, không đăng ký Native Messaging, không chạy service và không mở cổng mạng. **Không thể tự động bấm Reload cho extension unpacked trong Chrome/Edge trên máy cá nhân**. Nếu cần cập nhật âm thầm hoàn toàn, phải xuất bản extension lên Chrome Web Store/Edge Add-ons hoặc triển khai qua chính sách trình duyệt do quản trị viên quản lý; file EXE này không thay đổi chính sách. Không đổi tên/di chuyển thư mục extension trong `%LOCALAPPDATA%`. Nếu đã tải extension phiên bản cũ từ thư mục khác, sau khi bản mới hoạt động hãy gỡ bản cũ trong trang extension để tránh trùng icon.

Không gửi/chạy file cài từ nguồn không tin cậy. Gói chưa được ký số; Windows có thể cảnh báo. Khi cập nhật đúng thư mục và giữ nguyên Extension ID, `chrome.storage.local` được giữ nguyên nên Authenticator, lịch sử và tùy chọn vẫn còn. Mật khẩu gần đây và cấu hình VM tạm nằm trong `chrome.storage.session`, có thể mất khi reload/khởi động lại trình duyệt. Nếu Extension ID thay đổi, dữ liệu của ID cũ không tự chuyển sang ID mới.
