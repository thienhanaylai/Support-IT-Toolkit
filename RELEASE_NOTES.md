# IT Support Toolkit v0.2.2.2 — Full clone, Matrix Tag và bộ cài an toàn hơn

**Tải về:** `ITSupportToolkit-Windows.zip` là bộ cài Windows cho Chrome/Edge. Giải nén toàn bộ rồi chạy `Install.cmd`, hoặc dùng `ITSupportToolkit-Windows.exe` để cài từ một file.

Gói `ITSupportToolkit-Edge-Store.zip` được dựng riêng để cập nhật Microsoft Edge Add-ons và **không đính kèm GitHub Release**.

## Thay đổi từ v0.2.2.1

- Chọn **Hình thức clone = Full** trước khi điền Tên, Template, Cấu hình triển khai và tài nguyên trên trang Tạo Computing nâng cao.
- Giữ lại Tên VM khi PrimeFaces AJAX thay toàn bộ form.
- Đổi Tag Element sang liên kết Matrix chuẩn: `[username](https://matrix.to/#/@iduser:domain)`.
- Hiển thị mỗi template tin nhắn trên một dòng, có nút chỉnh sửa và xóa; biểu mẫu chỉ mở khi thêm hoặc sửa.
- Chọn template trong hộp Copy VM sẽ tự chèn; đồng bộ kích thước nút và giao diện Tag trong chế độ tối.
- Viết lại EXE cài một file bằng Go thuần: chỉ chép extension production trực tiếp vào LocalAppData, không gọi PowerShell/CMD, không chạy script tạm, không dùng UI Automation/clipboard và không tải mã từ mạng.
- Bổ sung kiểm tra cài mới, cập nhật và xóa asset cũ cho EXE trong môi trường cách ly.

## Kiểm tra

- 151/151 bài test extension đạt.
- TypeScript và production build đạt.
- 6/6 kiểm tra bộ cài Windows ZIP đạt.
- EXE cài mới/cập nhật trong môi trường cách ly đạt.
- Manifest trong cả hai gói là phiên bản **0.2.2.2**, không có `nativeMessaging`.
- Gói Edge Add-ons có 29 file và `manifest.json` nằm ngay ở gốc ZIP.

## SHA-256

- `ITSupportToolkit-Windows.zip`: `311CDA004835C8F5D1122C5F04429E097CD52B5D950FD659A66BCA407E71D1D7`
- `ITSupportToolkit-Windows.exe`: `9DEDD0DAC8BB2BCD7FF346191E34FB0524890E36D4871B289D24EEF9009551DF`
- `ITSupportToolkit-Edge-Store.zip`: `52C4697B844E9F92A2D50308E4B93FB3491F5992506DE8154EE019496865A793`

## Ghi chú

- Chỉ đính kèm `ITSupportToolkit-Windows.zip`, `ITSupportToolkit-Windows.exe` và `SHA256SUMS.txt` vào GitHub Release.
- Tải `ITSupportToolkit-Edge-Store.zip` lên Microsoft Partner Center để cập nhật Edge Add-ons; gói này không đính kèm GitHub Release.
- EXE chưa được ký Authenticode nên Windows hoặc một số engine heuristic vẫn có thể cảnh báo.
