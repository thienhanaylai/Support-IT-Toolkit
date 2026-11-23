# IT Support Toolkit v0.1.1 — Windows x64

**Tải về:** `ITSupportToolkit-Windows.zip`. Bản phát hành này chỉ đính kèm ZIP cài Windows, **không** đính kèm gói Edge Add-ons hoặc EXE. Extension bên trong vẫn là Manifest V3 phiên bản 0.1.0; v0.1.1 là bản cập nhật bộ cài Windows.

**Thay đổi từ v0.1.0:** `Install.cmd` và hướng dẫn cài đặt hiển thị tiếng Việt; có các bước riêng cho Chrome và Edge. Bộ cài không tự khởi chạy trang extension vì Chrome/Edge chuyển địa chỉ nội bộ từ dòng lệnh thành tab New Tab; thay vào đó, hướng dẫn nhập chính xác địa chỉ trong thanh địa chỉ. Các script PowerShell dùng mã hóa phù hợp Windows PowerShell 5.1 để không lỗi dấu tiếng Việt.

**Cài đặt:** giải nén toàn bộ ZIP, đọc `readme.txt` rồi chạy `Install.cmd`. Chọn Chrome hoặc Edge, tự nhập `chrome://extensions/` hoặc `edge://extensions/` vào thanh địa chỉ, bật Developer mode, Load unpacked thư mục extension do trình cài hiển thị và nhập Extension ID. Có thể nhập nhiều ID cách nhau bởi dấu phẩy. Chrome/Edge vẫn yêu cầu thao tác xác nhận Load unpacked lần đầu.

**Kiểm tra trước phát hành:** 40/40 test extension và `go test ./...` đạt; toàn bộ 16 file extension trong ZIP khớp bản build. Đã thử lựa chọn/hướng dẫn trong môi trường giả lập; chưa chạy cài đặt đầu-cuối trên profile Chrome/Edge thực tế. Gói chưa ký số.
