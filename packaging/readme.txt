IT SUPPORT TOOLKIT - GÓI NỘP MICROSOFT EDGE ADD-ONS
==================================================

Đây là gói ZIP để tải lên Microsoft Partner Center, không phải bộ cài Windows.
Tải lên nguyên file ITSupportToolkit-Edge-Store.zip; không cần giải nén.

Cấu trúc gói:
- manifest.json nằm ngay ở thư mục gốc của ZIP.
- popup.html, options.html, sidepanel.html, background.js là các trang/tiến trình của extension.
- assets/ chứa mã và giao diện đã build; icons/ chứa biểu tượng.
- readme.txt là hướng dẫn này. Gói không chứa file EXE, CMD, PS1 hay Agent.

Sau khi Microsoft duyệt và cấp Extension ID, người dùng cần cài Windows
Local Agent riêng nếu muốn dùng Ping, Traceroute, TCP Port, Quét Port,
SSL/TLS và Mạng LAN. Khi cài Agent, phải đăng ký đúng Extension ID
của phiên bản trên Edge Add-ons.

Khi cài mới, extension mở trang hướng dẫn kèm ID và link tải
ITSupportToolkit-Agent-Windows.zip tại GitHub Release v0.1.7.
Link luôn có lại trong Cài đặt. Giải nén toàn bộ ZIP rồi chạy
Install.cmd bên trong; bộ cài yêu cầu người dùng nhập Extension ID.
Trình duyệt không thể tự chạy CMD. Gói Agent không tải lên Edge Add-ons.

WHOIS và MXToolbox sử dụng dịch vụ bên ngoài khi người dùng yêu cầu.
IP Public chạy curl.exe tới ifconfig.me qua Local Agent và không xin
quyền host trong Edge. MXToolbox cần API key cho tên miền bất kỳ.
Gói ZIP không chứa API key hay dữ liệu lịch sử/Portal của người dùng.

Tạo lại gói từ mã nguồn:
  .\packaging\build-edge-store.ps1 -Force

Lưu ý: Cần hoàn thành mô tả, quyền truy cập, tài sản hình ảnh và
chính sách quyền riêng tư trên Partner Center. Không tải lên gói
ITSupportToolkit-Windows.zip để thay cho gói Edge Add-ons này.
