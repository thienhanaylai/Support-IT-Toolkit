# IT Support Toolkit v0.2.2 — Portal nâng cao và Authenticator

**Tải về:** `ITSupportToolkit-Windows.zip` là bộ cài Windows cho Chrome/Edge. Giải nén toàn bộ rồi chạy `Install.cmd`, hoặc dùng `ITSupportToolkit-Windows.exe` để cài từ một file.

Gói `ITSupportToolkit-Edge-Store.zip` được dựng riêng để cập nhật Microsoft Edge Add-ons và **không đính kèm GitHub Release**.

## Thay đổi từ v0.2.1

- Hỗ trợ đầy đủ trang **Tạo computing nâng cao**, tự động điền theo thứ tự an toàn và xử lý các lần PrimeFaces AJAX dựng lại form.
- Đồng bộ realtime cấu hình VM giữa trang Dịch vụ và mọi tab Tạo computing đang mở, gồm cả loại dịch vụ.
- Nâng cấp nhận diện Template OS theo thành phần ngữ nghĩa, alias, phiên bản, kiến trúc và biến thể phần mềm; tránh chọn nhầm phiên bản, edition hoặc sản phẩm.
- Thêm công tắc **Portal Enable/Disable** trong popup để ẩn/hiện toàn bộ công cụ được extension chèn khi cần chụp báo cáo.
- Thêm nút chỉnh sửa tên hiển thị và nhãn tài khoản Authenticator mà không thay đổi secret TOTP.
- Quản lý tập trung Template tin nhắn trong Cài đặt và chèn nhanh trong hộp Copy VM.
- Nâng cấp Tag Element, Copy VM nâng cao và giao diện sáng/tối theo bảng màu Portal xanh dương/vàng.

## Kiểm tra

- 151/151 bài test extension đạt.
- TypeScript và production build đạt.
- 6/6 kiểm tra bộ cài Windows đạt.
- Manifest trong cả hai gói là phiên bản **0.2.2**, không có `nativeMessaging`.
- Gói Windows và gói Edge Store không chứa Agent, `native`, `it-support-host` hoặc `install-agent`.

## SHA-256

- `ITSupportToolkit-Windows.zip`: `D53CC5E9574475175609515BD17BD19F1571E2788D7BF986615AFC1040D37B70`
- `ITSupportToolkit-Windows.exe`: `CA4E1926E7B05EDE0B6FD429676D66942B1C9A457E95DF772A195526C33F494B`
- `ITSupportToolkit-Edge-Store.zip`: `A2224AF09787206FAF6B137FF41A8D74F93E6F4AAF87AC28FC0EEE5998FCEEFF`

## Ghi chú

- Chỉ đính kèm `ITSupportToolkit-Windows.zip`, `ITSupportToolkit-Windows.exe` và `SHA256SUMS.txt` vào GitHub Release.
- Tải `ITSupportToolkit-Edge-Store.zip` lên Microsoft Partner Center để cập nhật Edge Add-ons; gói này không đính kèm GitHub Release.
- EXE chưa được ký số nên Windows có thể hiển thị cảnh báo.
