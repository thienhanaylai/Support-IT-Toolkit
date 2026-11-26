# IT Support Toolkit

Extension Chrome/Edge Manifest V3 + Windows Local Agent (Go). Bản hiện tại là **MVP thử nghiệm**, chạy local-first, không có backend, tài khoản hoặc telemetry. Kết quả kiểm tra có thể chứa IP, MAC, DNS/gateway, đường đi mạng và thông tin hạ tầng Portal; dữ liệu này được lưu cục bộ khi bật lịch sử và được đưa vào file HTML khi người dùng chủ động xuất báo cáo. Hãy tắt lịch sử/xóa kết quả và bảo vệ file báo cáo khi làm việc với hệ thống nhạy cảm.

## Bản phát hành Windows x64

**Tải [ITSupportToolkit-Windows.zip (v0.1.9)](https://github.com/thienhanaylai/Support-IT-Toolkit/releases/download/v0.1.9/ITSupportToolkit-Windows.zip)** từ GitHub Releases. Giải nén toàn bộ ZIP, đọc `readme.txt` và chạy `Install.cmd`. Trình cài tiếng Việt chép extension tới vị trí cố định, cài Agent và đăng ký Native Messaging trong HKCU; máy cài không cần Node.js/Go hay quyền Administrator. Lần cài đầu, chọn **Chrome**, **Edge** hoặc **cả hai**; bộ cài mở cửa sổ trình duyệt mới và dùng UI Automation để điều hướng đến `chrome://extensions/` hoặc `edge://extensions/`. Sau đó bật **Developer mode** → **Load unpacked** thư mục `%LOCALAPPDATA%\ITSupportToolkit\extension` → dán Extension ID vào cửa sổ cài. Có thể đăng ký cả Chrome và Edge bằng hai ID cách nhau dấu phẩy. Nếu tự động điều hướng thất bại, trình cài hiển thị địa chỉ để mở thủ công.

**Giới hạn của trình duyệt:** Bản **Load unpacked/dev không tự kiểm tra hoặc tải bản mới từ GitHub**, và không thể tự động bấm Reload trong Chrome/Edge trên máy cá nhân. Thao tác **Load unpacked** chỉ cần một lần. Khi nâng cấp bản dev, chạy EXE mới hoặc `Install.cmd` từ ZIP mới; bộ cài dùng lại ID đã đăng ký, cập nhật extension + Agent và dọn bundle build cũ. Không gỡ/Load unpacked lại: mở `chrome://extensions/` hoặc `edge://extensions/`, bấm **Reload/Tải lại** trên thẻ IT Support Toolkit, rồi refresh các tab Portal. Không di chuyển thư mục extension đã cài. Giữ cùng đường dẫn và Extension ID sẽ giữ dữ liệu `chrome.storage.local` gồm Authenticator, lịch sử, API key và tùy chọn; dữ liệu tạm trong `chrome.storage.session` có thể mất khi reload. Nếu bản cũ nằm ở thư mục khác, bản mới có thể có ID khác và dữ liệu không tự chuyển; chỉ gỡ bản cũ sau khi kiểm tra bản mới. Xem [`packaging/INSTALL.md`](packaging/INSTALL.md).

Ở lần cài mới, bộ cài sao chép sẵn đường dẫn `%LOCALAPPDATA%\ITSupportToolkit\extension` vào clipboard và mở thư mục bằng File Explorer. Sau khi bấm **Load unpacked**, có thể nhấn `Ctrl+L`, `Ctrl+V`, `Enter` và **Select Folder** thay vì tự tìm thư mục. Edge vẫn yêu cầu người dùng xác nhận thao tác này.

**Để nộp lên Microsoft Edge Add-ons**, dùng ZIP riêng theo [`packaging/EDGE_STORE.md`](packaging/EDGE_STORE.md), **không dùng gói Windows**. Sau khi cài bản Add-ons, trang chào mừng và Cài đặt liên kết [ZIP Agent](https://github.com/thienhanaylai/Support-IT-Toolkit/releases/download/v0.1.9/ITSupportToolkit-Agent-Windows.zip). Người dùng giải nén toàn bộ ZIP, chạy `Install.cmd` bên trong và nhập ID extension; extension không thể tự chạy CMD. ZIP nộp Edge Add-ons không đính kèm GitHub Release.

Muốn tự tạo lại EXE một file và ZIP từ mã nguồn (máy build cần Node.js/npm và Go):

```powershell
.\packaging\build-release.ps1 -Force
```

### Quy tắc phát hành

- **Không tải `Install.cmd` lên GitHub Releases**, kể cả khi script đóng gói Agent tạo file này trong thư mục `release/`. File chỉ dùng cục bộ hoặc nằm trong ZIP.
- Chỉ đính kèm `ITSupportToolkit-Windows.zip`, `ITSupportToolkit-Windows.exe` và (khi cần) `ITSupportToolkit-Agent-Windows.zip`.
- Không dựng hoặc đính kèm gói Edge Add-ons trừ khi có yêu cầu riêng.
- Kiểm tra danh sách tài sản của release sau khi tải lên; nếu có `Install.cmd`, xóa ngay khỏi release.

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

### Cập nhật bản dev đã Load unpacked

- Nếu đang Load unpacked trực tiếp từ `extension/dist`: chạy lại `npm run build` trong `extension`, giữ nguyên thư mục, rồi bấm **Reload/Tải lại** tại `chrome://extensions/` hoặc `edge://extensions/`. Không gỡ và không Load unpacked lại.
- Nếu đang Load unpacked từ `%LOCALAPPDATA%\ITSupportToolkit\extension`: chạy EXE mới hoặc `Install.cmd` trong ZIP Windows mới. Bộ cài cập nhật extension + Agent bằng ID cũ; sau đó bấm **Reload/Tải lại** và refresh tab Portal.
- Bản dev không tự tải update từ GitHub/Edge Add-ons. Chỉ bản cài từ cửa hàng mới được trình duyệt quản lý cập nhật tự động.
- Giữ nguyên Extension ID sẽ giữ dữ liệu `chrome.storage.local`. Đổi ID hoặc gỡ rồi cài từ đường dẫn khác sẽ tạo vùng dữ liệu riêng.

Khi cập nhật mã Agent (ví dụ thêm **Quét Port**), tải lại extension **và chạy lại lệnh `install.ps1` với cùng Extension ID** để thay file `.exe` đã cài. Chỉ build extension sẽ không nâng cấp Agent trên máy.

Gỡ Agent và registry:

```powershell
.\packaging\uninstall.ps1
```

Gỡ extension từ trang quản lý extensions; lịch sử trên trình duyệt được quản lý trong side panel hoặc xóa dữ liệu extension. Script gỡ không xóa file ngoài thư mục Agent được tạo.

## Dùng thử

Nhấn icon extension để mở popup. Với công cụ cần domain/IP, nhập địa chỉ rồi nhấn **Kiểm tra**; **Mạng LAN**, **IP Public** và **Thông tin VM** chạy ngay khi nhấn chọn. **Ping** chọn 1–5 lần (mặc định 4), **Traceroute** chọn tối đa 1–30 hop (mặc định 20). Khi đang chạy, Ping/Traceroute hiển thị từng dòng kết quả và Quét Port hiển thị từng cổng hoàn tất; các công cụ khác hiển thị giai đoạn chờ thực tế (không thể đọc từng dòng từ API HTTP). **Quét Port** cho phép chọn 20 cổng TCP phổ biến hoặc nhập tối đa 32 cổng/dải nhỏ, hiển thị mở/đóng/timeout; chạy từ chính máy bạn với tối đa 6 kết nối song song, tối đa 2 giây/cổng. Để nhận tiến độ theo dòng/cổng và dùng IP Public qua `curl.exe`, **cần cài lại Local Agent** bằng `packaging/install.ps1` với Extension ID hiện tại. Chỉ kiểm tra target mà bạn được phép kiểm tra. MXToolbox và WHOIS có thể xin quyền truy cập host trước khi gửi truy vấn; IP Public chạy qua Local Agent nên không xin quyền host trong Edge. Có thể chọn văn bản trên trang rồi dùng menu chuột phải **Kiểm tra bằng IT Support Toolkit**. Nhấn một mục **Gần đây** hoặc trong danh sách lịch sử để mở lại kết quả. **Ping** chỉ hiển thị đầu ra lệnh (không hiện JSON); **Sao chép dòng lệnh** lấy nguyên văn đầu ra của Agent. Các kết quả VM, MXToolbox, WHOIS và Quét Port được sao chép dạng văn bản; **IP Public** chỉ sao chép địa chỉ IP. Trang lịch sử (`sidepanel.html`) không có thanh header thương hiệu, lưu tối đa 50 kết quả và xuất báo cáo HTML: các mục mặc định thu gọn, bấm từng mục mới xem chi tiết (dữ liệu được escape). Giao diện tự theo theme sáng/tối của hệ thống; đầu ra lệnh hiển thị nền đen chữ trắng. Options chỉnh timeout 500–10000 ms và lưu lịch sử. Công cụ HTTP / Redirect đã được bỏ; các kết quả cũ trong lịch sử vẫn được giữ lại.

Popup đặt ô nhập trong nhóm công cụ dùng Domain/IP; Thông tin VM là một nhóm riêng, Mạng LAN và IP Public nằm trong nhóm Thông tin mạng và chạy ngay khi chọn. Tiến trình, lỗi và kết quả hiển thị ngay trong nhóm tương ứng.

Tab **Mật khẩu** dùng `crypto.getRandomValues()` của trình duyệt, hỗ trợ số, chữ thường, chữ hoa, ký tự đặc biệt, độ dài 4–128 và danh sách loại trừ. Ô độ dài cho phép xóa và nhập trực tiếp bằng bàn phím; nút **Lưu tùy chọn** kiểm tra rồi lưu cấu hình dùng chung với tính năng tạo nhanh trên Portal. Mỗi nhóm ký tự đã chọn được bảo đảm xuất hiện khi độ dài cho phép. Có thể sao chép mật khẩu sau khi tạo. Tùy chọn gần nhất được lưu trong `chrome.storage.local`; tối đa ba mật khẩu gần nhất chỉ được giữ trong `chrome.storage.session` của phiên trình duyệt để xem lại, không đưa mật khẩu vào lịch sử kiểm tra, báo cáo HTML hoặc `chrome.storage.local`.
Mục **Gần đây** trong popup hiển thị tối đa 5 lượt kiểm tra; lịch sử đầy đủ vẫn chứa tối đa 50 lượt. Nếu vô tình đóng popup khi đang chạy, tác vụ tiếp tục trong service worker; mở lại popup để xem tiến trình và kết quả. Nội dung đang nhập, công cụ đã chọn và kết quả gần nhất được giữ trong **phiên trình duyệt** ngay cả khi tắt lưu lịch sử. Khởi động lại trình duyệt hoặc tải lại extension có thể ngắt tác vụ; lúc đó popup báo gián đoạn và giữ tiến trình cuối đã ghi, không tự chạy lại. Muốn lưu kết quả qua lần khởi động trình duyệt, hãy bật lưu lịch sử.
Popup rộng 660 px để đầu ra Mạng LAN dễ đọc hơn. Thanh cuộn trong kết quả được ẩn nhưng vẫn cuộn được bằng chuột, bàn di chuột hoặc bàn phím khi đặt focus vào đầu ra.
Header nhỏ ở đầu popup ghi **LongVanSupport Toolkit**, có ba tab **Authenticator** / **Mật khẩu** / **Công cụ** và nút **Cài đặt**; popup không còn footer. Authenticator là tab mở mặc định.

### Authenticator (TOTP)

Tab **Auth** dùng `otpauth` để đọc liên kết `otpauth://totp/` và tạo mã TOTP. Form **Thêm** nhận một hoặc nhiều liên kết cùng lúc, mỗi liên kết trên một dòng. Nút **Chọn vùng QR** mở lớp phủ trên tab đang xem; kéo khung bao quanh toàn bộ mã QR để extension chỉ chụp, cắt và đọc vùng đã chọn, hoặc nhấn `Esc` để hủy. Tính năng này không sử dụng camera. Ngoài ra có thể **Import ảnh/TXT**; ảnh QR được đọc bằng `jsQR`, file TXT cũng có thể chứa nhiều liên kết. Danh sách hiển thị nhà cung cấp, tài khoản và mã hiện tại; bấm trực tiếp vào toàn bộ thẻ để sao chép. Giữ tay nắm bên trái và kéo toàn bộ thẻ để sắp xếp, lưu thứ tự hiển thị; con trỏ giữ dạng bàn tay đang nắm, trong lúc kéo có thể lăn bánh xe hoặc giữ con trỏ gần mép trên/dưới để danh sách tự cuộn. Cũng có thể tìm kiếm hoặc xóa từng tài khoản. Trang **Cài đặt → Sao lưu Authenticator** có thể xuất file TXT để import lại; file này chứa secret TOTP dạng đọc được nên phải được bảo vệ và xóa khi không còn cần.

Trên hộp **Xác thực 2 lớp** của trang chi tiết computing, split button hiển thị trực tiếp theo dạng `LONGVAN-PT: 123456`; bấm phần chính để điền mã vào ô OTP, hoặc bấm mũi tên để chọn tài khoản khác. Mã trên nút tự làm mới khi chu kỳ TOTP đổi. Extension ưu tiên tài khoản Long Vân duy nhất; nếu không có lựa chọn duy nhất thì dùng thứ tự đã sắp xếp trong tab Auth. Content script chỉ nhận mã OTP hiện tại, không nhận secret.

Secret Authenticator không ghi dạng văn bản rõ: danh sách được mã hóa AES-GCM bằng Web Crypto trước khi lưu trong `chrome.storage.local`. Khóa ngẫu nhiên cũng nằm trong vùng lưu trữ riêng của extension để mở tự động, vì vậy đây là bảo vệ dữ liệu khi xem storage thông thường, **không thay thế mật khẩu chính hoặc kho khóa phần cứng**. Không đưa secret hoặc mã TOTP vào lịch sử kiểm tra hay báo cáo HTML. Chỉ hỗ trợ TOTP; không hỗ trợ HOTP hoặc QR `otpauth-migration://`.

### Thông tin VM từ Portal

Mở **tab đang đăng nhập** tại `https://portal.longvan.vn/computing-manager/manager/computing/computing_detail.xhtml?...`. Có thể bấm **Sao chép thông tin VM** ngay trong tiêu đề khối Thông tin trên Portal, hoặc mở extension và bấm **Thông tin VM**. Trong kết quả popup, nút **Lấy mới & sao chép** đọc lại VM của tab hiện tại, thuận tiện khi vừa chuyển sang VM khác. Extension chỉ đọc DOM khi người dùng bấm nút, chỉ trên chính đường dẫn Portal này; không gọi API, không đọc mật khẩu hoặc form ẩn. Kết quả gồm Link VM, Tên computing, Nhóm ảo hóa, Nhóm, Tên VM, VMID, VMP, Host, ResourcePool. Giá trị trống trên trang vẫn để trống; nếu trang đổi cấu trúc hoặc chưa đăng nhập sẽ báo lỗi. Thông tin VM được lưu trong lịch sử cục bộ nếu tùy chọn lưu lịch sử bật.

File HTML Portal mẫu tại thư mục gốc chỉ dùng để xác nhận cấu trúc và **không được đóng gói vào extension**; `.gitignore` loại trừ bản lưu Portal để tránh vô tình commit thông tin nội bộ.

### Chuyển cấu hình Dịch vụ → Tạo computing

Mở trang chi tiết **Dịch vụ** trên `portal.longvan.vn`; extension chèn nút **Sao chép thông số** trực tiếp cạnh nút **Thêm** của **Nhóm thuộc tính**. Extension đọc các giá trị đang hiển thị: CORE, RAM, Internet, một loại STORAGE, OS, Site Provider, tên chủ sở hữu và mã dịch vụ; không sao chép IP, Backup hay form chỉnh sửa ẩn. CPU/RAM/Internet/Disk dùng để điền VM. Tên chủ sở hữu được bỏ dấu, chuyển chữ thường, bỏ khoảng trắng và ghép với mã dịch vụ thành tên VM gợi ý (ví dụ `Chu Xuân Hà` + `20.2985.9322` → `chuxuanha-20.2985.9322`). Khi bấm **Dán cấu hình đã sao chép**, nếu OS khác Template hiện tại và có lựa chọn tương ứng, extension tự áp dụng Template trước, chờ Portal cập nhật form rồi mới điền tài nguyên. Nếu không tìm thấy Template phù hợp thì chỉ báo đỏ và tiếp tục điền tài nguyên. Site Provider vẫn chỉ được đối chiếu với **Khu vực**, không tự thay đổi. Nếu trang Dịch vụ không có OS hoặc Site Provider thì bỏ qua xử lý trường đó. Khi so sánh Template, các cách ghi **64bit**, **64-bit** và **64 bit** được coi là tương đương. Dữ liệu được giữ tạm trong `chrome.storage.session` của extension (không ghi vào lịch sử hoặc clipboard hệ thống).

Chuyển sang trang **Tạo computing** cùng trình duyệt; nút **Dán cấu hình đã sao chép** xuất hiện trực tiếp ở đầu phần **Tài nguyên**; nút **Dán tên VM** nằm ngay dưới ô **Tên** và điền tên chủ sở hữu + mã dịch vụ đã chuẩn hóa vào ô này, không tự gửi form hay tạo VM. Bên cạnh ô Password, nút **Tạo mật khẩu** dùng đúng tùy chọn gần nhất của công cụ Tạo mật khẩu, sinh bằng Web Crypto trong service worker rồi điền vào form và hiển thị dòng `Đã tạo pass: ...` kèm nút **Copy**. Hai nút **Tạo mật khẩu** và **Tùy chọn** được thu nhỏ khoảng 15%. Nút **Tùy chọn** mở cửa sổ nổi phía trên nút, gắn trực tiếp vào `document.body` bằng `position: fixed`, không đẩy nội dung hoặc thay đổi bố cục form. Nhãn nút luôn giữ nguyên **Tùy chọn** khi mở/đóng để không thay đổi chiều rộng. Cửa sổ gồm số, chữ thường, chữ hoa, ký tự đặc biệt, độ dài và danh sách loại trừ; nút **Lưu** mới ghi bản nháp vào cấu hình dùng chung. Lưu thành công không hiện thông báo; chỉ lỗi lưu mới được hiển thị. Có thể đóng cửa sổ bằng dấu **×**, phím `Esc` hoặc bấm ra ngoài. Extension không tự sao chép mật khẩu. Extension sử dụng API InputNumber của PrimeFaces, đồng bộ ô hiển thị/ô ẩn và chờ cập nhật AJAX sau từng thay đổi, theo đúng thứ tự **Template (nếu cần) → CPU → RAM → Internet → Disk** (loại ổ đĩa rồi dung lượng). Nếu Portal trả lại giá trị CPU cũ ngay sau khi đổi Template, extension lấy lại control mới và thử thêm một lần trước khi báo lỗi. Nếu một ô hoặc lần cập nhật vẫn không hợp lệ, thao tác dừng và báo những trường đã điền; hãy kiểm tra lại trước khi tiếp tục. Extension **không tự bấm Lưu/Tạo VM**. Tính năng chỉ hoạt động trên hai đường dẫn Portal tương ứng và cần trang đã tải xong. Bản HTML lưu offline chỉ dùng để đối chiếu DOM; cần kiểm thử thêm với Portal đăng nhập thật.

### MXToolbox và WHOIS

- **MXToolbox:** dùng [API chính thức](https://mxtoolbox.com/api/api-reference) cho DNS, A, AAAA, MX, TXT, SPF, DMARC, SOA. Chỉ hiển thị loại tra cứu/domain, DNS server, thời gian và các trường Type, Domain Name, IP Address, TTL của bản ghi (nếu API cung cấp). Khi chưa có key, popup hiển thị nút **Nhập API key** trước khi kiểm tra tên miền bất kỳ; key UUID hợp lệ có thể được nhập và lưu ngay tại đó hoặc trong Cài đặt. API key lưu tại `chrome.storage.local` **không mã hóa**, bị giới hạn khỏi content script trên Chromium hỗ trợ và chỉ gửi trong header tới MXToolbox khi bạn chạy công cụ; không ghi vào lịch sử hoặc báo cáo. Các trường kết quả có tên dạng API key, authorization, password, secret hoặc access/refresh/session token được tự động ẩn trước khi lưu lịch sử/xuất báo cáo. API có hạn mức theo tài khoản. Không có key chỉ được thử lệnh DNS với `example.com` qua endpoint demo của MXToolbox.
- **WHOIS:** tự tách tên miền đăng ký khỏi host bằng Public Suffix List (ví dụ `portal.longvan.vn` → `longvan.vn`). Khi bạn nhấn **Kiểm tra**, extension xin quyền `longvan.net`, mở `https://longvan.net/domain/whois?ten_mien=<tên-miền>` trong **tab nền không kích hoạt** (không tự chuyển khỏi tab bạn đang dùng), chờ trang hiển thị kết quả rồi chỉ đọc tên miền, nhà đăng ký, ngày đăng ký/hết hạn, trạng thái, nameserver và DNSSEC; sau đó tự đóng tab tạm kể cả khi tra cứu lỗi. Không cần BKNS key hoặc mở VNNIC, không gọi RDAP. **Không lưu thông tin chủ thể, registrant hay HTML/WHOIS thô.** Long Vân là nguồn tổng hợp bên ngoài, không phải registry có thẩm quyền; dữ liệu có thể chậm cập nhật. Nếu trang đổi giao diện, cần xác minh hoặc chưa trả kết quả, extension báo lỗi chứ không suy đoán tên miền còn trống. Trang Long Vân có thể tải nội dung/analytics của chính họ khi tab tạm mở.

| Công cụ | Nguồn | Ghi chú |
|---|---|---|
| Ping, traceroute, TCP port, Quét Port, DNS Check, TLS, LAN | Windows Local Agent | DNS Check hỗ trợ AUTO/A/AAAA/MX/TXT/NS/CNAME/PTR qua DNS hệ điều hành hoặc IPv4/IPv6 tùy chọn; Traceroute dùng `tracert -d`, ping dùng `ping`; Quét Port chỉ thử kết nối TCP, không quét UDP. |
| IP Public | Windows Local Agent (`curl.exe https://ifconfig.me/ip`) | Chạy lệnh cố định trên máy người dùng; ifconfig.me nhận truy vấn và trả địa chỉ IP dạng văn bản. |
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

DNS Check chạy trong Local Agent và dùng Go resolver, không gọi website DNS bên ngoài. Người dùng có thể để trống để dùng DNS hệ điều hành hoặc nhập địa chỉ IP DNS server, có thể kèm port. Agent nhận các action `ping`, `traceroute`, `tcp_check`, `port_scan`, `dns_lookup`, `tls_check`, `local_interfaces`, `public_ip`; validate host/port/timeout/DNS server; giới hạn số ping, số hop, số cổng quét, kích thước message. `ping`, `tracert`, `ipconfig` và `curl.exe` chỉ được gọi với chương trình/tham số cố định qua `exec.CommandContext`, không dùng shell. IP Public gọi cố định `https://ifconfig.me/ip`, không nhận URL từ extension hoặc người dùng. Native Messaging dùng `allowed_origins` giới hạn theo Extension ID, không mở cổng TCP. Không nhận yêu cầu từ content script hoặc website. Không xử lý/upload private key và không có nơi nhập private key. Lịch sử có thể chứa thông tin mạng nội bộ: hãy tắt lưu lịch sử khi cần. Chỉ kiểm tra mạng mà bạn được phép.

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
