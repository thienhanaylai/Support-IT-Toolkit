# IT Support Toolkit v0.1.9 — DNS Check và Authenticator cải tiến

**Tải về:** `ITSupportToolkit-Windows.zip` là bộ cài Windows đầy đủ cho Chrome/Edge. Giải nén toàn bộ rồi chạy `Install.cmd`. Có thể dùng `ITSupportToolkit-Windows.exe` để cài từ một file.

Release này phát hành bộ cài Windows đầy đủ và ZIP Agent độc lập. Gói `ITSupportToolkit-Edge-Store.zip` được dựng riêng để nộp Microsoft Edge Add-ons và **không đính kèm GitHub Release**.

## Thay đổi từ v0.1.8

- Thêm **DNS Check** chạy qua Windows Local Agent, hỗ trợ `AUTO`, `A`, `AAAA`, `MX`, `TXT`, `NS`, `CNAME`, `PTR` và DNS server IPv4/IPv6 tùy chọn, có thể kèm port.
- `AUTO` tra A/AAAA cho domain và reverse PTR cho địa chỉ IP; extension nhận diện Agent cũ và hướng dẫn cập nhật.
- Authenticator đưa mã OTP 34 px lên cùng hàng thông tin tài khoản và căn giữa khoảng trống của thẻ.
- Nút **Chọn vùng QR** cho phép kéo khoanh vùng mã QR trực tiếp trên tab đang mở, không sử dụng camera; nhấn `Esc` để hủy.
- Kéo sắp xếp Authenticator chuyển sang Pointer Events: không còn biểu tượng cấm của native drag, giữ con trỏ `grabbing`, hỗ trợ lăn bánh xe và tự cuộn khi kéo sát mép danh sách.
- Giữ Import ảnh/TXT, mã hóa AES-256-GCM, thứ tự đã lưu, export TXT và điền nhanh TOTP trên Portal.

## Kiểm tra

- 122/122 bài test extension đạt; TypeScript, production build và `npm audit` đạt.
- `go test ./...` và `go vet ./...` của Windows Local Agent đạt.
- Bộ cài Windows, Agent và Edge Add-ons được kiểm tra bằng các script đóng gói; SHA-256 ghi bên dưới.
- `Install.cmd` độc lập và gói Edge Add-ons không được tải lên GitHub Release.

## SHA-256

- `ITSupportToolkit-Windows.zip`: `0FCA235C3F538EC680AB79AB3D6D37C845FCCFFBC011D8667068F9D4FC852326`
- `ITSupportToolkit-Windows.exe`: `92D2B7DBAED76B07A58C6752BA5394463C8BE6F9EC179615E89E2133A21E8157`
- `ITSupportToolkit-Agent-Windows.zip`: `37C06C28F3C63B21A399DF069B30E0A39AACFE6EE8792B754E97449F726A8A87`
- Gói nộp riêng `ITSupportToolkit-Edge-Store.zip`: `650E69DC5ED68B2F0E432503FC139EA4F68075F4E53BEAF6671A43859063CD40`
