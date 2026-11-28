import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Check, Moon, Sun } from 'lucide-react'
import { hasPortalAccess, requestPortalAccess } from '../services/portalAccess'
import { applyTheme, getSettings, type Settings, type Theme } from '../services/storage'
import '../style.css'

function App() {
  const [portalAccess, setPortalAccess] = useState<boolean | null>(null)
  const [portalBusy, setPortalBusy] = useState(false)
  const [portalError, setPortalError] = useState('')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [themeBusy, setThemeBusy] = useState(false)
  const [themeError, setThemeError] = useState('')
  useEffect(() => {
    void hasPortalAccess().then(setPortalAccess).catch(() => setPortalAccess(false))
    void getSettings().then((value) => {
      setSettings(value)
      applyTheme(value.theme)
    }).catch(() => applyTheme('light'))
  }, [])

  async function chooseTheme(theme: Theme) {
    if (!settings || themeBusy || settings.theme === theme) return
    const previous = settings
    const next = { ...settings, theme }
    setSettings(next)
    setThemeError('')
    setThemeBusy(true)
    applyTheme(theme)
    try {
      await chrome.storage.local.set({ settings: next })
    } catch {
      setSettings(previous)
      applyTheme(previous.theme)
      setThemeError('Không thể lưu giao diện. Hãy thử lại.')
    } finally {
      setThemeBusy(false)
    }
  }

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
    <section className="welcome-theme-card" aria-labelledby="welcome-theme-title">
      <div className="welcome-theme-heading">
        <div>
          <h2 id="welcome-theme-title">Bạn muốn dùng giao diện nào?</h2>
          <p>Thiết lập này áp dụng đồng bộ cho popup, Công cụ, Authenticator và trang Cài đặt.</p>
        </div>
        {settings && <span className="welcome-theme-current"><Check size={14} /> Đã chọn</span>}
      </div>
      <div className="welcome-theme-options" role="radiogroup" aria-label="Chọn giao diện">
        <button type="button" role="radio" aria-checked={settings?.theme === 'light'}
          className={settings?.theme === 'light' ? 'is-selected' : ''}
          disabled={!settings || themeBusy} onClick={() => void chooseTheme('light')}>
          <span className="welcome-theme-icon is-light"><Sun size={22} /></span>
          <span><strong>Giao diện sáng</strong><small>Rõ ràng, phù hợp ban ngày</small></span>
          {settings?.theme === 'light' && <Check className="welcome-theme-check" size={18} />}
        </button>
        <button type="button" role="radio" aria-checked={settings?.theme === 'dark'}
          className={settings?.theme === 'dark' ? 'is-selected' : ''}
          disabled={!settings || themeBusy} onClick={() => void chooseTheme('dark')}>
          <span className="welcome-theme-icon is-dark"><Moon size={22} /></span>
          <span><strong>Giao diện tối</strong><small>Dịu mắt trong môi trường tối</small></span>
          {settings?.theme === 'dark' && <Check className="welcome-theme-check" size={18} />}
        </button>
      </div>
      {themeError && <p className="options-error welcome-theme-error" role="alert">{themeError}</p>}
    </section>
    <section className="agent-card portal-access-card" aria-labelledby="portal-access-title">
      <h2 id="portal-access-title">Quyền truy cập Portal Long Vân</h2>
      <p>Cấp một lần để hiện nút sao chép thông số tại trang Dịch vụ, dán cấu hình tại trang Tạo computing và điền OTP trong hộp xác thực 2 lớp. Quyền chỉ áp dụng cho <strong>portal.longvan.vn</strong>.</p>
      {portalAccess ? <p className="success" role="status">Đã cấp quyền Portal. Hãy refresh các tab Portal đang mở.</p>
        : <button type="button" className="portal-access-button" disabled={portalBusy || portalAccess === null} onClick={() => void grantPortal()}>{portalBusy ? 'Đang yêu cầu...' : 'Cấp quyền Portal'}</button>}
      {portalError && <p className="options-error" role="alert">{portalError}</p>}
      <p className="agent-note">Bạn có thể cấp lại hoặc thu hồi quyền này bất kỳ lúc nào trong trang Cài đặt.</p>
    </section>
    <p className="privacy">Không có chương trình native, service hoặc tiến trình mạng riêng được cài trên Windows.</p>
  </div></main>
}

createRoot(document.getElementById('root')!).render(<App />)
