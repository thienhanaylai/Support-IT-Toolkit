# IT Support Toolkit v0.2.2.5 — Theo dõi Portal và thông báo Windows

**Tải về:** dùng `ITSupportToolkit-Windows.exe` để cài hoặc cập nhật bằng một file, hoặc giải nén `ITSupportToolkit-Windows.zip` rồi chạy `Install.cmd`.

Gói `ITSupportToolkit-Edge-Store.zip` dùng để cập nhật Microsoft Edge Add-ons và được đính kèm trong GitHub Release này.

## Thay đổi từ v0.2.2.4

- Thêm tab **Theo dõi** cho Ticket `NEW` và Computing có trạng thái chính xác **Triển khai lỗi**.
- Tự tải lại các tab Portal đang mở theo chu kỳ tùy chỉnh; tối thiểu 10 giây và hỗ trợ nút tăng/giảm 5 giây.
- Dùng timer trong content script cho chu kỳ 10–29 giây và `chrome.alarms` từ 30 giây trở lên.
- Gửi Windows Notification, hiển thị badge chưa đọc và chống thông báo trùng theo từng Portal ID.
- Thêm công tắc chuông riêng cho Ticket và VM lỗi: xanh là bật, đỏ là tắt; bật lại sẽ báo ngay nếu đang có mục cần xử lý.
- Cho phép mở trang chi tiết và tự xóa thông báo, xóa riêng từng mục hoặc xóa tất cả mà không làm mất dấu vết chống báo lặp.
- Lưu cảnh báo Theo dõi vào **Lịch sử hoạt động**, xuất HTML và chỉ giữ tối đa 50 bản ghi gần nhất.
- Xác thực bộ lọc Computing lỗi từ DOM và chỉ chấp nhận từng dòng có trạng thái chính xác **Triển khai lỗi**.
- Cải thiện giao diện Theo dõi, badge nguồn, trạng thái bật/tắt và hỗ trợ theme Sáng/Tối.
- Khi mở công cụ từ menu ngữ cảnh, popup tự chuyển sang tab **Công cụ** để hiển thị mục tiêu đã chọn.

## Xác nhận đóng gói

- Manifest trong các gói là phiên bản **0.2.2.5**, không có `nativeMessaging`.
- Gói Edge Add-ons có `manifest.json` nằm ngay ở gốc ZIP và không chứa installer.
- Bộ cài Windows dùng launcher Go thuần, đã chạy kiểm tra `--verify`, cài mới và cập nhật đè thành công.
- Bộ test **169/169** và production build đã đạt trước khi phát hành.

## SHA-256

- `ITSupportToolkit-Windows.zip`: `A28351A7CA109760905A75F358FD9CFA39E99ED1F02331827C2AD366B871B068`
- `ITSupportToolkit-Windows.exe`: `1B5E294B16A1883F82AF5F0178AB0AC53DEB89FBFD066664920CD8C4BD2A4AFE`
- `ITSupportToolkit-Edge-Store.zip`: `312DA9376321E7B20056B28286AB8963B5DB197838376B56B4CD27513C882091`

## Ghi chú

- GitHub Release đính kèm bộ cài Windows, gói Edge Add-ons và `SHA256SUMS.txt`.
- Extension không tự nhấn **Lưu**, **Tạo VM** hay **Deploy**.
