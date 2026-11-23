# Báo cáo IT Support Toolkit Extension

**Ngày rà soát:** 23/11/2026  
**Phiên bản manifest:** 0.1.0 (Chrome/Edge Manifest V3)  
**Phạm vi:** extension trong `extension/`, Windows Local Agent trong `native-agent/`.

## Extension hiện làm được gì?

| Công cụ | Khả năng | Nguồn / mức kiểm chứng |
|---|---|---|
| Thông tin VM | Đọc tab chi tiết computing của Portal **khi người dùng bấm nút**; xuất đúng 9 trường: Link VM, Tên computing, Nhóm ảo hóa, Nhóm, Tên VM, VMID, VMP, Host, ResourcePool. Không lấy ô chỉnh sửa ẩn. | DOM của tab Portal; đã đối chiếu với HTML mẫu thực tế và test bộ trích xuất. Chưa thử trên phiên Portal đang đăng nhập trong Chrome/Edge. |
| Ping | Chọn 1–5 lần ping (mặc định 4); hiển thị từng dòng khi đang chạy và kết quả cuối không có JSON. | Local Agent; đã thử luồng nhiều thông báo với loopback trên Windows và test tham số gửi tới Agent. |
| Traceroute | Chọn tối đa 1–30 hop (mặc định 20); hiện từng dòng/hop của `tracert -d` trên Windows. | Local Agent; đã thử với loopback; có test tham số gửi tới Agent. |
| TCP Port | Kiểm tra kết nối tới một cổng TCP và trả trạng thái mở/đóng/timeout. | Local Agent; đã thử qua Agent và test Go với cổng loopback. |
| Quét Port | Quét 20 cổng phổ biến hoặc danh sách tối đa 32 cổng; hiện từng cổng hoàn tất, tối đa 6 kết nối đồng thời, 2 giây mỗi cổng. | Local Agent; đã thử luồng nhiều thông báo và test Go với loopback. Máy dùng Agent cũ phải cài lại Agent để có tiến độ. |
| SSL / TLS | Kiểm tra phiên bản TLS, chứng chỉ, thời hạn và kết quả xác minh chain/hostname. | Local Agent; đã thử kết nối TLS tới tên miền công khai. |
| MXToolbox | Tra DNS/NS, A, AAAA, MX, TXT, SPF, DMARC, SOA; hiển thị loại tra cứu/domain, DNS server, thời gian và các trường Type, Domain Name, IP Address, TTL nếu có. | API MXToolbox; endpoint demo DNS `example.com` trả dữ liệu và có test lọc kết quả. Truy vấn domain khác cần API key riêng; **chưa thử với key của người dùng**. |
| WHOIS / RDAP | Tách tên miền đăng ký khỏi hostname (ví dụ `portal.example.vn` → `example.vn`), lấy nhà đăng ký, ngày, trạng thái, nameserver, DNSSEC khi nguồn cung cấp. `.com`/`.net` dùng RDAP registry; TLD khác tra danh mục IANA. `.vn` dùng BKNS WHOIS với API key. | Đã kiểm tra các endpoint RDAP công khai và test adapter BKNS bằng phản hồi mô phỏng. **Chưa thử BKNS bằng key của người dùng hoặc luồng xin quyền trên Chrome/Edge**. Không có key BKNS thì tra `.vn` thủ công tại VNNIC. |
| Mạng LAN | Lấy adapter mạng, địa chỉ và đầu ra `ipconfig`; ẩn JSON ở giao diện; nếu không có `ipconfig` thì hiện danh sách adapter dễ đọc. | Local Agent; đã thử trên Windows. |
| IP Public | Lấy IP từ ipify; nút **Sao chép IP** chỉ sao chép IPv4/IPv6 hợp lệ. | Endpoint ipify công khai và test xử lý kết quả. |

## Giao diện và dữ liệu

- Popup chỉ chọn công cụ khi người dùng bấm; các công cụ VM, Mạng LAN, IP Public chạy ngay khi chọn. Các công cụ cần đích nhận domain/IP qua ô nhập; popup có thể điền hostname từ tab đang mở hoặc văn bản chọn từ menu chuột phải.
- Có giao diện sáng/tối theo hệ thống, trạng thái đang chạy/lỗi, nút sao chép theo loại kết quả và tối đa 3 mục gần đây trong popup.
- Lịch sử cục bộ lưu tối đa 50 kết quả khi bật tùy chọn; trang lịch sử cho phép xem lại, xóa sau xác nhận và xuất HTML. Báo cáo HTML **mặc định thu gọn** từng kết quả, bấm để mở chi tiết; nội dung được escape trước khi chèn vào HTML.
- Cài đặt gồm timeout, lưu lịch sử, MXToolbox API key và BKNS WHOIS API key. Key nằm trong `chrome.storage.local` **không mã hóa**, không được đưa vào bản ghi lịch sử/báo cáo; chỉ gửi cho dịch vụ tương ứng khi chạy truy vấn.
- VM chỉ đọc DOM của đường dẫn chi tiết Portal sau thao tác người dùng, không dùng content script thường trực. HTML Portal mẫu không được đóng gói vào extension.

**Đã bỏ khỏi công cụ sử dụng:** DNS hệ điều hành, DNS công cộng và HTTP / Redirect. Kết quả cũ trong lịch sử không bị xóa. Agent vẫn nhận action DNS cũ để tương thích với extension đã cài trước đó.

## Kết quả rà soát

- `npm run build`: **đạt**.
- `npm run test`: **31/31 bài test đạt** (bao gồm luồng nhiều thông báo Native Messaging).
- `npm audit --audit-level=moderate`: **0 lỗ hổng được báo** tại thời điểm rà soát.
- `go test ./...`: **đạt**.
- Thử trực tiếp Agent đã cài với Ping, Traceroute, TCP Port, Quét Port, SSL/TLS và Mạng LAN: **đều có phản hồi thành công**. Các phép thử mạng nội bộ dùng loopback; TLS dùng một tên miền công khai. Không xuất dữ liệu mạng nội bộ vào báo cáo này.
- Bộ đọc VM từ toàn bộ HTML mẫu: **trích xuất 9 trường**, các trường cốt lõi hiện diện; không sao chép dữ liệu nhạy cảm ngoài phạm vi.
- Endpoint demo MXToolbox, RDAP `.net`/`.org` và ipify: **có phản hồi công khai**. Test extension dùng phản hồi giả lập để xác nhận định dạng/trích xuất, **không thay thế kiểm thử tương tác Chrome/Edge thực tế**.

**Lỗi xác nhận và đã sửa trong đợt rà soát:** IP Public trước đây có thể báo thành công khi dịch vụ trả một chuỗi không phải IP; giờ từ chối phản hồi không có IPv4/IPv6 hợp lệ. Có test hồi quy.

## Giới hạn / việc cần thử thêm

1. Chưa chạy kiểm thử đầu-cuối của popup, quyền host, clipboard, xuất file và đọc tab Portal trên phiên Chrome/Edge đang đăng nhập. Cần tải lại extension từ `extension/dist` và kiểm tra trên trình duyệt thực tế.
2. MXToolbox với domain bất kỳ và WHOIS `.vn` cần API key của từng dịch vụ. Chưa có key của người dùng để xác nhận quota, quyền truy cập, phản hồi thực tế và các trường có thể thay đổi theo tài khoản.
3. RDAP các TLD ngoài `.com`/`.net` phụ thuộc danh mục IANA, máy chủ registry và quyền host động; một số TLD không có RDAP HTTPS hoặc bị giới hạn truy vấn. Đã thử endpoint `.org` nhưng chưa thử luồng cấp quyền của extension trên trình duyệt thật.
4. Ping/Traceroute phụ thuộc ngôn ngữ Windows, DNS/VPN/firewall và thời gian chờ; kết quả thô của lệnh vẫn hiển thị để đối chiếu. Quét Port chỉ kiểm tra kết nối TCP, không xác định chính xác dịch vụ chạy trên cổng.
5. Lịch sử, `ipconfig` và báo cáo HTML có thể chứa thông tin mạng nội bộ hoặc VM; nên tắt lưu lịch sử hoặc xóa lịch sử khi dùng trên máy chia sẻ. File HTML đã xuất cần được bảo quản riêng.

## Áp dụng phiên bản mới

Chạy `npm ci` rồi `npm run build` trong `extension/` khi dựng từ máy mới. Với bản đã cài, tải lại extension ở `chrome://extensions` hoặc `edge://extensions` để lấy `extension/dist` mới. **Bản cập nhật hiển thị theo dòng/cổng yêu cầu cài lại Local Agent** bằng `packaging/install.ps1` với Extension ID hiện tại. Agent cũ vẫn trả kết quả cuối nhưng không phát tiến độ.
