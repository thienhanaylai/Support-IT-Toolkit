# Gói tải lên Microsoft Edge Add-ons

Tải lên **`release/ITSupportToolkit-Edge-Store.zip`**, không dùng `ITSupportToolkit-Windows.zip` hoặc `.exe`. Trong ZIP dành cho Edge, `manifest.json`, `readme.txt`, `popup.html`, `background.js`, `assets/` và `icons/` nằm **ngay ở gốc**; không có thư mục `extension/`, mã nguồn, installer hay Agent. Mở `readme.txt` để xem hướng dẫn ngắn, không cần giải nén trước khi tải ZIP lên.

Tạo lại từ mã nguồn trên máy có Node.js/npm:

```powershell
.\packaging\build-edge-store.ps1 -Force
```

Script build bản production, kiểm tra các đường dẫn cơ bản trong manifest, xác nhận từng file extension khớp `extension/dist` và `readme.txt` khớp `packaging/readme.txt`. Đăng nhập [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/public/login), tạo extension mới rồi tải ZIP này lên ở mục **Upload package (.zip file)** theo [hướng dẫn của Microsoft](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension). Cần hoàn thiện phần mô tả, logo, hình ảnh, thông tin quyền và chính sách quyền riêng tư theo yêu cầu tại thời điểm nộp; tải ZIP lên không đồng nghĩa đã qua xét duyệt.

**Lưu ý khi phát hành:**

- Manifest hiện có tên **IT Support Toolkit**, phiên bản **0.2.0**. Cần tăng `version` trong `extension/public/manifest.json` cho mỗi lần cập nhật đã phát hành; nếu muốn đổi tên hiển thị trên chợ, sửa `name` trước khi tạo ZIP. Nút header trong popup hiện ghi **LongVanSupport Toolkit**.
- ZIP của chợ là bản Browser-only hoàn chỉnh, không cần Local Agent và không có quyền `nativeMessaging`. IP Public dùng Fetch tới `https://ifconfig.me/ip`; DNS over HTTPS dùng Cloudflare, Google hoặc Quad9; HTTP Ping xin quyền host theo origin do người dùng nhập.
- Quyền `optional_host_permissions` rộng vẫn cần cho HTTP Ping và các tính năng Portal/VM khi người dùng chủ động cấp quyền; cần giải trình rõ khi Microsoft xét duyệt.
- Chưa kiểm tra việc nộp gói trên tài khoản Partner Center hoặc quá trình xét duyệt của Microsoft. Không đưa khóa API, dữ liệu Portal hoặc thông tin nội bộ vào nội dung niêm yết.
