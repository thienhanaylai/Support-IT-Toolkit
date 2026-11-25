# IT Support Toolkit v0.1.6 — IP Public và công cụ Portal

**Tải về:** `ITSupportToolkit-Windows.zip` là bộ cài Windows đầy đủ cho Chrome/Edge. Giải nén toàn bộ rồi chạy `Install.cmd`. Có thể dùng `ITSupportToolkit-Windows.exe` để cài từ một file.

Release này phát hành bộ cài Windows đầy đủ và ZIP Agent độc lập. **Không dựng và không đính kèm gói Edge Add-ons.**

## Thay đổi từ v0.1.5

- Chuyển **IP Public** sang Windows Local Agent chạy lệnh cố định `curl.exe` tới `https://ifconfig.me/ip`; kiểm tra kết quả IPv4/IPv6 và bỏ quyền host ipify cũ.
- Cải thiện trình cài: tự sao chép đường dẫn extension và mở sẵn thư mục để Load unpacked.
- Thêm **Tạo mật khẩu** ngay trên trang Tạo computing, dùng chung tùy chọn GenPass, có popover tùy chọn, lưu cấu hình, hiển thị/copy mật khẩu và hoạt động cả khi ô Password đang hiện.
- Khi dán cấu hình VM, đối chiếu OS với Template và Site Provider với Khu vực; báo đỏ nếu sai nhưng không tự thay đổi hai trường này.
- Tiếp tục chỉ tự điền CPU → RAM → Internet → Disk; không tự bấm Lưu/Tạo VM.

## Kiểm tra

- 94/94 bài test extension đạt; TypeScript và production build đạt.
- `go test ./...` của Windows Local Agent đạt.
- Bộ cài ZIP/EXE Windows được kiểm tra cấu trúc, tự giải nén và SHA-256.
- Không đóng gói add-on/store trong lần phát hành này.
