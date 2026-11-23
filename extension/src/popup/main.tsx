import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowRight, Clock3, Globe2, HardDrive, MailSearch, Monitor, Network, Radio, ScanSearch, Search, Server, Settings2, ShieldCheck, UserRoundSearch, Zap } from 'lucide-react'
import { HistoryItem } from '../components/HistoryItem'
import { Result } from '../components/Result'
import { labels, runCheck, toolRequiresAgent, type Tool } from '../services/checks'
import { getHistory, type CheckRecord } from '../services/storage'
import { commonPorts, parseScanPorts } from '../services/scanPorts'
import { domainOnly, type MXCommand } from '../services/domainLookup'
import { parseInput } from '../services/validation'
import type { NativeProgress } from '../services/nativeHost'
import '../style.css'

const tools: { id: Tool; icon: React.ReactNode; detail: string }[] = [
  { id: 'vm_info', icon: <HardDrive size={19} />, detail: 'Đọc từ tab Portal hiện tại' },
  { id: 'ping', icon: <Radio size={19} />, detail: 'Độ trễ & mất gói' },
  { id: 'traceroute', icon: <Network size={19} />, detail: 'Theo dõi đường đi' },
  { id: 'tcp_check', icon: <Server size={19} />, detail: 'Kiểm tra cổng kết nối' },
  { id: 'port_scan', icon: <ScanSearch size={19} />, detail: 'Quét tối đa 32 cổng TCP' },
  { id: 'tls_check', icon: <ShieldCheck size={19} />, detail: 'Chứng chỉ & TLS' },
  { id: 'mxtoolbox', icon: <MailSearch size={19} />, detail: 'DNS & email từ MXToolbox' },
  { id: 'whois', icon: <UserRoundSearch size={19} />, detail: 'Thông tin đăng ký tên miền' },
  { id: 'local_interfaces', icon: <Monitor size={19} />, detail: 'IP LAN & adapter' },
  { id: 'public_ip', icon: <Zap size={19} />, detail: 'IP Internet nhìn thấy' },
]
const instantTools: Tool[] = ['local_interfaces', 'public_ip', 'vm_info']
const inputTools = tools.filter((item) => !instantTools.includes(item.id))
const quickTools = tools.filter((item) => instantTools.includes(item.id))

function App() {
  const [input, setInput] = useState('')
  const [port, setPort] = useState(443)
  const [pingCount, setPingCount] = useState(4)
  const [maxHops, setMaxHops] = useState(20)
  const [scanMode, setScanMode] = useState<'common' | 'custom'>('common')
  const [customPorts, setCustomPorts] = useState('22,80,443,8080')
  const [mxCommand, setMxCommand] = useState<MXCommand>('dns')
  const [tool, setTool] = useState<Tool | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<NativeProgress[]>([])
  const [error, setError] = useState('')
  const [record, setRecord] = useState<CheckRecord | null>(null)
  const [recent, setRecent] = useState<CheckRecord[]>([])
  const resultRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    chrome.storage.session.get('selectedTarget').then(({ selectedTarget }) => {
      if (typeof selectedTarget === 'string' && selectedTarget) {
        setInput(selectedTarget)
        chrome.storage.session.remove('selectedTarget')
      } else chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab?.url && /^https?:\/\//.test(tab.url)) {
          try { setInput(new URL(tab.url).hostname) } catch { /* no active website */ }
        }
      })
    })
    getHistory().then((items) => setRecent(items.slice(0, 5)))
  }, [])

  useEffect(() => {
    if (busy || record || error) {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [busy, record, error])
  useEffect(() => {
    progressRef.current?.scrollTo({ top: progressRef.current.scrollHeight })
  }, [progress])

  async function run(selectedTool: Tool | null = tool) {
    if (busy) return
    setError('')
    setRecord(null)
    setProgress([])
    if (!selectedTool) {
      setError('Hãy chọn một công cụ trước khi kiểm tra')
      return
    }
    let scanPorts = commonPorts
    try {
      if (!instantTools.includes(selectedTool)) parseInput(input)
      if (selectedTool === 'mxtoolbox' || selectedTool === 'whois') domainOnly(input)
      if (selectedTool === 'port_scan' && scanMode === 'custom') scanPorts = parseScanPorts(customPorts)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return
    }
    setBusy(true)
    try {
      const item = await runCheck(selectedTool, input, port, scanPorts, mxCommand, pingCount, maxHops, (event) => {
        setProgress((previous) => [...previous, event].slice(-100))
      })
      setRecord(item)
      setRecent((prev) => [item, ...prev].slice(0, 5))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  function showRecord(item: CheckRecord) {
    if (busy) return
    setRecord(item)
    setError('')
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return <main className="popup">
    <header className="popup-header">
      <div className="popup-brand"><img src="/icons/icon-32.png" width="24" height="24" alt="" /><strong>LongVanSupport Toolkit</strong></div>
      <a className="popup-settings" href="options.html" target="_blank" rel="noreferrer"><Settings2 size={16} /> Cài đặt</a>
    </header>
    <div className="main-content">
      {(!tool || !instantTools.includes(tool)) && <div className="input-panel">
        <label htmlFor="target">DOMAIN HOẶC ĐỊA CHỈ IP</label>
        <div className="input-wrap"><Search size={18} /><input id="target" placeholder="Domain hoặc IP" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void run() }} /><button type="button" className="inline-check" disabled={busy || !tool} onClick={() => void run()}>{busy ? 'Đang chạy...' : tool ? 'Kiểm tra' : 'Chọn công cụ'}<ArrowRight size={14} /></button></div>
        {tool && ['tcp_check', 'tls_check'].includes(tool) && <div className="port-row"><label htmlFor="port">PORT</label><input id="port" type="number" min={1} max={65535} value={port} onChange={(e) => setPort(Number(e.target.value))} /></div>}
        {tool === 'ping' && <div className="port-row"><label htmlFor="ping-count">SỐ LẦN PING (1–5)</label><input id="ping-count" type="number" min={1} max={5} step={1} value={pingCount} onChange={(e) => setPingCount(Number(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter') void run() }} /></div>}
        {tool === 'traceroute' && <div className="port-row"><label htmlFor="max-hops">SỐ HOP TỐI ĐA (1–30)</label><input id="max-hops" type="number" min={1} max={30} step={1} value={maxHops} onChange={(e) => setMaxHops(Number(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter') void run() }} /></div>}
        {tool === 'port_scan' && <div className="scan-options">
          <label htmlFor="scan-mode">CỔNG TCP CẦN QUÉT</label>
          <select id="scan-mode" value={scanMode} onChange={(e) => setScanMode(e.target.value as 'common' | 'custom')}>
            <option value="common">Cổng phổ biến ({commonPorts.length})</option>
            <option value="custom">Nhập danh sách tùy chọn</option>
          </select>
          {scanMode === 'custom' && <input type="text" aria-label="Danh sách cổng TCP" placeholder="22,80,443,8000-8005" value={customPorts} onChange={(e) => setCustomPorts(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void run() }} />}
          <small>Tối đa 32 cổng · 2 giây/cổng · chỉ quét khi bạn nhấn Kiểm tra.</small>
        </div>}
        {tool === 'mxtoolbox' && <div className="scan-options">
          <label htmlFor="mx-command">LOẠI KIỂM TRA</label>
          <select id="mx-command" value={mxCommand} onChange={(e) => setMxCommand(e.target.value as MXCommand)}>
            <option value="dns">DNS/NS</option>
            <option value="a">A</option><option value="aaaa">AAAA</option>
            <option value="mx">MX</option><option value="txt">TXT</option><option value="spf">SPF</option>
            <option value="dmarc">DMARC</option><option value="soa">SOA</option>
          </select>
          <small>Các tên miền khác cần API key trong Cài đặt.</small>
        </div>}
      </div>}
      <section className="tool-section" aria-labelledby="input-tools-heading">
        <div className="section-title" id="input-tools-heading"><span>CÔNG CỤ DÙNG DOMAIN / IP</span></div>
        <div className="tool-grid">{inputTools.map((item) => <button type="button" key={item.id} title={`${labels[item.id]} — ${item.detail}`} aria-label={`${labels[item.id]}: ${item.detail}`} disabled={busy} className={`tool ${tool === item.id ? 'selected' : ''}`} onClick={() => { setTool(item.id); setError('') }}>
          <span className="tool-icon">{item.icon}</span><strong>{labels[item.id]}</strong><small>{item.detail}</small>
        </button>)}</div>
      </section>
      <section className="tool-section quick-tool-section" aria-label="Công cụ không cần ô nhập">
        <div className="tool-grid">{quickTools.map((item) => <button type="button" key={item.id} title={`${labels[item.id]} — ${item.detail}`} aria-label={`${labels[item.id]}: ${item.detail}`} disabled={busy} className={`tool ${tool === item.id ? 'selected' : ''}`} onClick={() => { setTool(item.id); setError(''); void run(item.id) }}>
          <span className="tool-icon">{item.icon}</span><strong>{labels[item.id]}</strong><small>{item.detail}</small>
        </button>)}</div>
      </section>
      <div className="source-hint"><span className="hint-icon">{tool && toolRequiresAgent(tool) ? <Monitor size={15} /> : <Globe2 size={15} />}</span>{!tool ? 'Chọn một công cụ để bắt đầu' : tool === 'vm_info' ? 'Chỉ đọc tab chi tiết computing của Portal khi bạn nhấn nút' : toolRequiresAgent(tool) ? 'Chạy từ máy bạn · cần Local Agent' : 'Dùng dịch vụ ngoài · có thể cần cấp quyền host'}</div>
      <div ref={resultRef}>
        {(busy || (error && progress.length > 0)) && tool && <div className="checking" role="status">
          <div>{busy ? `Đang kiểm tra ${labels[tool]}` : `Tiến trình ${labels[tool]} đã dừng`}
            {busy && progress.at(-1)?.total ? ` · ${progress.at(-1)?.completed}/${progress.at(-1)?.total} cổng` : ''}
          </div>
          {progress.length > 0 && <pre ref={progressRef} className="live-output" aria-label="Kết quả trong quá trình chạy">{progress.map((item) => item.text).join('\n')}</pre>}
        </div>}
        {error && <div className="error" role="alert">{error}</div>}
        {record && <Result record={record} />}
      </div>
      <div className="section-title history-title"><span>GẦN ĐÂY</span><button className="history-link" onClick={() => { void chrome.windows.getCurrent().then((w) => chrome.sidePanel.open({ windowId: w.id! })).catch(() => chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') })) }}>Xem tất cả <ArrowRight size={13} /></button></div>
      {recent.length ? recent.map((item) => <HistoryItem key={item.id} record={item} selected={record?.id === item.id} onClick={() => showRecord(item)} />) : <p className="empty"><Clock3 size={16} /> Chưa có lượt kiểm tra nào.</p>}
    </div>
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)
