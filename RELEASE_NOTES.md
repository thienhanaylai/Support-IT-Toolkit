# IT Support Toolkit v0.2.2.6 — Theo dõi Portal theo tab

**Tải về:** dùng `ITSupportToolkit-Windows.exe` để cài hoặc cập nhật bằng một file, hoặc giải nén `ITSupportToolkit-Windows.zip` rồi chạy `Install.cmd`.

Gói `ITSupportToolkit-Edge-Store.zip` dùng để cập nhật Microsoft Edge Add-ons và được đính kèm trong GitHub Release này.

## Thay đổi từ v0.2.2.5

- Chỉ nhận Ticket thực sự mới: trạng thái `NEW/Mới` và chưa có người nhận ở cột **Trách nhiệm**.
- Nhận đúng trường hợp cột Trách nhiệm chỉ hiển thị thao tác **cập nhật**, không hiểu nhầm đây là tên người phụ trách.
- Mỗi nguồn Ticket/Computing dùng đúng một tab theo dõi; các tab làm việc khác không bị tải lại.
- Cho phép ghim, gỡ ghim tab; tự mở và ghim tab chuyên dụng khi chọn nguồn, Lưu hoặc Kiểm tra ngay.
- Không mở trùng tab khi chọn Ticket rồi chọn thêm Computing, kể cả lúc tab đầu tiên vẫn đang tải.
- Mặc định Theo dõi tắt và không chọn nguồn; tắt công tắc chính sẽ bỏ chọn các nguồn.
- Tích Ticket hoặc Computing sẽ tự bật Theo dõi và mở tab tương ứng ở chế độ nền.
- Tự tắt khi không còn tab theo dõi hợp lệ hoặc khi trình duyệt khởi động lại.
- Hiển thị bộ đếm và dùng lịch tải lại riêng cho từng tab Ticket/Computing.
- Chu kỳ 10–29 giây dùng timer trong content script; từ 30 giây dùng `chrome.alarms` riêng theo từng nguồn.
- Khôi phục khối sao chép cấu hình VM trên trang Dịch vụ và giữ nguyên cơ chế browser-only.

## Xác nhận đóng gói

- Manifest trong các gói là phiên bản **0.2.2.6**, không có `nativeMessaging`.
- Gói Edge Add-ons có `manifest.json` nằm ngay ở gốc ZIP và không chứa installer.
- Bộ cài Windows dùng launcher Go thuần, có kiểm tra `--verify`, cài mới và cập nhật đè.
- Bộ test **175/175** và production build đã đạt trước khi phát hành.

## SHA-256

SHA-256 được công bố trong `SHA256SUMS.txt` đính kèm GitHub Release.

## Ghi chú

- GitHub Release đính kèm bộ cài Windows, gói Edge Add-ons và `SHA256SUMS.txt`.
- Extension không tự nhấn **Lưu**, **Tạo VM** hay **Deploy**.
