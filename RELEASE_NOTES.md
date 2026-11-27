# IT Support Toolkit v0.2.2.3 — Chuẩn hóa nút Lưu và danh sách template

**Tải về:** dùng `ITSupportToolkit-Windows.exe` để cập nhật bằng một file, hoặc giải nén `ITSupportToolkit-Windows.zip` rồi chạy `Install.cmd`.

Gói `ITSupportToolkit-Edge-Store.zip` dùng để cập nhật Microsoft Edge Add-ons và được đính kèm trong GitHub Release này.

## Thay đổi từ v0.2.2.2

- Chuyển **Lưu danh sách Tag Element** và **Lưu template** sang góc phải.
- Chuẩn hóa vị trí **Lưu cài đặt** và **Lưu Authenticator**; nút Hủy nằm trước, nút Lưu nằm ngoài cùng bên phải.
- Giữ các nút lưu tùy chọn mật khẩu và lưu trên Portal ở phía phải.
- Ngăn tên hoặc nội dung template dài, đặc biệt URL Matrix, kéo item vượt khỏi section.
- Tự rút gọn tên/nội dung dài bằng dấu `...` và giữ nội dung đầy đủ trong tooltip.
- Giữ cố định vị trí nút sửa/xóa trên desktop, giao diện tối và màn hình hẹp.

## Xác nhận đóng gói

- Manifest trong các gói là phiên bản **0.2.2.3**, không có `nativeMessaging`.
- Gói Edge Add-ons có `manifest.json` nằm ngay ở gốc ZIP và không chứa installer.
- Bộ test 151/151 và production build đã đạt trước bước phát hành; theo yêu cầu không chạy lại bộ test riêng trong lần đóng gói này.

## SHA-256

- `ITSupportToolkit-Windows.zip`: `5FAA1573D403C9E3F90E9385510D8A05A9F3741D99962C14D7D08F425DCEA9CD`
- `ITSupportToolkit-Windows.exe`: `A473EA7157635FC6E29ED7BE5A2D92A0D14463C0E87A24E52BB3E9B6FF3EB8FB`
- `ITSupportToolkit-Edge-Store.zip`: `E90DD4691209B2BCA06C1C53D5C2866606D6382BC8C958C43AF5F78DA5CF73B2`

## Ghi chú

- GitHub Release đính kèm hai gói Windows, gói Edge Add-ons và `SHA256SUMS.txt`.
- EXE chưa được ký Authenticode nên Windows hoặc một số engine heuristic vẫn có thể cảnh báo.
