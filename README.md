# IT Support Toolkit

Extension Chrome/Edge Manifest V3 chạy **Browser-only**, không có Native Agent, backend, tài khoản hoặc telemetry.

## Chức năng

### Công cụ mạng Browser-only

| Công cụ | Nguồn | Ghi chú |
|---|---|---|
| IP Public | Fetch `https://ifconfig.me/ip` | Validate IPv4/IPv6; không gửi cookie. |
| HTTP Ping | Fetch từ trình duyệt | HEAD/GET, 1–5 lần, đo tới response headers; không phải ICMP RTT. |
| DNS over HTTPS | Cloudflare, Google hoặc Quad9 | Hỗ trợ A, AAAA, CNAME, MX, TXT, NS, SOA, PTR, CAA, SRV. |
| Thông tin VM | Tab Portal hiện tại | Chỉ đọc DOM trang chi tiết computing khi người dùng nhấn nút. |

Các công cụ native cũ—ICMP Ping, Traceroute, TCP Port, Quét Port, DNS hệ điều hành, SSL/TLS và Mạng LAN—đã bị loại khỏi UI/runtime. Kết quả cũ vẫn có thể xem trong lịch sử.

### Authenticator và mật khẩu

- Authenticator hỗ trợ TOTP, import liên kết/ảnh/TXT, chọn vùng QR, sắp xếp, tìm kiếm, sao chép và export TXT.
- Secret TOTP được mã hóa AES-GCM trước khi lưu trong `chrome.storage.local`. Khóa mở tự động cũng nằm trong vùng lưu trữ extension; đây không thay thế mật khẩu chính hoặc kho khóa phần cứng.
- Password Generator dùng `crypto.getRandomValues()`, hỗ trợ các nhóm ký tự, độ dài 4–128, số ký tự đặc biệt (mặc định 3) và danh sách loại trừ.
- Mật khẩu gần đây chỉ được giữ trong `chrome.storage.session`, không ghi vào lịch sử hoặc báo cáo.

### Portal Long Vân

Quyền `https://portal.longvan.vn/*` là quyền tùy chọn và chỉ được yêu cầu khi người dùng cấp.

- Trang Dịch vụ: sao chép CORE, RAM, Internet, Storage, OS, Site Provider, chủ sở hữu và mã dịch vụ.
- Trang Tạo computing: dán tài nguyên, gợi ý tên VM, tạo mật khẩu và điền cấu hình theo thứ tự an toàn.
- Trang chi tiết computing: sao chép Link VM, Tên computing, Nhóm ảo hóa, Nhóm, Tên VM, VMID, VMP, Host và ResourcePool.
- Hộp xác thực hai lớp: nhận diện dialog `dlgEnabled2FA` trên các trang Portal và điền mã TOTP hiện tại; content script không nhận secret.
- Tag Element: tab riêng để sao chép liên hệ theo lĩnh vực hoặc từng người dưới dạng `(Tên)[@id:domain]`, kèm quản lý/import danh sách trong Cài đặt.
- Copy VM nâng cao trên Portal: chỉnh sửa thông tin VM, thêm ghi chú và chèn liên hệ theo lĩnh vực trước khi sao chép một lần.
- Template tin nhắn trong Copy VM nâng cao: chèn lặp lại, lưu mới/ghi đè, xóa và tự đóng hộp sau khi sao chép thành công.
- Giao diện dùng bảng màu xanh/vàng đồng bộ Portal Long Vân, hỗ trợ theme Sáng/Tối được chọn trong Cài đặt.
- Trang Cài đặt dùng tab độc lập cho Tùy chọn, Tag Element, Authenticator, Quyền Portal và Lịch sử.
- Extension không tự bấm Lưu/Tạo VM.

## Cài đặt

### Từ mã nguồn

Yêu cầu Node.js 20+ và npm:

```powershell
cd extension
npm ci
npm run build
```

Mở `chrome://extensions/` hoặc `edge://extensions/`, bật **Developer mode**, chọn **Load unpacked** và trỏ tới `extension/dist`.

Không cần Go, quyền Administrator, Local Agent hoặc đăng ký Native Messaging để chạy extension.

### Gói Windows

```powershell
.\packaging\build-release.ps1 -Force
```

Script tạo:

- `release/ITSupportToolkit-Windows.zip`
- `release/ITSupportToolkit-Windows.exe`

Gói Windows chỉ chép extension vào `%LOCALAPPDATA%\ITSupportToolkit\extension` và hướng dẫn Load unpacked. Nó không cài chương trình mạng native, service hoặc Native Messaging Host. Go chỉ được dùng ở máy build để biên dịch launcher EXE tự giải nén.

### Microsoft Edge Add-ons

```powershell
.\packaging\build-edge-store.ps1 -Force
```

Xem hướng dẫn tại [`packaging/EDGE_STORE.md`](packaging/EDGE_STORE.md). Gói trên chợ là bản Browser-only hoàn chỉnh.

### Cập nhật bản Load unpacked

- Nếu load trực tiếp từ `extension/dist`: chạy lại `npm run build`, rồi bấm **Reload/Tải lại**.
- Nếu load từ `%LOCALAPPDATA%\ITSupportToolkit\extension`: chạy bộ cài mới, rồi bấm **Reload/Tải lại**.
- Refresh các tab Portal đang mở để nạp content script mới.
- Giữ nguyên đường dẫn và Extension ID để giữ dữ liệu trong `chrome.storage.local`.

## Dữ liệu và quyền riêng tư

- Manifest không yêu cầu `nativeMessaging`.
- IP Public gửi request tới ifconfig.me.
- HTTP Ping xin quyền theo đúng origin HTTP/HTTPS do người dùng nhập.
- DoH gửi truy vấn tới resolver công cộng đã chọn; không dùng cho tên miền/IP nội bộ nhạy cảm nếu bạn không chấp nhận việc gửi truy vấn ra ngoài.
- Lịch sử lưu cục bộ tối đa 50 kết quả khi tùy chọn lưu được bật.
- Báo cáo HTML chỉ được tạo khi người dùng chủ động xuất.
- Các trường nhạy cảm phổ biến như API key, authorization, password và token được loại khỏi dữ liệu lưu/xuất.

## Phát triển và kiểm thử

```powershell
cd extension
npm ci
npm test
npm run build
cd ..
.\packaging\test-setup.ps1
.\packaging\build-edge-store.ps1 -Force
```

Tài liệu `docs/zero-cmd-*.md` và `RELEASE_NOTES.md` mô tả các mốc phát hành/lịch sử trước khi chuyển sang Browser-only.
