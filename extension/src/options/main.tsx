import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Clock3, Download, HardDrive, History, KeyRound, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { Header } from '../components/Header'
import { HistoryItem } from '../components/HistoryItem'
import { Result } from '../components/Result'
import { agentZipURL } from '../services/agentDownload'
import { downloadAuthenticatorExport, loadAuthenticatorEntries } from '../services/authenticator'
import { hasPortalAccess, removePortalAccess, requestPortalAccess } from '../services/portalAccess'
import { downloadReport } from '../services/report'
import { defaultSettings, getHistory, getSettings, type CheckRecord, type Settings } from '../services/storage'
import { safeTimeout } from '../services/validation'
import '../style.css'

function App() {
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [history, setHistory] = useState<CheckRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [portalAccess, setPortalAccess] = useState<boolean | null>(null)
  const [portalBusy, setPortalBusy] = useState(false)
  const [portalError, setPortalError] = useState('')
  const [authExporting, setAuthExporting] = useState(false)
  const [authExportStatus, setAuthExportStatus] = useState('')
  const [authExportError, setAuthExportError] = useState('')
  const filtered = history.filter((item) =>
    `${item.tool} ${item.target} ${item.source}`.toLocaleLowerCase('vi-VN')
      .includes(query.trim().toLocaleLowerCase('vi-VN')),
  )
  const selected = filtered.find((item) => item.id === selectedId)

  useEffect(() => {
    let mounted = true
    void getSettings().then((value) => { if (mounted) setSettings(value) }).catch(() => {
      if (mounted) setSaveError('Không thể tải cài đặt. Hãy mở lại trang và thử lần nữa.')
    })
    void getHistory().then((items) => { if (mounted) setHistory(items) }).catch(() => {
      if (mounted) setHistoryError('Không thể tải lịch sử. Hãy mở lại trang và thử lần nữa.')
    }).finally(() => { if (mounted) setHistoryLoading(false) })
    void hasPortalAccess().then((allowed) => { if (mounted) setPortalAccess(allowed) })
      .catch(() => { if (mounted) setPortalAccess(false) })
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.history && mounted) {
        setHistory((changes.history.newValue as CheckRecord[] | undefined) ?? [])
        setHistoryError('')
      }
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => { mounted = false; chrome.storage.onChanged.removeListener(onChanged) }
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const next = { ...settings, timeoutMs: safeTimeout(settings.timeoutMs) }
    try {
      await chrome.storage.local.set({ settings: next })
      setSettings(next)
      setSaved(true)
      setSaveError('')
    } catch {
      setSaved(false)
      setSaveError('Không thể lưu cài đặt. Hãy thử lại.')
    }
  }

  async function clearHistory() {
    if (!window.confirm(`Xóa toàn bộ ${history.length} mục lịch sử trên thiết bị này?`)) return
    try {
      await chrome.storage.local.remove('history')
      setHistory([])
      setSelectedId(null)
      setHistoryError('')
    } catch {
      setHistoryError('Không thể xóa lịch sử. Hãy thử lại.')
    }
  }

  async function changePortalAccess(enabled: boolean) {
    if (portalBusy) return
    setPortalBusy(true)
    setPortalError('')
    try {
      const changed = enabled ? await requestPortalAccess() : await removePortalAccess()
      const allowed = await hasPortalAccess()
      setPortalAccess(allowed)
      if (enabled && (!changed || !allowed)) setPortalError('Quyền Portal chưa được cấp.')
      if (!enabled && allowed) setPortalError('Không thể thu hồi quyền Portal.')
    } catch {
      setPortalError(enabled ? 'Không thể cấp quyền Portal.' : 'Không thể thu hồi quyền Portal.')
    } finally { setPortalBusy(false) }
  }

  async function exportAuthenticators() {
    if (authExporting) return
    setAuthExporting(true)
    setAuthExportStatus('')
    setAuthExportError('')
    try {
      const entries = await loadAuthenticatorEntries()
      if (!entries.length) {
        setAuthExportError('Chưa có tài khoản Authenticator để xuất.')
        return
      }
      const confirmed = window.confirm(
        `Xuất ${entries.length} tài khoản Authenticator?\n\nFile TXT sẽ chứa secret TOTP dạng đọc được. Bất kỳ ai có file đều có thể tạo mã đăng nhập. Hãy lưu file ở nơi an toàn và xóa khi không còn cần.`,
      )
      if (!confirmed) return
      downloadAuthenticatorExport(entries)
      setAuthExportStatus(`Đã xuất ${entries.length} tài khoản Authenticator.`)
    } catch (cause) {
      setAuthExportError(cause instanceof Error ? cause.message : 'Không thể xuất Authenticator.')
    } finally {
      setAuthExporting(false)
    }
  }

  return <main className="panel options-page"><Header section="Cài đặt" /><div className="main-content">
    <div className="eyebrow">KHÔNG GIAN CỦA BẠN</div>
    <h1>Cài đặt <span>& lịch sử.</span></h1>
    <p className="intro">Tùy chỉnh cách kiểm tra và quản lý kết quả đã lưu trên thiết bị này.</p>
    <nav className="options-nav" aria-label="Mục cài đặt">
      <a href="#preferences">Tùy chọn</a><a href="#authenticator-backup">Authenticator</a><a href="#portal-access">Quyền Portal</a><a href="#history">Lịch sử</a><a href="#agent">Local Agent</a>
    </nav>

    <form id="preferences" className="options-section" onSubmit={(event) => void submit(event)}>
      <div className="options-section-heading"><span className="options-section-icon"><Clock3 size={19} /></span><div>
        <h2>Tùy chọn kiểm tra</h2><p>Điều chỉnh thời gian chờ và cách lưu kết quả.</p>
      </div></div>
      <div className="options-fields">
        <div className="options-field">
          <label htmlFor="timeout">Thời gian chờ</label>
          <div className="options-number"><input id="timeout" type="number" min="500" max="10000" step="100" value={settings.timeoutMs} onChange={(event) => { setSaved(false); setSettings({ ...settings, timeoutMs: Number(event.target.value) }) }} /><span>ms</span></div>
          <small>Từ 500 đến 10.000 ms cho mỗi lần kiểm tra.</small>
        </div>
        <label className="options-toggle" htmlFor="save-history">
          <span><strong>Lưu lịch sử kiểm tra</strong><small>Tắt để ngừng lưu kết quả mới. Kết quả cũ vẫn ở bên dưới cho tới khi bạn xóa.</small></span>
          <input id="save-history" type="checkbox" checked={settings.saveHistory} onChange={(event) => { setSaved(false); setSettings({ ...settings, saveHistory: event.target.checked }) }} />
        </label>
      </div>
      <div className="options-divider" />
      <div className="options-section-heading"><span className="options-section-icon"><KeyRound size={19} /></span><div>
        <h2>MXToolbox API key</h2><p>Không bắt buộc. Chỉ cần cho các truy vấn MXToolbox sử dụng API.</p>
      </div></div>
      <div className="options-field">
        <label htmlFor="mx-key">API key</label>
        <input id="mx-key" type="password" autoComplete="off" placeholder="UUID từ tài khoản MXToolbox" value={settings.mxtoolboxApiKey} onChange={(event) => { setSaved(false); setSettings({ ...settings, mxtoolboxApiKey: event.target.value }) }} />
        <small>Key lưu trong chrome.storage.local (không mã hóa), chỉ gửi tới API chính thức khi bạn kiểm tra; không đưa vào lịch sử hoặc báo cáo. <a className="settings-link" href="https://mxtoolbox.com/api/api-reference" target="_blank" rel="noreferrer">Thông tin API ↗</a></small>
      </div>
      {settings.bknsApiKey && <div className="options-legacy"><strong>Key BKNS cũ (không còn sử dụng)</strong><p>WHOIS hiện dùng trang Long Vân. Bạn có thể xóa key này rồi lưu cài đặt.</p><button type="button" onClick={() => { setSaved(false); setSettings({ ...settings, bknsApiKey: '' }) }}>Xóa key BKNS cũ</button></div>}
      <div className="options-save"><button className="primary" type="submit">Lưu cài đặt</button>{saved && <span className="success" role="status">Đã lưu cài đặt.</span>}{saveError && <span className="options-error" role="alert">{saveError}</span>}</div>
    </form>

    <section id="authenticator-backup" className="options-section" aria-labelledby="authenticator-backup-title">
      <div className="options-section-heading"><span className="options-section-icon"><KeyRound size={19} /></span><div>
        <h2 id="authenticator-backup-title">Sao lưu Authenticator</h2><p>Xuất các tài khoản TOTP để sao lưu hoặc import lại vào IT Support Toolkit.</p>
      </div></div>
      <div className="options-auth-export">
        <div><strong>Xuất file TXT</strong><p>File giữ nguyên thứ tự và toàn bộ thiết lập TOTP. Có thể import lại bằng nút <strong>Import</strong> trong tab Auth.</p></div>
        <button type="button" disabled={authExporting} onClick={() => void exportAuthenticators()}><Download size={16} /> {authExporting ? 'Đang xuất...' : 'Export Auth'}</button>
      </div>
      <p className="options-sensitive-note"><ShieldCheck size={15} /> File xuất chứa secret TOTP dạng đọc được. Không gửi file qua kênh công khai và không để file trên máy dùng chung.</p>
      {authExportStatus && <p className="success" role="status">{authExportStatus}</p>}
      {authExportError && <p className="options-error" role="alert">{authExportError}</p>}
    </section>

    <section id="portal-access" className="options-section" aria-labelledby="portal-access-options-title">
      <div className="options-section-heading"><span className="options-section-icon"><ShieldCheck size={19} /></span><div>
        <h2 id="portal-access-options-title">Quyền truy cập Portal Long Vân</h2><p>Quản lý quyền sao chép và dán cấu hình VM trên Portal.</p>
      </div></div>
      <label className="options-toggle" htmlFor="portal-access-toggle">
        <span><strong>Cho phép truy cập portal.longvan.vn</strong><small>Chỉ dùng trên trang Dịch vụ và Tạo computing. Sau khi thay đổi, hãy refresh các tab Portal đang mở.</small></span>
        <input id="portal-access-toggle" type="checkbox" disabled={portalBusy || portalAccess === null} checked={portalAccess === true} onChange={(event) => void changePortalAccess(event.target.checked)} />
      </label>
      {portalAccess === true && <p className="success" role="status">Đã cấp quyền Portal.</p>}
      {portalAccess === false && <p className="agent-note">Chưa cấp quyền Portal. Các nút sao chép/dán sẽ không được chèn vào trang.</p>}
      {portalError && <p className="options-error" role="alert">{portalError}</p>}
    </section>

    <section id="history" className="options-section" aria-labelledby="options-history-title">
      <div className="options-section-heading options-history-heading"><span className="options-section-icon"><History size={19} /></span><div>
        <h2 id="options-history-title">Lịch sử kiểm tra <span className="options-badge">{historyLoading ? '…' : history.length}/50</span></h2>
        <p>Xem lại kết quả trên thiết bị này, không đồng bộ sang trình duyệt khác.</p>
      </div></div>
      {history.length > 0 && <div className="options-history-tools">
        <label className="options-search"><Search size={16} /><span className="sr-only">Tìm trong lịch sử</span><input type="search" placeholder="Tìm công cụ hoặc mục tiêu..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <button type="button" onClick={() => downloadReport(history)}><Download size={15} /> Xuất HTML</button>
        <button type="button" className="danger" onClick={() => void clearHistory()}><Trash2 size={15} /> Xóa tất cả</button>
      </div>}
      {historyError && <p className="options-error" role="alert">{historyError}</p>}
      {historyLoading ? <p className="options-empty">Đang tải lịch sử...</p>
        : !history.length ? <p className="options-empty">Chưa có lần kiểm tra nào được lưu. Chạy một công cụ từ popup để bắt đầu.</p>
          : <><p className="options-history-count">{query.trim() ? `${filtered.length} kết quả phù hợp` : `${history.length} kết quả gần nhất`}</p>
            {filtered.length ? <div className="options-history-list">{filtered.map((item) =>
              <HistoryItem key={item.id} record={item} selected={selectedId === item.id} onClick={() => setSelectedId(selectedId === item.id ? null : item.id)} />)}</div>
              : <p className="options-empty">Không tìm thấy kết quả phù hợp.</p>}
            {selected && <div className="options-history-detail" aria-label="Chi tiết lịch sử"><Result record={selected} /></div>}
          </>}
    </section>

    <section id="agent" className="options-section options-agent" aria-labelledby="agent-options-title">
      <div className="options-section-heading"><span className="options-section-icon"><HardDrive size={19} /></span><div>
        <h2 id="agent-options-title">Local Agent cho Windows</h2><p>Cài hoặc cập nhật Agent khi cần dùng các công cụ mạng tại máy.</p>
      </div></div>
      <p>Ping, Traceroute, TCP Port, Quét Port, DNS Check, SSL/TLS và Mạng LAN cần Agent cài riêng. <a href={agentZipURL} target="_blank" rel="noopener noreferrer">Tải ZIP Agent từ GitHub Release ↗</a>, giải nén toàn bộ rồi chạy <strong>Install.cmd</strong> bên trong và nhập Extension ID của bản này khi được hỏi.</p>
      <label htmlFor="current-extension-id">Extension ID của bạn</label>
      <input id="current-extension-id" readOnly value={chrome.runtime.id} onFocus={(event) => event.currentTarget.select()} />
      <p className="agent-note">Không di chuyển hoặc chạy riêng Install.cmd vì bộ cài cần các file đi kèm trong ZIP. Agent không được đóng gói vào extension trên Edge Add-ons.</p>
    </section>
  </div></main>
}

createRoot(document.getElementById('root')!).render(<App />)
