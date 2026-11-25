# Cài IT Support Toolkit trên Windows

Gói này được build cho **Windows 10/11 x64** với Chrome hoặc Edge.

**Dùng một file:** mở `ITSupportToolkit-Windows.exe`. Không cần giải nén, Node.js, Go hoặc quyền Administrator. File tự giải nén vào thư mục tạm, chạy trình cài và xóa thư mục tạm sau khi kết thúc.

1. Lần đầu, trình cài chép extension vào `%LOCALAPPDATA%\ITSupportToolkit\extension` và hỏi chọn **Chrome**, **Edge** hoặc **cả hai**. Bộ cài mở cửa sổ trình duyệt mới, dùng UI Automation để nhập trang quản lý extension vào thanh địa chỉ và điều hướng tự động. Nếu thao tác này thất bại, hãy mở địa chỉ thủ công:
   - **Chrome:** vào `chrome://extensions/`, bật **Developer mode** ở góc trên bên phải, bấm **Load unpacked** ở góc trên bên trái.
   - **Edge:** vào `edge://extensions/`, bật **Developer mode** ở thanh bên trái, bấm **Load unpacked**.
   - Chọn đúng thư mục `%LOCALAPPDATA%\ITSupportToolkit\extension`.
2. Sao chép **Extension ID** 32 ký tự hiện trên trang quản lý, dán vào cửa sổ cài và nhấn Enter. Nếu cài trên cả Chrome lẫn Edge, nhập hai ID cách nhau bởi dấu phẩy.
3. Tải lại extension và thử Ping. Bản Load unpacked/dev không tự kiểm tra hoặc tải bản mới. Những lần cập nhật sau, mở file EXE mới hoặc chạy `Install.cmd` từ ZIP mới. Bộ cài dùng lại các ID đã đăng ký nếu extension vẫn ở cùng thư mục, cập nhật cả extension + Agent và dọn bundle build cũ. Không gỡ extension và không bấm Load unpacked lần nữa. Mở `chrome://extensions/` hoặc `edge://extensions/`, bấm **Reload/Tải lại** trên thẻ IT Support Toolkit, rồi refresh các tab Portal đang mở.

**Phương án ZIP cài tay:** giải nén toàn bộ `ITSupportToolkit-Windows.zip`, đọc `readme.txt`, chạy `Install.cmd` và làm theo cùng các bước trên. Nếu muốn đăng ký Agent cho cả hai trình duyệt, nhập cả hai ID cách nhau bởi dấu phẩy.

Trình cài đăng ký Windows Local Agent cho ID vừa nhập, không chạy service hay mở cổng mạng. **Không thể tự động bấm Reload cho extension unpacked trong Chrome/Edge trên máy cá nhân**. Nếu cần cập nhật âm thầm hoàn toàn, phải xuất bản extension lên Chrome Web Store/Edge Add-ons hoặc triển khai qua chính sách trình duyệt do quản trị viên quản lý; file EXE này không thay đổi chính sách. Không đổi tên/di chuyển thư mục extension trong `%LOCALAPPDATA%`. Nếu đã tải extension phiên bản cũ từ thư mục khác, sau khi bản mới hoạt động hãy gỡ bản cũ trong trang extension để tránh trùng icon.

Không gửi/chạy file cài từ nguồn không tin cậy. Gói chưa được ký số; Windows có thể cảnh báo. Khi cập nhật đúng thư mục và giữ nguyên Extension ID, `chrome.storage.local` được giữ nguyên nên Authenticator, lịch sử, API key và tùy chọn vẫn còn. Mật khẩu gần đây và cấu hình VM tạm nằm trong `chrome.storage.session`, có thể mất khi reload/khởi động lại trình duyệt. Nếu Extension ID thay đổi, dữ liệu của ID cũ không tự chuyển sang ID mới.
