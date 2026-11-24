import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { agentInstallerURL, agentZipURL } from '../services/agentDownload'
import '../style.css'

function App() {
  const [copied, setCopied] = useState(false)
  const id = chrome.runtime.id
  return <main className="panel"><div className="main-content onboarding">
    <div className="eyebrow">BẮT ĐẦU SỬ DỤNG</div>
    <h1>Đã cài <span>IT Support Toolkit.</span></h1>
    <p className="intro">WHOIS, IP Public và MXToolbox có thể dùng ngay. Các công cụ Ping, Traceroute, TCP Port, Quét Port, SSL/TLS và Mạng LAN cần Local Agent trên Windows.</p>
    <section className="agent-card" aria-labelledby="agent-title">
      <h2 id="agent-title">Cài Local Agent (Windows)</h2>
      <ol>
        <li>Tải <a href={agentInstallerURL} target="_blank" rel="noopener noreferrer">Install.cmd từ GitHub Release ↗</a>, sau đó chạy file vừa tải. Windows có thể hỏi xác nhận vì bộ cài chưa ký số.</li>
        <li>Khi bộ cài hỏi, dán <strong>Extension ID</strong> bên dưới. Không dùng ID của bản Load unpacked cũ thay cho ID bản Edge Add-ons.</li>
        <li>Đợi cài xong, tải lại extension và thử Ping. Không cần quyền Administrator, Node.js hay Go.</li>
      </ol>
      <label htmlFor="extension-id">EXTENSION ID CỦA BẢN ĐANG CÀI</label>
      <div className="agent-id-row"><input id="extension-id" readOnly value={id} onFocus={(event) => event.currentTarget.select()} />
        <button type="button" onClick={() => { void navigator.clipboard.writeText(id).then(() => setCopied(true)).catch(() => setCopied(false)) }}>{copied ? 'Đã sao chép' : 'Sao chép ID'}</button></div>
      <p className="agent-note">Nếu trình duyệt chặn file CMD, <a href={agentZipURL} target="_blank" rel="noopener noreferrer">tải ZIP Agent ↗</a>, giải nén toàn bộ và chạy `Install.cmd` bên trong. Không tải ZIP Agent lên Edge Add-ons.</p>
    </section>
    <p className="privacy">Agent chỉ chạy trên máy bạn khi bạn yêu cầu kiểm tra. Liên kết tải luôn có lại trong trang Cài đặt của extension.</p>
  </div></main>
}

createRoot(document.getElementById('root')!).render(<App />)
