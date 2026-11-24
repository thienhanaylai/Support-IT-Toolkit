import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Clock3, Download, HardDrive, History, KeyRound, Search, Trash2 } from 'lucide-react'
import { Header } from '../components/Header'
import { HistoryItem } from '../components/HistoryItem'
import { Result } from '../components/Result'
import { agentInstallerURL, agentZipURL } from '../services/agentDownload'
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

  return <main className="panel options-page"><Header section="Cài đặt" /><div className="main-content">
    <div className="eyebrow">KHÔNG GIAN CỦA BẠN</div>
    <h1>Cài đặt <span>& lịch sử.</span></h1>
    <p className="intro">Tùy chỉnh cách kiểm tra và quản lý kết quả đã lưu trên thiết bị này.</p>
    <nav className="options-nav" aria-label="Mục cài đặt">
      <a href="#preferences">Tùy chọn</a><a href="#history">Lịch sử</a><a href="#agent">Local Agent</a>
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
      <p>Ping, Traceroute, TCP Port, Quét Port, SSL/TLS và Mạng LAN cần Agent cài riêng. Tải <a href={agentInstallerURL} target="_blank" rel="noopener noreferrer">Install.cmd từ GitHub Release ↗</a> hoặc <a href={agentZipURL} target="_blank" rel="noopener noreferrer">ZIP Agent ↗</a>, rồi nhập Extension ID của bản này khi được hỏi.</p>
      <label htmlFor="current-extension-id">Extension ID của bạn</label>
      <input id="current-extension-id" readOnly value={chrome.runtime.id} onFocus={(event) => event.currentTarget.select()} />
      <p className="agent-note">Nếu tải ZIP, giải nén rồi chạy Install.cmd nằm trong ZIP. Agent không được đóng gói vào extension trên Edge Add-ons.</p>
    </section>
  </div></main>
}

createRoot(document.getElementById('root')!).render(<App />)
