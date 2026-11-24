# Gói tải lên Microsoft Edge Add-ons

Tải lên **`release/ITSupportToolkit-Edge-Store.zip`**, không dùng `ITSupportToolkit-Windows.zip` hoặc `.exe`. Trong ZIP dành cho Edge, `manifest.json`, `readme.txt`, `popup.html`, `background.js`, `assets/` và `icons/` nằm **ngay ở gốc**; không có thư mục `extension/`, mã nguồn, installer hay Agent. Mở `readme.txt` để xem hướng dẫn ngắn, không cần giải nén trước khi tải ZIP lên.

Tạo lại từ mã nguồn trên máy có Node.js/npm:

```powershell
.\packaging\build-edge-store.ps1 -Force
```

Script build bản production, kiểm tra các đường dẫn cơ bản trong manifest, xác nhận từng file extension khớp `extension/dist` và `readme.txt` khớp `packaging/readme.txt`. Đăng nhập [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/public/login), tạo extension mới rồi tải ZIP này lên ở mục **Upload package (.zip file)** theo [hướng dẫn của Microsoft](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension). Cần hoàn thiện phần mô tả, logo, hình ảnh, thông tin quyền và chính sách quyền riêng tư theo yêu cầu tại thời điểm nộp; tải ZIP lên không đồng nghĩa đã qua xét duyệt.

**Lưu ý khi phát hành:**

- Manifest hiện có tên **IT Support Toolkit**, phiên bản **0.1.4**. Cần tăng `version` trong `extension/public/manifest.json` cho mỗi lần cập nhật đã phát hành; nếu muốn đổi tên hiển thị trên chợ, sửa `name` trước khi tạo ZIP. Nút header trong popup hiện ghi **LongVanSupport Toolkit**.
- ZIP của chợ chỉ gồm extension. Ping, Traceroute, TCP Port, Quét Port, SSL/TLS và Mạng LAN vẫn cần **Windows Local Agent** cài riêng. Khi cài mới, extension mở `welcome.html` với ID của bản đang cài và liên kết [Install.cmd](https://github.com/thienhanaylai/Support-IT-Toolkit/releases/download/v0.1.3/Install.cmd) độc lập; trang Cài đặt giữ link đó và [ZIP Agent](https://github.com/thienhanaylai/Support-IT-Toolkit/releases/download/v0.1.3/ITSupportToolkit-Agent-Windows.zip) dự phòng. CMD tải ZIP Agent từ Release, đối chiếu SHA-256 rồi hỏi ID để đăng ký Native Messaging trong HKCU; **người dùng tự chạy**, extension không thể thực thi CMD. Bộ cài Agent giữ ID cũ và thêm **Extension ID do Edge Add-ons cấp**, có thể khác bản Load unpacked; lịch sử/cài đặt không tự chuyển giữa hai ID. Không đính kèm gói ZIP nộp Edge Add-ons vào GitHub Release.
- WHOIS, MXToolbox và IP Public phụ thuộc dịch vụ bên ngoài và quyền host khi người dùng kích hoạt. Quyền `optional_host_permissions` rộng trong manifest có thể cần giải trình khi Microsoft xét duyệt.
- Chưa kiểm tra việc nộp gói trên tài khoản Partner Center hoặc quá trình xét duyệt của Microsoft. Không đưa khóa API, dữ liệu Portal hoặc thông tin nội bộ vào nội dung niêm yết.
