# IT Support Toolkit v0.1.8 — Sao lưu Authenticator và cập nhật bản dev

**Tải về:** `ITSupportToolkit-Windows.zip` là bộ cài Windows đầy đủ cho Chrome/Edge. Giải nén toàn bộ rồi chạy `Install.cmd`. Có thể dùng `ITSupportToolkit-Windows.exe` để cài từ một file.

Release này phát hành bộ cài Windows đầy đủ và ZIP Agent độc lập. Gói `ITSupportToolkit-Edge-Store.zip` được dựng riêng để nộp Microsoft Edge Add-ons và **không đính kèm GitHub Release**.

## Thay đổi từ v0.1.7

- Thay nút lên/xuống của Authenticator bằng tay nắm kéo thả bên trái; kéo tay nắm sẽ di chuyển toàn bộ thẻ và lưu thứ tự mới.
- Thông báo Authenticator đổi thành toast nổi tự biến mất, không còn đẩy hoặc làm vỡ bố cục danh sách.
- Thêm **Cài đặt → Sao lưu Authenticator** để xuất file TXT chứa các URI TOTP, giữ nguyên thứ tự, issuer, tài khoản, thuật toán, số chữ số và chu kỳ; file có thể import lại từ tab Auth.
- Cảnh báo và yêu cầu xác nhận trước khi export vì file TXT chứa secret TOTP dạng đọc được.
- Cải thiện trình cài/cập nhật bản Load unpacked: giữ Extension ID đã đăng ký, cập nhật extension + Agent, dọn bundle cũ và hướng dẫn Reload/refresh Portal; không cần gỡ hoặc Load unpacked lại.

## Kiểm tra

- 114/114 bài test extension đạt; TypeScript và production build đạt.
- `go test ./...` của Windows Local Agent đạt.
- Bộ cài Windows ZIP/EXE, Agent ZIP và Edge Add-ons ZIP được kiểm tra cấu trúc và SHA-256.
- `Install.cmd` độc lập không được tải lên GitHub Release.

## SHA-256

- `ITSupportToolkit-Windows.zip`: `6B6E8C94B70893C8174F3215EE2C47F6AA8F7327C06EB62C44BFA4B4BF5EE9AD`
- `ITSupportToolkit-Windows.exe`: `5B296312D9A0C630841F8114F39F006B3C16DFB988D84AFA812CC0E98C721601`
- `ITSupportToolkit-Agent-Windows.zip`: `06820EC399918991C8E3A161C6D86FC29289293718A50E432CE5ACA1EAC1BCF9`
- Gói nộp riêng `ITSupportToolkit-Edge-Store.zip`: `15A5E6272C98E256A554D695182B8E7812391D5C50C14A9620D022BC259CEAE7`
