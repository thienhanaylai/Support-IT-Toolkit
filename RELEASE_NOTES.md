# IT Support Toolkit v0.1.7 — Authenticator và tự động hóa Portal

**Tải về:** `ITSupportToolkit-Windows.zip` là bộ cài Windows đầy đủ cho Chrome/Edge. Giải nén toàn bộ rồi chạy `Install.cmd`. Có thể dùng `ITSupportToolkit-Windows.exe` để cài từ một file.

Release này phát hành bộ cài Windows đầy đủ và ZIP Agent độc lập. Gói `ITSupportToolkit-Edge-Store.zip` được dựng riêng để nộp Microsoft Edge Add-ons và **không đính kèm GitHub Release**.

## Thay đổi từ v0.1.6

- Thêm **Authenticator TOTP**: dán nhiều URI, quét camera, import ảnh/TXT, mã hóa AES-GCM, tìm kiếm, sắp xếp và bấm thẻ để sao chép.
- Popup có ba tab riêng: **Authenticator**, **Mật khẩu** và **Công cụ**; Authenticator mở mặc định.
- Thêm split button OTP trên hộp xác thực Portal, hiển thị `Nhà cung cấp: mã`, tự làm mới và cho phép chọn tài khoản khác.
- Thêm nút **Sao chép thông tin VM** ngay trên trang chi tiết computing và nút lấy mới/sao chép trong popup.
- Tạo và dán tên VM từ chủ sở hữu + mã dịch vụ.
- Tự áp dụng Template trước CPU → RAM → Internet → Disk; lấy lại widget và thử lại CPU nếu Portal trả giá trị cũ sau AJAX.
- Trình cài tự mở trang quản lý extension của Chrome/Edge và giữ lại hướng dẫn Load unpacked.

## Kiểm tra

- 112/112 bài test extension đạt; TypeScript và production build đạt.
- `go test ./...` của Windows Local Agent đạt.
- Bộ cài Windows ZIP/EXE, Agent ZIP và Edge Add-ons ZIP được kiểm tra cấu trúc và SHA-256.
- `Install.cmd` độc lập không được tải lên GitHub Release.

## SHA-256

- `ITSupportToolkit-Windows.zip`: `A9D5B1356F2FAFFD783030D9015767E23337C19AF614C6F3A3F119C51B44D10B`
- `ITSupportToolkit-Windows.exe`: `9119D6A155562E1E647ADFE0EC2D05E32E6CE38094291A800211C21076DA7240`
- `ITSupportToolkit-Agent-Windows.zip`: `24225092DBECF6232DDF9C907B9C2644DEF01DC8A1C6A0B3CDAA1058307405BF`
- Gói nộp riêng `ITSupportToolkit-Edge-Store.zip`: `7BC98C1C28A263F1B9695DA0AD482190E94AA322E7BBC83B79D1AF58750CC236`
