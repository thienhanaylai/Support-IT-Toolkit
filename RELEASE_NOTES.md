# IT Support Toolkit v0.1.5 — Portal & giao diện popup

**Tải về:** `ITSupportToolkit-Windows.zip` là bộ cài Windows đầy đủ cho Chrome/Edge. Giải nén toàn bộ rồi chạy `Install.cmd`. Có thể dùng `ITSupportToolkit-Windows.exe` để cài từ một file.

Gói `ITSupportToolkit-Edge-Store.zip` được dựng và kiểm tra riêng để tải lên Microsoft Partner Center, **không đính kèm GitHub Release**. Local Agent không thay đổi; người dùng bản Edge Add-ons tiếp tục dùng ZIP Agent v0.1.3 được liên kết trong extension.

## Thay đổi từ v0.1.4

- Thêm **Tạo mật khẩu** bằng Web Crypto: chọn nhóm ký tự, độ dài, ký tự loại trừ, sao chép và xem tối đa ba mật khẩu gần nhất trong phiên.
- Sắp xếp lại popup thành các nhóm Tạo mật khẩu, Công cụ dùng Domain/IP, Thông tin VM và Thông tin mạng.
- Hiển thị tiến trình, lỗi và kết quả ngay trong đúng nhóm công cụ; khi mở mục Gần đây, kết quả tự chuyển tới nhóm tương ứng.
- Thêm quyền Portal tùy chọn, có thể cấp/thu hồi từ trang chào mừng và Cài đặt; content script Portal được đăng ký động.
- Chèn nút sao chép cấu hình tại trang Dịch vụ và dán tại trang Tạo computing; chỉ điền CPU → RAM → Internet → Disk, không tự lưu/tạo VM.
- Hỗ trợ CORE/CPU, nhiều mã STORAGE gồm NVME_PRO_STORAGE và ánh xạ an toàn sang tùy chọn NVMe tương thích trên form tạo VM.
- Gia cố lọc dữ liệu nhạy cảm khỏi lịch sử/báo cáo và hạn chế content script truy cập storage khi Chromium hỗ trợ.
- Trang chào mừng và Cài đặt chỉ liên kết ZIP Agent, không tải riêng `Install.cmd`.

## Kiểm tra

- 86/86 bài test extension đạt; TypeScript và production build đạt.
- `go test ./...` của Windows Local Agent đạt.
- Gói Edge Add-ons và bộ cài Windows được kiểm tra cấu trúc và SHA-256 khi đóng gói.
- HTML Portal mẫu và thư mục build/release bị loại khỏi Git; không đưa dữ liệu Portal nội bộ vào gói phát hành.
