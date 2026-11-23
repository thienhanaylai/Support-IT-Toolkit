# IT Support Toolkit v0.1.2 — Windows x64

**Tải về:** `ITSupportToolkit-Windows.zip` (extension Manifest V3 v0.1.2). GitHub Release chỉ đính kèm ZIP cài Windows; **không** đính kèm gói Edge Add-ons hoặc EXE.

**Thay đổi từ v0.1.1:**
- Tiến trình kiểm tra chạy trong service worker thay vì trong popup. Nếu vô tình đóng popup, mở lại để xem tiếp thông tin đã nhập, tiến trình và kết quả trong phiên trình duyệt. Bật lưu lịch sử nếu cần giữ kết quả sau khi khởi động lại trình duyệt; nếu worker bị ngắt, popup báo gián đoạn thay vì chạy mãi.
- WHOIS Long Vân mở **tab nền không kích hoạt**, chỉ đọc các trường kỹ thuật rồi tự đóng tab tạm sau khi hoàn tất hoặc gặp lỗi; không chuyển bạn sang tab WHOIS, không dùng RDAP/API key và không lưu registrant.
- Trình cài và `readme.txt` vẫn hướng dẫn tiếng Việt theo Chrome/Edge; do giới hạn trình duyệt, lần đầu vẫn cần tự vào `chrome://extensions/` hoặc `edge://extensions/`, bật Developer mode, chọn Load unpacked và nhập Extension ID.

**Cài đặt:** Giải nén toàn bộ ZIP, đọc `readme.txt`, chạy `Install.cmd`. Sau khi nâng cấp, tải lại extension trong trình duyệt. Gói chưa ký số.

**Kiểm tra:** `npm run test` đạt 44/44, `npm run build` và `go test ./...` đạt. Chưa chạy cài đặt/WHOIS đầu-cuối trên profile Chrome/Edge thực tế.
