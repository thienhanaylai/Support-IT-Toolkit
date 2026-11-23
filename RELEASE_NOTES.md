# IT Support Toolkit v0.1.0 — Windows x64

**Tải về:** `ITSupportToolkit-Windows.zip`. Bản phát hành này chỉ đính kèm ZIP cài Windows, **không** đính kèm gói Edge Add-ons hoặc EXE.

Gói gồm extension Manifest V3, Windows Local Agent và Native Messaging installer. `readme.txt` và `Install.cmd` nằm ở gốc ZIP; cần giải nén toàn bộ trước khi chạy `Install.cmd`. Khi cài lần đầu, chọn Chrome hoặc Edge (chỉ mở trình duyệt đã chọn), bật Developer mode, Load unpacked thư mục extension do trình cài hiển thị, rồi nhập Extension ID. Có thể nhập nhiều ID cách nhau bởi dấu phẩy. Chrome/Edge không cho tự bật extension unpacked mà không có bước xác nhận của người dùng.

Các công cụ gồm Ping, Traceroute, TCP Port, Quét Port, SSL/TLS, Mạng LAN, IP Public, MXToolbox, WHOIS Long Vân và đọc thông tin VM từ tab Portal khi người dùng yêu cầu. Một số công cụ cần Local Agent; MXToolbox cần API key cho hầu hết tên miền. Kết quả và cài đặt được lưu trên trình duyệt của người dùng; có thể tắt/xóa lịch sử.

**Kiểm tra trước phát hành:** 40/40 test extension và `go test ./...` đạt; toàn bộ 16 file extension trong ZIP khớp bản build. Chưa chạy cài đặt đầu-cuối trên profile Chrome/Edge thực tế. Gói chưa ký số.
