# IT Support Toolkit v0.1.3 — Windows x64 & Local Agent

**Tải về:**
- `ITSupportToolkit-Windows.zip`: bản cài Windows đầy đủ.
- `Install.cmd`: bộ cài Agent độc lập cho người dùng đã cài extension từ Edge Add-ons. Tải ZIP Agent từ Release này, **kiểm tra SHA-256** rồi hỏi Extension ID để đăng ký Native Messaging trong HKCU.
- `ITSupportToolkit-Agent-Windows.zip`: cách cài Agent không cần tải bằng CMD; giải nén toàn bộ và chạy `Install.cmd` bên trong.

**Không** tải ZIP dành cho Microsoft Edge Add-ons hoặc EXE lên Release. ZIP Add-ons được dựng riêng bằng `packaging/build-edge-store.ps1` để nộp Partner Center.

**Thay đổi từ v0.1.2:** Extension v0.1.3 mở trang hướng dẫn Local Agent **chỉ khi cài mới**, hiển thị ID của bản đang cài cùng link tải CMD/ZIP Agent. Các link luôn có lại trong trang Cài đặt. Extension không thể tự thực thi CMD; người dùng phải tải và chạy trên Windows. Bộ cài giữ các Extension ID đã đăng ký trước đó, thêm ID vừa nhập; không cần Administrator, Node.js hay Go trên máy người dùng.

**Kiểm tra:** test extension, build production, test Go và mô phỏng cài Agent đạt. Chưa kiểm thử đầu-cuối trên profile Edge Add-ons thật hoặc xét duyệt từ Microsoft. Gói chưa ký số; Windows/Edge có thể cảnh báo khi tải/chạy CMD.
