# IT Support Toolkit v0.2.2.4 — Hình thức Clone FULL ở bước cuối

**Tải về:** dùng `ITSupportToolkit-Windows.exe` để cài hoặc cập nhật bằng một file, hoặc giải nén `ITSupportToolkit-Windows.zip` rồi chạy `Install.cmd`.

Gói `ITSupportToolkit-Edge-Store.zip` dùng để cập nhật Microsoft Edge Add-ons và được đính kèm trong GitHub Release này.

## Thay đổi từ v0.2.2.3

- Tự chuyển **Hình thức Clone** từ `LINKED` sang `FULL` ở **bước cuối cùng** của luồng dán thông số.
- Áp dụng cho cả trang **Tạo Computing** chuẩn (`computing_create.xhtml`) và trang **nâng cao** (`computing_create_plus.xhtml`).
- Nhận đúng ô Clone dạng **PrimeFaces Inplace**: mở editor, chọn `FULL`, bấm **Save** và chờ Portal xác nhận.
- Giới hạn phạm vi tìm kiếm theo đúng hàng chứa nhãn, không lấy nhầm `Resource Pool`, `Instance` hoặc select khác trong cùng panel.
- Chấp nhận lỗi AJAX của `Cấu hình reservation` và `Disk size` **chỉ khi** giá trị thực tế đã đúng; nếu Portal giữ giá trị cũ thì vẫn dừng và báo lỗi.
- Giữ nguyên Tên VM qua mọi lần PrimeFaces dựng lại form.
- Cập nhật thứ tự hiển thị khi đang dán và tài liệu README.

## Thứ tự thực hiện

Trang chuẩn:

```text
Template (nếu cần) → CPU → RAM → Internet → Disk → Hình thức Clone: FULL
```

Trang nâng cao:

```text
Tên → Template → Cấu hình triển khai → CPU → RAM → Internet
→ Cấu hình reservation → Disk pool → Disk → Cấu hình storage reservation
→ Hình thức Clone: FULL
```

## Xác nhận đóng gói

- Manifest trong các gói là phiên bản **0.2.2.4**, không có `nativeMessaging`.
- Gói Edge Add-ons có `manifest.json` nằm ngay ở gốc ZIP và không chứa installer.
- Bộ cài Windows dùng launcher Go thuần, đã chạy kiểm tra `--verify`, cài mới và cập nhật đè thành công.
- Bộ test 155/155 và production build đã đạt trước bước phát hành; theo yêu cầu không chạy lại bộ test trong lần đóng gói này.

## SHA-256

- `ITSupportToolkit-Windows.zip`: `A17E1E509B01AA86A6A2612D93F233E1E739132C5DCE1946F7D5B73A3200B9D5`
- `ITSupportToolkit-Windows.exe`: `8BF89BF2BE59B1BF61C7B0928E7E2DB972FC3BF6162B8D9A02D312CB3BA0610D`
- `ITSupportToolkit-Edge-Store.zip`: `527B9C024CB18AB0A5CB3497E772658EB449CA59E457CE71D917E90434B87344`

## Ghi chú

- GitHub Release đính kèm bộ cài Windows, gói Edge Add-ons và `SHA256SUMS.txt`.
- Extension không tự nhấn **Lưu**, **Tạo VM** hay **Deploy**.
