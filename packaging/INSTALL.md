# Cài IT Support Toolkit trên Windows

Gói này được build cho **Windows 10/11 x64** với Chrome hoặc Edge.

**Dùng một file:** mở `ITSupportToolkit-Windows.exe`. Không cần giải nén, Node.js, Go hoặc quyền Administrator. File tự giải nén vào thư mục tạm, chạy trình cài và xóa thư mục tạm sau khi kết thúc.

1. Lần đầu, trình cài chép extension vào `%LOCALAPPDATA%\ITSupportToolkit\extension` và hỏi chọn **Chrome**, **Edge** hoặc **xem hướng dẫn cho cả hai**. Bộ cài không tự mở trang nội bộ vì Chrome/Edge chỉ tạo tab New Tab khi nhận địa chỉ `chrome://`/`edge://` từ dòng lệnh. Hãy tự nhập địa chỉ của trình duyệt đã chọn vào thanh địa chỉ và nhấn Enter:
   - **Chrome:** vào `chrome://extensions/`, bật **Developer mode** ở góc trên bên phải, bấm **Load unpacked** ở góc trên bên trái.
   - **Edge:** vào `edge://extensions/`, bật **Developer mode** ở thanh bên trái, bấm **Load unpacked**.
   - Chọn đúng thư mục `%LOCALAPPDATA%\ITSupportToolkit\extension`.
2. Sao chép **Extension ID** 32 ký tự hiện trên trang quản lý, dán vào cửa sổ cài và nhấn Enter. Nếu cài trên cả Chrome lẫn Edge, nhập hai ID cách nhau bởi dấu phẩy.
3. Tải lại extension và thử Ping. Những lần cập nhật sau, chỉ mở file EXE mới: bộ cài dùng lại các ID đã đăng ký nếu extension vẫn ở cùng thư mục; tải lại extension trong trình duyệt sau khi cập nhật.

**Phương án ZIP cài tay:** giải nén toàn bộ `ITSupportToolkit-Windows.zip`, đọc `readme.txt`, chạy `Install.cmd` và làm theo cùng các bước trên. Nếu muốn đăng ký Agent cho cả hai trình duyệt, nhập cả hai ID cách nhau bởi dấu phẩy.

Trình cài đăng ký Windows Local Agent cho ID vừa nhập, không chạy service hay mở cổng mạng. **Không thể tự động bật/tải extension unpacked trong Chrome/Edge trên máy cá nhân**: trình duyệt yêu cầu thao tác của người dùng lần đầu. Nếu cần cài âm thầm hoàn toàn, phải xuất bản extension lên Chrome Web Store/Edge Add-ons hoặc triển khai qua chính sách trình duyệt do quản trị viên quản lý; file EXE này không thay đổi chính sách. Không đổi tên/di chuyển thư mục extension trong `%LOCALAPPDATA%`. Nếu đã tải extension phiên bản cũ từ thư mục khác, sau khi bản mới hoạt động hãy gỡ bản cũ trong trang extension để tránh trùng icon.

Không gửi/chạy file cài từ nguồn không tin cậy. Gói chưa được ký số; Windows có thể cảnh báo. API key MXToolbox, BKNS cũ (WHOIS không còn dùng) và lịch sử nằm trong dữ liệu của **Extension ID cũ**, không tự chuyển sang ID mới.
