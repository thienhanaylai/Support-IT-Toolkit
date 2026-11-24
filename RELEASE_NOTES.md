# IT Support Toolkit v0.1.4 — Edge Add-ons & Windows x64

**Tải về:** `ITSupportToolkit-Windows.zip` là bộ cài Windows đầy đủ cho Chrome/Edge. Giải nén toàn bộ rồi chạy `Install.cmd`.

Gói `ITSupportToolkit-Edge-Store.zip` được dựng và kiểm tra riêng để nộp Microsoft Partner Center, **không đính kèm GitHub Release**. Local Agent không thay đổi trong phiên bản này; người dùng bản Edge Add-ons tiếp tục dùng bộ cài Agent v0.1.3 được liên kết trong extension.

## Thay đổi từ v0.1.3

- Làm lại trang Cài đặt theo từng nhóm rõ ràng và thêm lịch sử: tìm kiếm, xem chi tiết, xuất HTML, xóa có xác nhận.
- Chuyển cấu hình từ trang Dịch vụ sang Tạo computing: chỉ lấy CORE, RAM, Internet và STORAGE; điền lần lượt CPU → RAM → Internet → Disk, chờ từng cập nhật PrimeFaces và không tự bấm Tạo VM.
- Thêm nút **Thử lại** khi lấy Thông tin VM thất bại.
- Khi MXToolbox chưa có API key, popup cho nhập và lưu key UUID trước khi kiểm tra. DNS `example.com` vẫn dùng thử không cần key.
- Bỏ đoạn thông tin dài ở cuối trang Cài đặt.

## Kiểm tra

- 63/63 bài test extension đạt; TypeScript đạt.
- Build production, ZIP Edge Add-ons và ZIP Windows được kiểm tra cấu trúc/checksum trước khi phát hành.
- Đã đối chiếu bộ đọc/điền cấu hình với hai HTML Portal mẫu; chưa kiểm thử đầu-cuối trên phiên Portal đăng nhập thật.
