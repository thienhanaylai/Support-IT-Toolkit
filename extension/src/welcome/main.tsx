import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { hasPortalAccess, requestPortalAccess } from '../services/portalAccess'
import '../style.css'

function App() {
  const [portalAccess, setPortalAccess] = useState<boolean | null>(null)
  const [portalBusy, setPortalBusy] = useState(false)
  const [portalError, setPortalError] = useState('')
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
    <p className="intro">Bản Browser-only không cần Local Agent. IP Public, HTTP Ping và DNS over HTTPS chạy trực tiếp trong trình duyệt.</p>
    <section className="agent-card portal-access-card" aria-labelledby="portal-access-title">
      <h2 id="portal-access-title">Quyền truy cập Portal Long Vân</h2>
      <p>Cấp một lần để hiện nút sao chép thông số tại trang Dịch vụ và dán cấu hình tại trang Tạo computing. Quyền chỉ áp dụng cho <strong>portal.longvan.vn</strong>.</p>
      {portalAccess ? <p className="success" role="status">Đã cấp quyền Portal. Hãy refresh các tab Portal đang mở.</p>
        : <button type="button" className="portal-access-button" disabled={portalBusy || portalAccess === null} onClick={() => void grantPortal()}>{portalBusy ? 'Đang yêu cầu...' : 'Cấp quyền Portal'}</button>}
      {portalError && <p className="options-error" role="alert">{portalError}</p>}
      <p className="agent-note">Bạn có thể cấp lại hoặc thu hồi quyền này bất kỳ lúc nào trong trang Cài đặt.</p>
    </section>
    <p className="privacy">Không có chương trình native, service hoặc tiến trình mạng riêng được cài trên Windows.</p>
  </div></main>
}

createRoot(document.getElementById('root')!).render(<App />)
