# IT Support Toolkit

Extension Chrome/Edge Manifest V3 + Windows Local Agent (Go). Bản hiện tại là **MVP thử nghiệm**, chạy local-first, không có backend, tài khoản hoặc telemetry. Kết quả kiểm tra có thể chứa IP, MAC, DNS/gateway, đường đi mạng và thông tin hạ tầng Portal; dữ liệu này được lưu cục bộ khi bật lịch sử và được đưa vào file HTML khi người dùng chủ động xuất báo cáo. Hãy tắt lịch sử/xóa kết quả và bảo vệ file báo cáo khi làm việc với hệ thống nhạy cảm.

## Bản phát hành Windows x64

**Tải [ITSupportToolkit-Windows.zip (v0.1.5)](https://github.com/thienhanaylai/Support-IT-Toolkit/releases/download/v0.1.5/ITSupportToolkit-Windows.zip)** từ GitHub Releases. Giải nén toàn bộ ZIP, đọc `readme.txt` và chạy `Install.cmd`. Trình cài tiếng Việt chép extension tới vị trí cố định, cài Agent và đăng ký Native Messaging trong HKCU; máy cài không cần Node.js/Go hay quyền Administrator. Lần cài đầu, chọn **Chrome** hoặc **Edge** để xem hướng dẫn riêng (hoặc xem hướng dẫn cho cả hai), tự nhập `chrome://extensions/` hoặc `edge://extensions/` vào thanh địa chỉ, bật **Developer mode** → **Load unpacked** thư mục `%LOCALAPPDATA%\ITSupportToolkit\extension` → dán Extension ID vào cửa sổ cài. Có thể đăng ký cả Chrome và Edge bằng hai ID cách nhau dấu phẩy. Bộ cài không tự mở trình duyệt để tránh tạo tab New Tab thay vì trang extension.

**Giới hạn của trình duyệt:** Không thể tự động bật extension unpacked trong Chrome/Edge lần đầu trên máy cá nhân. Thao tác **Load unpacked** chỉ cần một lần; khi nâng cấp hãy chạy `Install.cmd` từ ZIP mới, xác nhận ID được gợi ý và tải lại extension. Không di chuyển thư mục extension đã cài. Nếu bản cũ nằm ở thư mục khác, chuyển sang bản mới sẽ tạo ID khác và **không tự chuyển lịch sử/API key**; có thể gỡ bản cũ sau khi kiểm tra bản mới. Xem [`packaging/INSTALL.md`](packaging/INSTALL.md).

**Để nộp lên Microsoft Edge Add-ons**, tự build ZIP riêng theo [`packaging/EDGE_STORE.md`](packaging/EDGE_STORE.md), **không dùng gói Windows**. Sau khi cài bản Add-ons, trang chào mừng và Cài đặt liên kết [ZIP Agent](https://github.com/thienhanaylai/Support-IT-Toolkit/releases/download/v0.1.3/ITSupportToolkit-Agent-Windows.zip). Người dùng giải nén toàn bộ ZIP, chạy `Install.cmd` bên trong và nhập ID extension; extension không thể tự chạy CMD. ZIP nộp Edge Add-ons không đính kèm GitHub Release.

Muốn tự tạo lại EXE một file và ZIP từ mã nguồn (máy build cần Node.js/npm và Go):

```powershell
.\packaging\build-release.ps1 -Force
```

## Yêu cầu khi cài từ mã nguồn

- Windows 10/11, Chrome hoặc Edge; Node.js 20+, npm; Go 1.22+ nếu muốn tự build Agent.
- Extension ID dạng 32 chữ `a`–`p` lấy tại `chrome://extensions` hoặc `edge://extensions` sau khi bật **Developer mode**.
- Không cần quyền Administrator (đăng ký Native Messaging trong HKCU).

## Cài đặt từ mã nguồn

```powershell
cd extension
npm ci
npm run build
```

Mở `chrome://extensions` (hoặc `edge://extensions`) → bật **Developer mode** → **Load unpacked** → chọn thư mục `extension/dist` vừa tạo. Sao chép Extension ID hiển thị. Sau đó từ thư mục gốc:

```powershell
.\packaging\install.ps1 -ExtensionIds @('id_cua_extension_32_ky_tu')
```

Nếu đã có file exe build sẵn, dùng `-AgentBinary 'C:\path\it-support-host.exe'` thay Go. Để dùng cả Chrome và Edge, truyền cả hai ID: `-ExtensionIds @('id_chrome', 'id_edge')`. Mỗi lần ID thay đổi phải chạy lại installer. Nếu PowerShell chặn script, chạy với `powershell -ExecutionPolicy Bypass -File .\packaging\install.ps1 -ExtensionIds id...` khi bạn tin tưởng mã nguồn. Khởi động lại trình duyệt nếu cần.

Khi cập nhật mã Agent (ví dụ thêm **Quét Port**), tải lại extension **và chạy lại lệnh `install.ps1` với cùng Extension ID** để thay file `.exe` đã cài. Chỉ build extension sẽ không nâng cấp Agent trên máy.

Gỡ Agent và registry:

```powershell
.\packaging\uninstall.ps1
```

Gỡ extension từ trang quản lý extensions; lịch sử trên trình duyệt được quản lý trong side panel hoặc xóa dữ liệu extension. Script gỡ không xóa file ngoài thư mục Agent được tạo.

## Dùng thử

Nhấn icon extension để mở popup. Với công cụ cần domain/IP, nhập địa chỉ rồi nhấn **Kiểm tra**; **Mạng LAN**, **IP Public** và **Thông tin VM** chạy ngay khi nhấn chọn. **Ping** chọn 1–5 lần (mặc định 4), **Traceroute** chọn tối đa 1–30 hop (mặc định 20). Khi đang chạy, Ping/Traceroute hiển thị từng dòng kết quả và Quét Port hiển thị từng cổng hoàn tất; các công cụ khác hiển thị giai đoạn chờ thực tế (không thể đọc từng dòng từ API HTTP). **Quét Port** cho phép chọn 20 cổng TCP phổ biến hoặc nhập tối đa 32 cổng/dải nhỏ, hiển thị mở/đóng/timeout; chạy từ chính máy bạn với tối đa 6 kết nối song song, tối đa 2 giây/cổng. Để nhận tiến độ theo dòng/cổng, **cần cài lại Local Agent** bằng `packaging/install.ps1` với Extension ID hiện tại; Agent cũ chỉ gửi kết quả cuối. Chỉ kiểm tra target mà bạn được phép kiểm tra. MXToolbox, WHOIS và IP Public có thể xin quyền truy cập host trước khi gửi truy vấn. Có thể chọn văn bản trên trang rồi dùng menu chuột phải **Kiểm tra bằng IT Support Toolkit**. Nhấn một mục **Gần đây** hoặc trong danh sách lịch sử để mở lại kết quả. **Ping** chỉ hiển thị đầu ra lệnh (không hiện JSON); **Sao chép dòng lệnh** lấy nguyên văn đầu ra của Agent. Các kết quả VM, MXToolbox, WHOIS và Quét Port được sao chép dạng văn bản; **IP Public** chỉ sao chép địa chỉ IP. Trang lịch sử (`sidepanel.html`) không có thanh header thương hiệu, lưu tối đa 50 kết quả và xuất báo cáo HTML: các mục mặc định thu gọn, bấm từng mục mới xem chi tiết (dữ liệu được escape). Giao diện tự theo theme sáng/tối của hệ thống; đầu ra lệnh hiển thị nền đen chữ trắng. Options chỉnh timeout 500–10000 ms và lưu lịch sử. Công cụ HTTP / Redirect đã được bỏ; các kết quả cũ trong lịch sử vẫn được giữ lại.

Popup đặt ô nhập trong nhóm công cụ dùng Domain/IP; Thông tin VM là một nhóm riêng, Mạng LAN và IP Public nằm trong nhóm Thông tin mạng và chạy ngay khi chọn. Tiến trình, lỗi và kết quả hiển thị ngay trong nhóm tương ứng.

Popup có **Tạo mật khẩu** dùng `crypto.getRandomValues()` của trình duyệt, hỗ trợ số, chữ thường, chữ hoa, ký tự đặc biệt, độ dài 4–128 và danh sách loại trừ. Mỗi nhóm ký tự đã chọn được bảo đảm xuất hiện khi độ dài cho phép. Có thể sao chép mật khẩu sau khi tạo. Tối đa ba mật khẩu gần nhất chỉ được giữ trong `chrome.storage.session` của phiên trình duyệt để xem lại; không đưa vào lịch sử kiểm tra, báo cáo HTML hoặc `chrome.storage.local`.
Mục **Gần đây** trong popup hiển thị tối đa 5 lượt kiểm tra; lịch sử đầy đủ vẫn chứa tối đa 50 lượt. Nếu vô tình đóng popup khi đang chạy, tác vụ tiếp tục trong service worker; mở lại popup để xem tiến trình và kết quả. Nội dung đang nhập, công cụ đã chọn và kết quả gần nhất được giữ trong **phiên trình duyệt** ngay cả khi tắt lưu lịch sử. Khởi động lại trình duyệt hoặc tải lại extension có thể ngắt tác vụ; lúc đó popup báo gián đoạn và giữ tiến trình cuối đã ghi, không tự chạy lại. Muốn lưu kết quả qua lần khởi động trình duyệt, hãy bật lưu lịch sử.
Popup rộng 660 px để đầu ra Mạng LAN dễ đọc hơn. Thanh cuộn trong kết quả được ẩn nhưng vẫn cuộn được bằng chuột, bàn di chuột hoặc bàn phím khi đặt focus vào đầu ra.
Header nhỏ ở đầu popup ghi **LongVanSupport Toolkit** và chứa nút **Cài đặt**; popup không còn footer.

### Thông tin VM từ Portal

Mở **tab đang đăng nhập** tại `https://portal.longvan.vn/computing-manager/manager/computing/computing_detail.xhtml?...`, bấm biểu tượng extension rồi bấm **Thông tin VM**. Extension chỉ thực thi đoạn đọc DOM khi bạn bấm nút, chỉ trên chính đường dẫn Portal này; không gọi API, không đọc mật khẩu hoặc form ẩn. Kết quả gồm Link VM, Tên computing, Nhóm ảo hóa, Nhóm, Tên VM, VMID, VMP, Host, ResourcePool. Giá trị trống trên trang vẫn để trống; nếu trang đổi cấu trúc hoặc chưa đăng nhập sẽ báo lỗi. Thông tin VM được lưu trong lịch sử cục bộ nếu tùy chọn lưu lịch sử bật.

File HTML Portal mẫu tại thư mục gốc chỉ dùng để xác nhận cấu trúc và **không được đóng gói vào extension**; `.gitignore` loại trừ bản lưu Portal để tránh vô tình commit thông tin nội bộ.

### Chuyển cấu hình Dịch vụ → Tạo computing

Mở trang chi tiết **Dịch vụ** trên `portal.longvan.vn`; extension chèn nút **Sao chép thông số** trực tiếp cạnh nút **Thêm** của **Nhóm thuộc tính**. Extension đọc các giá trị đang hiển thị: CORE, RAM, Internet, một loại STORAGE, OS và Site Provider; không sao chép IP, Backup hay form chỉnh sửa ẩn. CPU/RAM/Internet/Disk dùng để điền VM; OS và Site Provider chỉ hiển thị để đối chiếu. Dữ liệu được giữ tạm trong `chrome.storage.session` của extension (không ghi vào lịch sử hoặc clipboard hệ thống).

Chuyển sang trang **Tạo computing** cùng trình duyệt; nút **Dán cấu hình đã sao chép** xuất hiện trực tiếp ở đầu phần **Tài nguyên**. Extension sử dụng các widget PrimeFaces, chờ cập nhật AJAX sau từng thay đổi, theo đúng thứ tự **CPU → RAM → Internet → Disk** (loại ổ đĩa rồi dung lượng). Nếu một ô hoặc lần cập nhật không hợp lệ, thao tác dừng và báo những trường đã điền; hãy kiểm tra lại trước khi tiếp tục. Extension **không tự bấm Lưu/Tạo VM**. Tính năng chỉ hoạt động trên hai đường dẫn Portal tương ứng và cần trang đã tải xong. Bản HTML lưu offline chỉ dùng để đối chiếu DOM; cần kiểm thử thêm với Portal đăng nhập thật.

### MXToolbox và WHOIS

- **MXToolbox:** dùng [API chính thức](https://mxtoolbox.com/api/api-reference) cho DNS, A, AAAA, MX, TXT, SPF, DMARC, SOA. Chỉ hiển thị loại tra cứu/domain, DNS server, thời gian và các trường Type, Domain Name, IP Address, TTL của bản ghi (nếu API cung cấp). Khi chưa có key, popup hiển thị nút **Nhập API key** trước khi kiểm tra tên miền bất kỳ; key UUID hợp lệ có thể được nhập và lưu ngay tại đó hoặc trong Cài đặt. API key lưu tại `chrome.storage.local` **không mã hóa**, bị giới hạn khỏi content script trên Chromium hỗ trợ và chỉ gửi trong header tới MXToolbox khi bạn chạy công cụ; không ghi vào lịch sử hoặc báo cáo. Các trường kết quả có tên dạng API key, authorization, password, secret hoặc access/refresh/session token được tự động ẩn trước khi lưu lịch sử/xuất báo cáo. API có hạn mức theo tài khoản. Không có key chỉ được thử lệnh DNS với `example.com` qua endpoint demo của MXToolbox.
- **WHOIS:** tự tách tên miền đăng ký khỏi host bằng Public Suffix List (ví dụ `portal.longvan.vn` → `longvan.vn`). Khi bạn nhấn **Kiểm tra**, extension xin quyền `longvan.net`, mở `https://longvan.net/domain/whois?ten_mien=<tên-miền>` trong **tab nền không kích hoạt** (không tự chuyển khỏi tab bạn đang dùng), chờ trang hiển thị kết quả rồi chỉ đọc tên miền, nhà đăng ký, ngày đăng ký/hết hạn, trạng thái, nameserver và DNSSEC; sau đó tự đóng tab tạm kể cả khi tra cứu lỗi. Không cần BKNS key hoặc mở VNNIC, không gọi RDAP. **Không lưu thông tin chủ thể, registrant hay HTML/WHOIS thô.** Long Vân là nguồn tổng hợp bên ngoài, không phải registry có thẩm quyền; dữ liệu có thể chậm cập nhật. Nếu trang đổi giao diện, cần xác minh hoặc chưa trả kết quả, extension báo lỗi chứ không suy đoán tên miền còn trống. Trang Long Vân có thể tải nội dung/analytics của chính họ khi tab tạm mở.

| Công cụ | Nguồn | Ghi chú |
|---|---|---|
| Ping, traceroute, TCP port, Quét Port, TLS, LAN | Windows Local Agent | Traceroute dùng `tracert -d`, ping dùng `ping`; Quét Port chỉ thử kết nối TCP, không quét UDP; Ping hiển thị kết quả lệnh thay vì JSON. |
| IP Public | ipify | Truy vấn gửi ra dịch vụ bên ngoài. |
| MXToolbox / WHOIS | API MXToolbox / trang Long Vân | MXToolbox cần API key cho domain bất kỳ; WHOIS đọc kết quả Long Vân trong tab nền không kích hoạt sau khi xin quyền host. |
| Thông tin VM | Tab Portal đang mở | Đọc đúng chín trường trong DOM khi người dùng bấm nút; không cần Agent. |

SSL/TLS **cơ bản** được kiểm tra bởi Agent từ máy người dùng; browser API không cho extension đọc certificate chain của trang tùy ý. TLS result bao gồm xác minh chain/hostname, thời hạn và TLS version. IP LAN lấy từ Go network interfaces; gateway và DNS có trong trường `ipconfig` (văn bản theo ngôn ngữ Windows), chưa được tách thành trường cấu trúc.

### Khắc phục lỗi Agent

1. Kiểm tra `ExtensionIds` đã truyền đúng ID của bản extension vừa cài và chưa đổi sau khi rebuild/load.
2. Kiểm tra file `%LOCALAPPDATA%\ITSupportToolkit\com.itsupport.toolkit.json` và `it-support-host.exe`.
3. Kiểm tra registry `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.itsupport.toolkit` hoặc đường tương ứng `Microsoft\Edge`.
4. Đóng/mở lại browser rồi thử `TCP Port` tới host mà bạn có quyền kiểm tra. Agent chạy dưới tài khoản Windows hiện tại, không phải service.
5. Nếu không có Go, cài Go 1.22+ hoặc build exe ở máy khác rồi dùng `-AgentBinary`.

## Bảo mật và giới hạn

Extension không còn cung cấp hai công cụ DNS hệ điều hành và DNS công cộng; Agent vẫn nhận action `dns_lookup` cũ để tương thích với bản extension đã cài trước đó. Agent nhận các action `ping`, `traceroute`, `tcp_check`, `port_scan`, `dns_lookup`, `tls_check`, `local_interfaces`; validate host/port/timeout; giới hạn số ping, số hop, số cổng quét, kích thước message. `ping`, `tracert`, `ipconfig` chỉ được gọi với tham số cố định qua `exec.CommandContext`, không dùng shell. Native Messaging dùng `allowed_origins` giới hạn theo Extension ID, không mở cổng TCP. Không nhận yêu cầu từ content script hoặc website. Không xử lý/upload private key và không có nơi nhập private key. Lịch sử có thể chứa thông tin mạng nội bộ: hãy tắt lưu lịch sử khi cần. Chỉ kiểm tra mạng mà bạn được phép.

**Chưa nằm trong MVP này:** chuyển đổi/ghép PFX, P12, JKS, so khớp private key; giao diện side panel tích hợp browser toolbar; installer có chữ ký, CI và E2E thực trên Chrome/Edge/Windows. Cần kiểm chứng thêm các tình huống proxy/VPN/IPv6, ngôn ngữ Windows và firewall trước khi phát hành sản phẩm.

## Phát triển và kiểm thử

```powershell
cd extension
npm ci
npm run test
npm run build
cd ..\native-agent
go test ./...
go build -o bin\it-support-host.exe ./cmd/host
```

Mã Agent giao tiếp theo [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging): mỗi JSON object có prefix 4 byte little-endian, stdout chỉ dành cho giao thức, lỗi chẩn đoán in stderr. Ví dụ: `{"action":"ping","target":"8.8.8.8","count":4,"timeoutMs":1000}`.
