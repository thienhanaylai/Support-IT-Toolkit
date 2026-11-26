# IT Support Toolkit v0.2.0 — Browser-only

**Tải về:** `ITSupportToolkit-Windows.zip` là bộ cài Windows cho Chrome/Edge. Giải nén toàn bộ rồi chạy `Install.cmd`, hoặc dùng `ITSupportToolkit-Windows.exe` để cài từ một file.

Gói `ITSupportToolkit-Edge-Store.zip` được dựng riêng để cập nhật Microsoft Edge Add-ons và **không đính kèm GitHub Release**.

## Thay đổi từ v0.1.9

- Chuyển hoàn toàn sang **Browser-only**: không còn Windows Local Agent, Native Messaging, service hoặc chương trình mạng native.
- Giữ bốn công cụ chạy trực tiếp trong trình duyệt: **IP Public**, **HTTP Ping**, **DNS over HTTPS** và **Thông tin VM**.
- Loại khỏi UI/runtime: ICMP Ping, Traceroute, TCP Port, Quét Port, DNS hệ điều hành, SSL/TLS, Mạng LAN, MXToolbox và WHOIS.
- Kết quả cũ của các công cụ đã bỏ vẫn xem được trong trang lịch sử và báo cáo HTML.
- Manifest bỏ quyền `nativeMessaging`; bộ cài Windows không còn build, chép hoặc đăng ký Agent.
- Tự xóa API key MXToolbox/BKNS còn lưu từ phiên bản cũ.
- Giữ Authenticator, Password Generator và các tiện ích Portal Long Vân.

## Giới hạn

- Manifest V3 không cho extension thực hiện ICMP, traceroute, mở TCP tùy ý hoặc đọc đầy đủ card mạng Windows.
- **HTTP Ping** đo thời gian tới response headers, không phải ICMP RTT.
- **DNS over HTTPS** gửi truy vấn tới Cloudflare, Google hoặc Quad9; không phải DNS hệ điều hành/VPN.
- Không có backend, remote probe hoặc fallback từ xa.

## Kiểm tra

- 129/129 bài test extension đạt.
- TypeScript và production build đạt.
- 6/6 kiểm tra bộ cài Windows đạt.
- Manifest trong cả hai gói là phiên bản **0.2.0**, không có `nativeMessaging`.
- Gói Windows và gói Edge Store không chứa Agent, `native`, `it-support-host` hoặc `install-agent`.

## SHA-256

- `ITSupportToolkit-Windows.zip`: `749A3E09E07A1CD35050DDC6A935BE9C195BFCFB90F5FAB157DBA151027674D0`
- `ITSupportToolkit-Windows.exe`: `B95CF2B06A34F32F64691C6CDDCC3DF7BEB1AF833DAE32B3E551B6C1B001B3E4`
- `ITSupportToolkit-Edge-Store.zip`: `9A264C176557796F38DED655140817066285E38CED4E7087705A9B439AD30059`

## Ghi chú

- Chỉ đính kèm `ITSupportToolkit-Windows.zip`, `ITSupportToolkit-Windows.exe` và `SHA256SUMS.txt` vào GitHub Release.
- Tải `ITSupportToolkit-Edge-Store.zip` lên Microsoft Partner Center để cập nhật Edge Add-ons; gói này không đính kèm GitHub Release.
- EXE chưa được ký số nên Windows có thể hiển thị cảnh báo.
