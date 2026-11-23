import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Header } from '../components/Header'
import { defaultSettings, getSettings, type Settings } from '../services/storage'
import { safeTimeout } from '../services/validation'
import '../style.css'

function App() {
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [saved, setSaved] = useState(false)
  useEffect(() => { void getSettings().then(setSettings) }, [])
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const next = { ...settings, timeoutMs: safeTimeout(settings.timeoutMs) }
    await chrome.storage.local.set({ settings: next })
    setSettings(next); setSaved(true)
  }
  return <main className="panel"><Header section="Cấu hình" /><div className="main-content">
    <div className="eyebrow">TÙY CHỈNH</div><h1>Cài đặt <span>kiểm tra.</span></h1>
    <p className="intro">Thiết lập của bạn chỉ được lưu trên thiết bị này.</p>
    <form className="settings-form" onSubmit={(e) => void submit(e)}>
      <label htmlFor="timeout">TIMEOUT (MILLISECONDS)</label><input id="timeout" type="number" min="500" max="10000" step="100" value={settings.timeoutMs} onChange={(e) => { setSaved(false); setSettings({ ...settings, timeoutMs: Number(e.target.value) }) }} />
      <small>Giới hạn từ 500 đến 10.000 ms.</small>
      <label htmlFor="mx-key">MXTOOLBOX API KEY (KHÔNG BẮT BUỘC)</label><input id="mx-key" type="password" autoComplete="off" placeholder="UUID từ tài khoản MXToolbox" value={settings.mxtoolboxApiKey} onChange={(e) => { setSaved(false); setSettings({ ...settings, mxtoolboxApiKey: e.target.value }) }} />
      <small>Key lưu trong chrome.storage.local (không mã hóa), chỉ gửi tới API chính thức của MXToolbox khi bạn kiểm tra. Không đưa vào lịch sử hoặc báo cáo. <a className="settings-link" href="https://mxtoolbox.com/api/api-reference" target="_blank" rel="noreferrer">Thông tin API ↗</a></small>
      <label htmlFor="bkns-key">BKNS WHOIS API KEY (CHO TÊN MIỀN .VN)</label><input id="bkns-key" type="password" autoComplete="off" placeholder="Nhập key của bạn để tra cứu .vn" value={settings.bknsApiKey} onChange={(e) => { setSaved(false); setSettings({ ...settings, bknsApiKey: e.target.value }) }} />
      <small>Key lưu trong chrome.storage.local (không mã hóa), chỉ gửi tới whois.bkns.vn khi bạn tra cứu .vn; không lưu vào lịch sử hoặc báo cáo. Không dùng key demo chung trong bản phát hành. <a className="settings-link" href="https://whois.bkns.vn/en/docs" target="_blank" rel="noreferrer">Tài liệu &amp; cách lấy key ↗</a></small>
      <label className="checkbox"><input type="checkbox" checked={settings.saveHistory} onChange={(e) => { setSaved(false); setSettings({ ...settings, saveHistory: e.target.checked }) }} /> Lưu lịch sử kiểm tra trên thiết bị</label>
      <button className="primary" type="submit">Lưu cài đặt</button>{saved && <p className="success">Đã lưu cài đặt.</p>}
    </form>
    <p className="privacy">Không có telemetry. MXToolbox, WHOIS/RDAP (.vn qua BKNS) và IP Public gửi truy vấn đến dịch vụ bên ngoài; các công cụ Local Agent chỉ chạy sau khi bạn nhấn kiểm tra.</p>
  </div></main>
}
createRoot(document.getElementById('root')!).render(<App />)
