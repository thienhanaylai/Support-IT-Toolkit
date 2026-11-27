# IT Support Toolkit v0.2.2.1 — Cải tiến hộp Copy VM

**Tải về:** `ITSupportToolkit-Windows.zip` là bộ cài Windows cho Chrome/Edge. Giải nén toàn bộ rồi chạy `Install.cmd`, hoặc dùng `ITSupportToolkit-Windows.exe` để cài từ một file.

Gói `ITSupportToolkit-Edge-Store.zip` được dựng riêng để cập nhật Microsoft Edge Add-ons và **không đính kèm GitHub Release**.

## Thay đổi từ v0.2.2

- Đổi placeholder ghi chú/template thành màu trắng trong giao diện tối.
- Thêm nút **Lưu** để tạo template mới hoặc cập nhật template đang chọn bằng nội dung đã nhập.
- Tự động chọn template vừa lưu và khóa thao tác phù hợp trong lúc đang lưu.
- Chuyển nút **Sao chép** sang bên phải trên cả màn hình thường và màn hình hẹp.

## Kiểm tra

- 151/151 bài test extension đạt.
- TypeScript và production build đạt.
- 6/6 kiểm tra bộ cài Windows đạt.
- Manifest trong cả hai gói là phiên bản **0.2.2.1**, không có `nativeMessaging`.
- Gói Edge Add-ons có 29 file và `manifest.json` nằm ngay ở gốc ZIP.

## SHA-256

- `ITSupportToolkit-Windows.zip`: `0BAED108C2F7B01DAD386CAFC2231C47B5322758AEC11392FBF1D7E5697485DA`
- `ITSupportToolkit-Windows.exe`: `B5985F8B4DCBCC5636B7EAA28EDBF238AC38B3917A12DD17F189C6355AD0DF88`
- `ITSupportToolkit-Edge-Store.zip`: `49C50762F2AA343AF1DE847F8282CA18063222DADB128C6BF2EDD27E5F795A27`

## Ghi chú

- Chỉ đính kèm `ITSupportToolkit-Windows.zip`, `ITSupportToolkit-Windows.exe` và `SHA256SUMS.txt` vào GitHub Release.
- Tải `ITSupportToolkit-Edge-Store.zip` lên Microsoft Partner Center để cập nhật Edge Add-ons; gói này không đính kèm GitHub Release.
- EXE chưa được ký số nên Windows có thể hiển thị cảnh báo.
