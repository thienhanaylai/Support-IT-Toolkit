# IT Support Toolkit v0.2.2.4 — Hình thức Clone FULL ở bước cuối

**Tải về:** `ITSupportToolkit-Edge-Store.zip` để cập nhật Microsoft Edge Add-ons.

Bản này chỉ đóng gói gói Edge Add-ons. Bộ cài Windows vẫn dùng bản **0.2.2.3**.

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

- Manifest trong gói là phiên bản **0.2.2.4**, không có `nativeMessaging`.
- Gói Edge Add-ons có `manifest.json` nằm ngay ở gốc ZIP và không chứa installer.
- Bộ test 155/155 và production build đã đạt trước bước phát hành; theo yêu cầu không chạy lại bộ test trong lần đóng gói này.

## SHA-256

- `ITSupportToolkit-Edge-Store.zip`: `527B9C024CB18AB0A5CB3497E772658EB449CA59E457CE71D917E90434B87344`

## Ghi chú

- GitHub Release đính kèm gói Edge Add-ons và `SHA256SUMS.txt`.
- Extension không tự nhấn **Lưu**, **Tạo VM** hay **Deploy**.
