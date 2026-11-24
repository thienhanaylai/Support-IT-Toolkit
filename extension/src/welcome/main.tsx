import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { agentZipURL } from '../services/agentDownload'
import { hasPortalAccess, requestPortalAccess } from '../services/portalAccess'
import '../style.css'

function App() {
  const [copied, setCopied] = useState(false)
  const [portalAccess, setPortalAccess] = useState<boolean | null>(null)
  const [portalBusy, setPortalBusy] = useState(false)
  const [portalError, setPortalError] = useState('')
  const id = chrome.runtime.id
  useEffect(() => {
    void hasPortalAccess().then(setPortalAccess).catch(() => setPortalAccess(false))
  }, [])

  async function grantPortal() {
    setPortalBusy(true)
    setPortalError('')
    try {
      const granted = await requestPortalAccess()
      setPortalAccess(granted)
      if (!granted) setPortalError('Bạn chưa cấp quyền Portal. Có thể cấp lại sau trong Cài đặt.')
    } catch {
      setPortalError('Không thể yêu cầu quyền Portal. Hãy thử lại trong Cài đặt.')
    } finally { setPortalBusy(false) }
  }
  return <main className="panel"><div className="main-content onboarding">
    <div className="eyebrow">BẮT ĐẦU SỬ DỤNG</div>
    <h1>Đã cài <span>IT Support Toolkit.</span></h1>
    <p className="intro">WHOIS, IP Public và MXToolbox có thể dùng ngay. Các công cụ Ping, Traceroute, TCP Port, Quét Port, SSL/TLS và Mạng LAN cần Local Agent trên Windows.</p>
    <section className="agent-card portal-access-card" aria-labelledby="portal-access-title">
      <h2 id="portal-access-title">Quyền truy cập Portal Long Vân</h2>
      <p>Cấp một lần để hiện nút sao chép thông số tại trang Dịch vụ và dán cấu hình tại trang Tạo computing. Quyền chỉ áp dụng cho <strong>portal.longvan.vn</strong>.</p>
      {portalAccess ? <p className="success" role="status">Đã cấp quyền Portal. Hãy refresh các tab Portal đang mở.</p>
        : <button type="button" className="portal-access-button" disabled={portalBusy || portalAccess === null} onClick={() => void grantPortal()}>{portalBusy ? 'Đang yêu cầu...' : 'Cấp quyền Portal'}</button>}
      {portalError && <p className="options-error" role="alert">{portalError}</p>}
      <p className="agent-note">Bạn có thể cấp lại hoặc thu hồi quyền này bất kỳ lúc nào trong trang Cài đặt.</p>
    </section>
    <section className="agent-card" aria-labelledby="agent-title">
      <h2 id="agent-title">Cài Local Agent (Windows)</h2>
      <ol>
        <li><a href={agentZipURL} target="_blank" rel="noopener noreferrer">Tải ZIP Agent từ GitHub Release ↗</a>, sau đó giải nén toàn bộ ZIP vào cùng một thư mục.</li>
        <li>Chạy <strong>Install.cmd</strong> nằm trong thư mục đã giải nén. Không di chuyển hoặc chạy riêng file này vì bộ cài cần các file đi kèm. Windows có thể hỏi xác nhận vì bộ cài chưa ký số.</li>
        <li>Khi bộ cài hỏi, dán <strong>Extension ID</strong> bên dưới. Không dùng ID của bản Load unpacked cũ thay cho ID bản Edge Add-ons.</li>
        <li>Đợi cài xong, tải lại extension và thử Ping. Không cần quyền Administrator, Node.js hay Go.</li>
      </ol>
      <label htmlFor="extension-id">EXTENSION ID CỦA BẢN ĐANG CÀI</label>
      <div className="agent-id-row"><input id="extension-id" readOnly value={id} onFocus={(event) => event.currentTarget.select()} />
        <button type="button" onClick={() => { void navigator.clipboard.writeText(id).then(() => setCopied(true)).catch(() => setCopied(false)) }}>{copied ? 'Đã sao chép' : 'Sao chép ID'}</button></div>
      <p className="agent-note">Chỉ sử dụng bộ ZIP Agent đầy đủ. Agent không được đóng gói vào extension trên Edge Add-ons.</p>
    </section>
    <p className="privacy">Agent chỉ chạy trên máy bạn khi bạn yêu cầu kiểm tra. Liên kết tải luôn có lại trong trang Cài đặt của extension.</p>
  </div></main>
}

createRoot(document.getElementById('root')!).render(<App />)
