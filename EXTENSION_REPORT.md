# Báo cáo IT Support Toolkit Extension

**Ngày rà soát:** 25/11/2026
**Phiên bản manifest:** 0.1.6 (Chrome/Edge Manifest V3)
**Phạm vi:** extension trong `extension/`, Windows Local Agent trong `native-agent/`.

## Extension hiện làm được gì?

| Công cụ | Khả năng | Nguồn / mức kiểm chứng |
|---|---|---|
| Thông tin VM | Đọc tab chi tiết computing của Portal **khi người dùng bấm nút**; xuất đúng 9 trường: Link VM, Tên computing, Nhóm ảo hóa, Nhóm, Tên VM, VMID, VMP, Host, ResourcePool. Không lấy ô chỉnh sửa ẩn. | DOM của tab Portal; đã đối chiếu với HTML mẫu thực tế và test bộ trích xuất. Chưa thử trên phiên Portal đang đăng nhập trong Chrome/Edge. |
| Ping | Chọn 1–5 lần ping (mặc định 4); hiển thị từng dòng khi đang chạy và kết quả cuối không có JSON. | Local Agent; đã thử luồng nhiều thông báo với loopback trên Windows và test tham số gửi tới Agent. |
| Traceroute | Chọn tối đa 1–30 hop (mặc định 20); hiện từng dòng/hop của `tracert -d` trên Windows. | Local Agent; đã thử với loopback; có test tham số gửi tới Agent. |
| TCP Port | Kiểm tra kết nối tới một cổng TCP và trả trạng thái mở/đóng/timeout. | Local Agent; đã thử qua Agent và test Go với cổng loopback. |
| Quét Port | Quét 20 cổng phổ biến hoặc danh sách tối đa 32 cổng; hiện từng cổng hoàn tất, tối đa 6 kết nối đồng thời, 2 giây mỗi cổng. | Local Agent; đã thử luồng nhiều thông báo và test Go với loopback. Máy dùng Agent cũ phải cài lại Agent để có tiến độ. |
| SSL / TLS | Kiểm tra phiên bản TLS, chứng chỉ, thời hạn và kết quả xác minh chain/hostname. Giao diện tách trạng thái, ngày hiệu lực/hết hạn, chủ thể, nhà phát hành, SAN và thu gọn chuỗi chứng chỉ. | Local Agent; đã thử kết nối TLS tới tên miền công khai. Có test hiển thị dữ liệu hợp lệ/không hợp lệ, thiếu trường và escape văn bản. |
| MXToolbox | Tra DNS/NS, A, AAAA, MX, TXT, SPF, DMARC, SOA; hiển thị loại tra cứu/domain, DNS server, thời gian và các trường Type, Domain Name, IP Address, TTL nếu có. | API MXToolbox; endpoint demo DNS `example.com` trả dữ liệu và có test lọc kết quả. Truy vấn domain khác cần API key riêng; **chưa thử với key của người dùng**. |
| WHOIS | Tách tên miền đăng ký khỏi hostname, mở URL WHOIS Long Vân trong tab nền không kích hoạt rồi đọc kết quả đã hiển thị: nhà đăng ký, ngày, trạng thái, NS, DNSSEC; tự đóng tab. Hiển thị kết quả thành các mục dễ đọc. Không dùng RDAP/BKNS/VNNIC. | Đã xem trang Long Vân thật với `.app` và `.vn`, kiểm thử bộ đọc DOM bằng mẫu và kiểm tra không lưu chủ thể. Chưa thử đầu-cuối trong extension Chrome/Edge. |
| Mạng LAN | Lấy adapter mạng, địa chỉ và đầu ra `ipconfig`; ẩn JSON ở giao diện; nếu không có `ipconfig` thì hiện danh sách adapter dễ đọc. | Local Agent; đã thử trên Windows. |
| IP Public | Local Agent chạy `curl.exe` với URL cố định `https://ifconfig.me/ip`; nút **Sao chép IP** chỉ sao chép IPv4/IPv6 hợp lệ. | Agent kiểm tra đầu ra bằng parser IP; extension không xin quyền host ipify. |

## Giao diện và dữ liệu

- Popup chia nhóm Tạo mật khẩu, công cụ cần Domain/IP, Thông tin VM và Thông tin mạng (Mạng LAN, IP Public chạy ngay khi chọn). Độ dài mật khẩu có thể nhập trực tiếp; nút **Lưu tùy chọn** kiểm tra và lưu cấu hình dùng chung. Tùy chọn tạo mật khẩu được dùng chung với nút **Tạo mật khẩu** và cửa sổ **Tùy chọn** nổi phía trên nút trên trang Tạo computing; hai nút được thu nhỏ khoảng 15%. Popover có nút **Lưu** riêng, được tách khỏi DOM của form để không đẩy hoặc làm vỡ bố cục, còn nhãn nút giữ nguyên khi mở/đóng. Cửa sổ đóng bằng dấu **×**, phím `Esc` hoặc bấm ra ngoài. Mật khẩu vừa sinh được điền vào form, hiển thị ngay tại đó và có nút **Copy** riêng. Chỉ tùy chọn được lưu lâu dài, còn mật khẩu gần đây vẫn nằm trong session. Tiến trình, lỗi và kết quả hiển thị trong đúng nhóm; popup có thể điền hostname từ tab đang mở hoặc văn bản chọn từ menu chuột phải.
- Có giao diện sáng/tối theo hệ thống, trạng thái đang chạy/lỗi, nút sao chép theo loại kết quả và tối đa 5 mục gần đây trong popup. Cửa sổ mở từ menu chuột phải đủ rộng cho popup 660 px.
- Cài mới mở `welcome.html` với Extension ID và link GitHub Release tải ZIP Agent; trang Cài đặt giữ link này khi người dùng cần cài lại. Người dùng giải nén rồi chạy `Install.cmd` bên trong; extension không tự chạy file CMD. Không mở lại trang chào mừng khi cập nhật extension.
- Tiến trình chạy trong service worker; `chrome.storage.session` giữ ô nhập, công cụ, tiến trình và kết quả khi đóng/mở lại popup. Nếu worker bị ngắt, báo trạng thái gián đoạn thay vì hiển thị đang chạy mãi; tắt lưu lịch sử vẫn không ghi kết quả phiên này xuống đĩa. Chưa kiểm tra đầu-cuối khi đóng/mở popup trong profile trình duyệt thật.
- Lịch sử cục bộ lưu tối đa 50 kết quả khi bật tùy chọn; trang lịch sử cho phép xem lại, xóa sau xác nhận và xuất HTML. Báo cáo HTML **mặc định thu gọn** từng kết quả, bấm để mở chi tiết; nội dung được escape trước khi chèn vào HTML.
- Cài đặt gồm timeout, lưu lịch sử và MXToolbox API key. Key nằm trong `chrome.storage.local` **không mã hóa**, không được đưa vào lịch sử/báo cáo. Key BKNS cũ, nếu có, không còn được sử dụng và có thể xóa trong Cài đặt.
- VM chỉ đọc DOM của đường dẫn chi tiết Portal sau thao tác người dùng, không dùng content script thường trực. HTML Portal mẫu không được đóng gói vào extension.

**Đã bỏ khỏi công cụ sử dụng:** DNS hệ điều hành, DNS công cộng và HTTP / Redirect. Kết quả cũ trong lịch sử không bị xóa. Agent vẫn nhận action DNS cũ để tương thích với extension đã cài trước đó.

## Kết quả rà soát

- `npm run build`: **đạt**.
- `npm run test`: **94/94 bài test đạt** (bao gồm trang Cài đặt/lịch sử, tạo mật khẩu và điền nhanh Password trên Portal, đối chiếu OS/Template và Site Provider/Khu vực mà không tự sửa, nhập MXToolbox API key trong popup, chuyển cấu hình Dịch vụ → Tạo computing theo thứ tự, quyền Portal tùy chọn, thử lại Thông tin VM, trang chào mừng/link Agent, khôi phục popup, Native Messaging, WHOIS và giao diện SSL/TLS). WHOIS luôn dùng tab nền không kích hoạt trong cửa sổ trình duyệt bình thường và đóng tab sau khi tra cứu.
- `npm audit --audit-level=moderate`: **0 lỗ hổng được báo** tại thời điểm rà soát.
- `go test ./...`: **đạt**.
- Kiểm tra gói Windows sau khi đóng gói: bản extension trong `extension/dist` có manifest v0.1.6, đủ bốn icon, trang chào mừng và content script Portal; ZIP Windows gồm extension, installer và Agent Windows x64 mới có action IP Public. Theo phạm vi phát hành v0.1.6, **không dựng và không đính kèm gói Edge Add-ons**.
- EXE một file nhúng nguyên vẹn ZIP hiện tại, `--verify` tự giải nén và kiểm tra đủ file bắt buộc; kiến trúc Windows x64. Luồng nâng cấp dùng lại Extension ID đã đăng ký được kiểm tra với thư mục và Agent giả lập cách ly, **không chạy bộ cài thật trên máy**.
- Kiểm tra popup bằng trình duyệt với dữ liệu mô phỏng: rộng 660 px, 5 mục gần đây, WHOIS hiển thị theo mục, Mạng LAN vẫn cuộn được khi ẩn thanh cuộn. Đây không phải phiên extension được cài trong trình duyệt.
- Các script PowerShell trong `packaging/` đã được kiểm tra cú pháp. Bộ cài Windows hiển thị tiếng Việt, hỏi chọn Chrome, Edge hoặc xem hướng dẫn cho cả hai; ba nhánh đã được thử bằng `packaging/test-setup.ps1` với Agent giả lập. Bộ cài không tự mở trình duyệt: thử trên profile tách biệt xác nhận Chrome/Edge chuyển địa chỉ nội bộ từ dòng lệnh thành New Tab. `setup.ps1` và `install.ps1` dùng đúng một UTF-8 BOM để Windows PowerShell 5.1 hiển thị tiếng Việt; manifest Native Messaging vẫn ghi UTF-8 không BOM. ZIP/EXE cài tay có `readme.txt` riêng; **chưa chạy installer thật** để tránh thay đổi registry hoặc extension đang dùng trên máy.
- `packaging/agent/test-setup.ps1`: bản Agent mô phỏng giữ ID cũ, thêm ID mới, từ chối ID sai và kiểm tra CMD/PowerShell hiển thị tiếng Việt. Chưa chạy CMD tải từ GitHub đầu-cuối hoặc đăng ký Native Messaging thật trên máy người dùng.
- Thử trực tiếp Agent đã cài với Ping, Traceroute, TCP Port, Quét Port, SSL/TLS và Mạng LAN: **đều có phản hồi thành công**. Các phép thử mạng nội bộ dùng loopback; TLS dùng một tên miền công khai. Không xuất dữ liệu mạng nội bộ vào báo cáo này.
- Bộ đọc VM từ toàn bộ HTML mẫu: **trích xuất 9 trường**, các trường cốt lõi hiện diện; không sao chép dữ liệu nhạy cảm ngoài phạm vi.
- Endpoint demo MXToolbox và trang WHOIS Long Vân (`paophim.app`, `vnnic.vn`): **có phản hồi công khai**. IP Public được kiểm thử qua parser đầu ra của Agent; test extension dùng DOM/messaging mô phỏng để xác nhận định dạng và luồng xử lý, **không thay thế kiểm thử tương tác Chrome/Edge thực tế**.

**Lỗi xác nhận và đã sửa trong đợt rà soát:** IP Public trước đây có thể báo thành công khi dịch vụ trả một chuỗi không phải IP; giờ từ chối phản hồi không có IPv4/IPv6 hợp lệ. Có test hồi quy.

## Giới hạn / việc cần thử thêm

1. Chưa chạy kiểm thử đầu-cuối của popup, quyền host, clipboard, xuất file và đọc tab Portal trên phiên Chrome/Edge đang đăng nhập. Chrome cài trên máy không cho tải extension unpacked qua cờ dòng lệnh trong phép thử headless; cần **Load unpacked thủ công** và kiểm tra trên trình duyệt thực tế.
2. MXToolbox với domain bất kỳ vẫn cần API key. WHOIS phụ thuộc trang Long Vân và JavaScript của trang; HTML tải trực tiếp chưa có dữ liệu. Tab nền có thể gặp CAPTCHA/giới hạn hoặc thay đổi bố cục; không tự vượt xác minh. Kết quả Long Vân là tổng hợp bên ngoài, cần đối chiếu nhà đăng ký/registry khi yêu cầu độ chính xác pháp lý.
3. Quyền host `longvan.net` và quá trình mở/đóng tab nền chưa được thử đầu-cuối trong Chrome/Edge thực tế. Nếu việc tải trang bị trì hoãn hoặc trang chưa hiển thị đúng tên miền thì báo lỗi, không lưu kết quả.
4. Ping/Traceroute phụ thuộc ngôn ngữ Windows, DNS/VPN/firewall và thời gian chờ; kết quả thô của lệnh vẫn hiển thị để đối chiếu. Quét Port chỉ kiểm tra kết nối TCP, không xác định chính xác dịch vụ chạy trên cổng.
5. Lịch sử, `ipconfig` và báo cáo HTML có thể chứa thông tin mạng nội bộ hoặc VM; nên tắt lưu lịch sử hoặc xóa lịch sử khi dùng trên máy chia sẻ. File HTML đã xuất cần được bảo quản riêng.
6. Chưa chạy `go test -race`: môi trường thiếu trình biên dịch C/CGO; `go test ./...` vẫn đạt.

## Áp dụng phiên bản mới

Đã có gói **một file** `release/ITSupportToolkit-Windows.exe` (Windows x64) tự giải nén và chạy cài đặt, bên cạnh ZIP `release/ITSupportToolkit-Windows.zip`. Trên máy mới không cần Node.js/Go; chạy EXE, **Load unpacked một lần** trong Chrome/Edge và nhập Extension ID để đăng ký Native Messaging. Trình duyệt không hỗ trợ bỏ qua thao tác người dùng này với bản unpacked. Khi cập nhật, chạy EXE mới để dùng lại ID đã đăng ký ở cùng thư mục, rồi tải lại extension; Agent cũ vẫn trả kết quả cuối nhưng không phát tiến độ. Máy đã cài extension ở thư mục cũ sẽ có ID mới khi chuyển sang thư mục cài cố định, không tự di chuyển dữ liệu lịch sử/API key. Chưa chạy installer đầu-cuối trên profile Chrome/Edge thật; `--verify` chỉ kiểm tra khả năng tự giải nén và file bắt buộc.
