# IT Support Toolkit v0.2.1 — Tùy chọn ký tự đặc biệt

**Tải về:** `ITSupportToolkit-Windows.zip` là bộ cài Windows cho Chrome/Edge. Giải nén toàn bộ rồi chạy `Install.cmd`, hoặc dùng `ITSupportToolkit-Windows.exe` để cài từ một file.

Gói `ITSupportToolkit-Edge-Store.zip` được dựng riêng để cập nhật Microsoft Edge Add-ons và **không đính kèm GitHub Release**.

## Thay đổi từ v0.2.0

- Thêm tùy chọn **Số ký tự đặc biệt**, mặc định **3**, trong popup và bảng tùy chọn tạo mật khẩu trên Portal.
- Mật khẩu được tạo có đúng số ký tự đặc biệt đã chọn; các ký tự còn lại lấy từ những nhóm đang bật.
- Tùy chọn cũ chưa có trường này tự dùng giá trị mặc định 3.
- Kiểm tra độ dài tối thiểu để chứa đủ số ký tự đặc biệt và các nhóm đã chọn, tránh sinh mật khẩu không đúng cấu hình.
- Giữ nguyên mô hình Browser-only của v0.2.0: không có Local Agent, Native Messaging hoặc chương trình mạng native.

## Kiểm tra

- 130/130 bài test extension đạt.
- TypeScript và production build đạt.
- 6/6 kiểm tra bộ cài Windows đạt.
- Manifest trong cả hai gói là phiên bản **0.2.1**, không có `nativeMessaging`.
- Gói Windows và gói Edge Store không chứa Agent, `native`, `it-support-host` hoặc `install-agent`.

## SHA-256

- `ITSupportToolkit-Windows.zip`: `235104CD4669C56250AF1DB86F9BC3EAF9163E3B570468B0773D86498F48756C`
- `ITSupportToolkit-Windows.exe`: `C519A6DCD3F2FFB6BA8F7C5598FC8B0712A284ADF9E9E87968194542312E8CB4`
- `ITSupportToolkit-Edge-Store.zip`: `F1ED7D33413776443C63F7F191BDC1AC708C432BBE891098E737CD0862877FAF`

## Ghi chú

- Chỉ đính kèm `ITSupportToolkit-Windows.zip`, `ITSupportToolkit-Windows.exe` và `SHA256SUMS.txt` vào GitHub Release.
- Tải `ITSupportToolkit-Edge-Store.zip` lên Microsoft Partner Center để cập nhật Edge Add-ons; gói này không đính kèm GitHub Release.
- EXE chưa được ký số nên Windows có thể hiển thị cảnh báo.
