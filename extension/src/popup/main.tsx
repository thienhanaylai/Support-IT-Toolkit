import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowRight, ClipboardCopy, Clock3, Globe2, HardDrive, KeyRound, LockKeyhole, MailSearch, Monitor, Network, Radio, RotateCw, ScanSearch, Search, Server, Settings2, ShieldCheck, UserRoundSearch, Wrench, Zap } from 'lucide-react'
import { HistoryItem } from '../components/HistoryItem'
import { Result } from '../components/Result'
import { PasswordGenerator } from '../components/PasswordGenerator'
import { Authenticator } from '../components/Authenticator'
import { labels, toolRequiresAgent, type Tool } from '../services/checks'
import { getHistory, getSettings, type CheckRecord } from '../services/storage'
import { commonPorts, parseScanPorts } from '../services/scanPorts'
import { domainOnly, isMXToolboxApiKey, registrationDomain, type MXCommand } from '../services/domainLookup'
import { longVanWhoisURL } from '../services/longVanWhois'
import { grantHost } from '../services/hostAccess'
import { parseInput } from '../services/validation'
import { draftKey, jobKey, type CheckJob, type PopupDraft } from '../services/work'
import { buildVmName, copyServiceConfig, isPortalServiceUrl, isPortalVmConfig, portalVmConfigKey, type PortalVmConfig } from '../services/portalVmConfig'
import type { VMInfo } from '../services/vmInfo'
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
const vmTools = tools.filter((item) => item.id === 'vm_info')
const networkInfoTools = tools.filter((item) => ['local_interfaces', 'public_ip'].includes(item.id))

function App() {
  const [activeTab, setActiveTab] = useState<'tools' | 'auth' | 'password'>('auth')
  const [input, setInput] = useState('')
  const [port, setPort] = useState(443)
  const [pingCount, setPingCount] = useState(4)
  const [maxHops, setMaxHops] = useState(20)
  const [scanMode, setScanMode] = useState<'common' | 'custom'>('common')
  const [customPorts, setCustomPorts] = useState('22,80,443,8080')
  const [mxCommand, setMxCommand] = useState<MXCommand>('dns')
  const [tool, setTool] = useState<Tool | null>(null)
  const [ready, setReady] = useState(false)
  const [starting, setStarting] = useState(false)
  const [job, setJob] = useState<CheckJob | null>(null)
  const [error, setError] = useState('')
  const [record, setRecord] = useState<CheckRecord | null>(null)
  const [recent, setRecent] = useState<CheckRecord[]>([])
  const [isServicePage, setIsServicePage] = useState(false)
  const [vmConfig, setVmConfig] = useState<PortalVmConfig | null>(null)
  const [configBusy, setConfigBusy] = useState(false)
  const [configMessage, setConfigMessage] = useState('')
  const [configFailed, setConfigFailed] = useState(false)
  const [hasMXKey, setHasMXKey] = useState<boolean | null>(null)
  const [showMXKeyForm, setShowMXKeyForm] = useState(false)
  const [mxKeyDraft, setMxKeyDraft] = useState('')
  const [mxKeyError, setMxKeyError] = useState('')
  const [mxKeySaving, setMxKeySaving] = useState(false)
  const [mxKeySaved, setMxKeySaved] = useState(false)
  const [copyingCurrentVM, setCopyingCurrentVM] = useState(false)
  const [copiedCurrentVM, setCopiedCurrentVM] = useState(false)
  const resultRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLPreElement>(null)
  const busy = starting || job?.status === 'running'
  const progress = job?.progress ?? []
  const mxDemo = tool === 'mxtoolbox' && input.trim().toLowerCase() === 'example.com' && mxCommand === 'dns'
  const mxNeedsKey = tool === 'mxtoolbox' && hasMXKey === false && !mxDemo

  useEffect(() => {
    let mounted = true
    void getSettings().then((settings) => {
      if (mounted) setHasMXKey(isMXToolboxApiKey(settings.mxtoolboxApiKey))
    }).catch(() => { if (mounted) setHasMXKey(null) })
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (mounted) setIsServicePage(Boolean(tab?.url && isPortalServiceUrl(tab.url)))
    }).catch(() => {})
    void chrome.storage.session.get(portalVmConfigKey).then((saved) => {
      if (mounted && isPortalVmConfig(saved[portalVmConfigKey])) setVmConfig(saved[portalVmConfigKey])
    }).catch(() => {})
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.settings && mounted) {
        const next = changes.settings.newValue as { mxtoolboxApiKey?: string } | undefined
        setHasMXKey(isMXToolboxApiKey(next?.mxtoolboxApiKey ?? ''))
      }
      if (area !== 'session' || !changes[jobKey] || !mounted) return
      const next = changes[jobKey].newValue as CheckJob | undefined
      setJob(next ?? null)
      if (next?.status === 'done' && next.record) {
        setRecord(next.record)
        setRecent((items) => [next.record!, ...items.filter((item) => item.id !== next.record!.id)].slice(0, 5))
      }
      if (next?.status === 'error' || next?.status === 'interrupted') setError(next.error ?? 'Kiểm tra bị gián đoạn')
    }
    chrome.storage.onChanged.addListener(changed)
    void (async () => {
      const [stored, response, history] = await Promise.all([
        chrome.storage.session.get([draftKey, 'selectedTarget', 'displayedRecord']),
        chrome.runtime.sendMessage({ type: 'toolkit:get-job' }) as Promise<{ job?: CheckJob; error?: string }>,
        getHistory(),
      ])
      if (!mounted) return
      const draft = stored[draftKey] as PopupDraft | undefined
      if (draft) {
        setInput(draft.input)
        setPort(draft.port)
        setPingCount(draft.pingCount)
        setMaxHops(draft.maxHops)
        setScanMode(draft.scanMode)
        setCustomPorts(draft.customPorts)
        setMxCommand(draft.mxCommand)
        setTool(draft.tool)
      }
      if (typeof stored.selectedTarget === 'string' && stored.selectedTarget) {
        setInput(stored.selectedTarget)
        void chrome.storage.session.remove('selectedTarget')
      } else if (!draft) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!mounted) return
        if (tab?.url && /^https?:\/\//.test(tab.url)) {
          try { setInput(new URL(tab.url).hostname) } catch { /* no active website */ }
        }
      }
      if (response.job) {
        setJob((current) => current && current.id === response.job?.id && current.status !== 'running' ? current : response.job!)
        if (response.job.status === 'running' || !draft?.tool) setTool(response.job.tool)
        if (response.job.status === 'error' || response.job.status === 'interrupted') setError(response.job.error ?? '')
      } else if (response.error) setError(response.error)
      setRecord((current) => current ?? (stored.displayedRecord as CheckRecord | undefined) ?? response.job?.record ?? null)
      setRecent((current) => [...current, ...history.filter((item) => !current.some((saved) => saved.id === item.id))].slice(0, 5))
      setReady(true)
    })().catch((cause) => { if (mounted) { setError(String(cause)); setReady(true) } })
    return () => { mounted = false; chrome.storage.onChanged.removeListener(changed) }
  }, [])

  useLayoutEffect(() => {
    if (!ready) return
    const draft: PopupDraft = { input, port, pingCount, maxHops, scanMode, customPorts, mxCommand, tool }
    void chrome.storage.session.set({ [draftKey]: draft })
  }, [ready, input, port, pingCount, maxHops, scanMode, customPorts, mxCommand, tool])

  useEffect(() => {
    progressRef.current?.scrollTo({ top: progressRef.current.scrollHeight })
  }, [progress])

  function scrollToResult() {
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  async function run(selectedTool: Tool | null = tool) {
    if (!ready || busy) return
    setError('')
    setRecord(null)
    setJob(null)
    void chrome.storage.session.remove('displayedRecord')
    if (!selectedTool) {
      setError('Hãy chọn một công cụ trước khi kiểm tra')
      scrollToResult()
      return
    }
    let scanPorts = commonPorts
    try {
      if (!instantTools.includes(selectedTool)) parseInput(input)
      if (selectedTool === 'mxtoolbox' || selectedTool === 'whois') domainOnly(input)
      if (selectedTool === 'port_scan' && scanMode === 'custom') scanPorts = parseScanPorts(customPorts)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      scrollToResult()
      return
    }
    if (selectedTool === 'mxtoolbox') {
      try {
        const settings = await getSettings()
        const validKey = isMXToolboxApiKey(settings.mxtoolboxApiKey)
        setHasMXKey(validKey)
        if (!validKey && (settings.mxtoolboxApiKey.trim() || !(domainOnly(input) === 'example.com' && mxCommand === 'dns'))) {
          setShowMXKeyForm(true)
          setMxKeySaved(false)
          return
        }
      } catch {
        setError('Không thể đọc API key MXToolbox. Hãy thử lại.')
        scrollToResult()
        return
      }
    }
    setTool(selectedTool)
    setStarting(true)
    scrollToResult()
    try {
      if (selectedTool === 'whois') await grantHost(longVanWhoisURL(registrationDomain(input)))
      if (selectedTool === 'mxtoolbox') {
        const settings = await getSettings()
        await grantHost(settings.mxtoolboxApiKey.trim() ? 'https://api.mxtoolbox.com/' : 'https://mxtoolbox.com/')
      }
      const [tab] = selectedTool === 'vm_info' ?
        await chrome.tabs.query({ active: true, currentWindow: true }) : [undefined]
      const response = await chrome.runtime.sendMessage({
        type: 'toolkit:start-job',
        request: { tool: selectedTool, input, port, scanPorts, mxCommand, pingCount, maxHops, tabId: tab?.id },
      }) as { job?: CheckJob; error?: string }
      if (response.error) throw new Error(response.error)
      if (response.job) setJob((current) =>
        current && current.id === response.job?.id && current.status !== 'running' ? current : response.job!)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      scrollToResult()
    } finally { setStarting(false) }
  }

  function showRecord(item: CheckRecord) {
    if (busy) return
    const recordTool = tools.find((candidate) => labels[candidate.id] === item.tool)?.id
    if (recordTool) setTool(recordTool)
    setRecord(item)
    setError('')
    void chrome.storage.session.set({ displayedRecord: item })
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  async function saveMXKey(event: React.FormEvent) {
    event.preventDefault()
    const key = mxKeyDraft.trim()
    if (!isMXToolboxApiKey(key)) {
      setMxKeyError('API key MXToolbox phải là UUID hợp lệ.')
      return
    }
    setMxKeySaving(true)
    setMxKeyError('')
    try {
      const settings = await getSettings()
      await chrome.storage.local.set({ settings: { ...settings, mxtoolboxApiKey: key } })
      setHasMXKey(true)
      setShowMXKeyForm(false)
      setMxKeyDraft('')
      setMxKeySaved(true)
      setError('')
    } catch {
      setMxKeyError('Không thể lưu API key. Hãy thử lại.')
    } finally { setMxKeySaving(false) }
  }

  async function copyPortalConfig() {
    if (configBusy || busy) return
    setConfigBusy(true)
    setConfigMessage('')
    setConfigFailed(false)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id || !tab.url) throw new Error('Không tìm thấy tab Portal đang mở.')
      const config = await copyServiceConfig(tab.id, tab.url)
      setVmConfig(config)
      setConfigMessage('Đã sao chép cấu hình và thông tin kiểm tra vào phiên trình duyệt. Mở trang Tạo computing để dán.')
    } catch (cause) {
      setConfigFailed(true)
      setConfigMessage(cause instanceof Error ? cause.message : 'Không thể chuyển cấu hình VM.')
    } finally { setConfigBusy(false) }
  }

  async function copyCurrentVM() {
    if (copyingCurrentVM) return
    setCopyingCurrentVM(true)
    setCopiedCurrentVM(false)
    setError('')
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('Không tìm thấy tab chi tiết computing đang mở.')
      const response = await chrome.runtime.sendMessage({
        type: 'toolkit:get-current-vm-info', tabId: tab.id,
      }) as { info?: VMInfo; text?: string; error?: string }
      if (response.error) throw new Error(response.error)
      if (!response.info || !response.text) throw new Error('Không có thông tin VM để sao chép.')
      await navigator.clipboard.writeText(response.text)
      const info = response.info
      const complete = info.vmName && info.vmp && info.host && info.resourcePool && info.group
      const next: CheckRecord = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        tool: labels.vm_info,
        target: info.computingName,
        source: 'Tab hiện tại · Portal nội bộ',
        status: complete ? 'ok' : 'warn',
        result: { ...info },
      }
      setTool('vm_info')
      setRecord(next)
      setRecent((items) => [next, ...items.filter((item) => item.id !== next.id)].slice(0, 5))
      await chrome.storage.session.set({ displayedRecord: next })
      setCopiedCurrentVM(true)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Không thể lấy và sao chép VM hiện tại.'
      setError(message)
      setCopiedCurrentVM(false)
      throw cause
    } finally {
      setCopyingCurrentVM(false)
    }
  }

  function toolOutput(groupTools: Tool[]) {
    if (!tool || !groupTools.includes(tool)) return null
    return <div className="tool-group-output" ref={resultRef}>
      <div className="source-hint"><span className="hint-icon">{toolRequiresAgent(tool) ? <Monitor size={15} /> : <Globe2 size={15} />}</span>{tool === 'vm_info' ? 'Chỉ đọc tab chi tiết computing của Portal khi bạn nhấn nút' : toolRequiresAgent(tool) ? 'Chạy từ máy bạn · cần Local Agent' : 'Dùng dịch vụ ngoài · có thể cần cấp quyền host'}</div>
      {(busy || (error && progress.length > 0)) && <div className="checking" role="status">
        <div>{busy ? `Đang kiểm tra ${labels[tool]}` : `Tiến trình ${labels[tool]} đã dừng`}
          {busy && progress.at(-1)?.total ? ` · ${progress.at(-1)?.completed}/${progress.at(-1)?.total} cổng` : ''}
        </div>
        {progress.length > 0 && <pre ref={progressRef} className="live-output" aria-label="Kết quả trong quá trình chạy">{progress.map((item) => item.text).join('\n')}</pre>}
      </div>}
      {error && <div className="error" role="alert">
        <div>{error}</div>
        {tool === 'vm_info' && <button type="button" className="retry-vm" disabled={busy} onClick={() => void run('vm_info')}>
          <RotateCw size={14} /> Thử lại
        </button>}
      </div>}
      {record && <Result record={record} onCopyCurrentVM={record.tool === labels.vm_info ? copyCurrentVM : undefined}
        copyingCurrentVM={copyingCurrentVM} copiedCurrentVM={copiedCurrentVM} />}
    </div>
  }

  if (!ready) return <main className="popup"><p role="status">Đang khôi phục phiên kiểm tra...</p></main>

  return <main className="popup">
    <header className="popup-header">
      <div className="popup-brand"><img src="/icons/icon-32.png" width="24" height="24" alt="" /><strong>LongVanSupport Toolkit</strong></div>
      <a className="popup-settings" href="options.html" target="_blank" rel="noreferrer"><Settings2 size={16} /> Cài đặt</a>
    </header>
    <nav className="popup-tabs" role="tablist" aria-label="Chức năng">
      <button type="button" role="tab" aria-selected={activeTab === 'auth'}
        className={activeTab === 'auth' ? 'active' : ''} onClick={() => setActiveTab('auth')}>
        <KeyRound size={18} /> Authenticator
      </button>
      <button type="button" role="tab" aria-selected={activeTab === 'password'}
        className={activeTab === 'password' ? 'active' : ''} onClick={() => setActiveTab('password')}>
        <LockKeyhole size={18} /> Mật khẩu
      </button>
      <button type="button" role="tab" aria-selected={activeTab === 'tools'}
        className={activeTab === 'tools' ? 'active' : ''} onClick={() => setActiveTab('tools')}>
        <Wrench size={18} /> Công cụ
      </button>
    </nav>
    {activeTab === 'tools' ? <div className="main-content">
      <section className="tool-section popup-tool-group domain-tool-section" aria-labelledby="input-tools-heading">
        <div className="section-title" id="input-tools-heading"><span>CÔNG CỤ DÙNG DOMAIN / IP</span></div>
        {(!tool || !instantTools.includes(tool)) && <div className="input-panel">
          <div className="input-wrap"><Search size={18} /><input id="target" aria-label="Domain hoặc địa chỉ IP" placeholder="Domain hoặc IP" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void run() }} /><button type="button" className="inline-check" disabled={busy || !tool} onClick={() => mxNeedsKey ? setShowMXKeyForm(true) : void run()}>{busy ? 'Đang chạy...' : mxNeedsKey ? 'Nhập API key' : tool ? 'Kiểm tra' : 'Chọn công cụ'}<ArrowRight size={14} /></button></div>
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
            {hasMXKey === false && <div className="mx-key-prompt">
              <div>Chưa có API key MXToolbox. Cần key để kiểm tra tên miền bất kỳ; chỉ DNS <code>example.com</code> dùng thử không cần key.</div>
              {!showMXKeyForm && <button type="button" className="mx-key-open" onClick={() => { setShowMXKeyForm(true); setMxKeySaved(false) }}>Nhập API key</button>}
              {showMXKeyForm && <form className="mx-key-form" onSubmit={(event) => void saveMXKey(event)}>
                <label htmlFor="mx-key-popup">API key MXToolbox (UUID)</label>
                <input id="mx-key-popup" type="password" autoComplete="off" spellCheck={false} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={mxKeyDraft} onChange={(event) => { setMxKeyDraft(event.target.value); setMxKeyError('') }} />
                <div className="mx-key-actions"><button type="submit" disabled={mxKeySaving}>{mxKeySaving ? 'Đang lưu...' : 'Lưu API key'}</button><button type="button" disabled={mxKeySaving} onClick={() => { setShowMXKeyForm(false); setMxKeyDraft(''); setMxKeyError('') }}>Hủy</button></div>
                {mxKeyError && <p className="mx-key-error" role="alert">{mxKeyError}</p>}
                <small>Key lưu trên thiết bị trong chrome.storage.local (không mã hóa); chỉ gửi tới MXToolbox khi bạn bấm Kiểm tra.</small>
              </form>}
            </div>}
            {hasMXKey && <small>API key đã lưu. Có thể thay đổi trong Cài đặt.</small>}
            {mxKeySaved && <small className="mx-key-saved" role="status">Đã lưu API key. Bây giờ bạn có thể bấm Kiểm tra.</small>}
          </div>}
        </div>}
        <div className="tool-grid">{inputTools.map((item) => <button type="button" key={item.id} title={`${labels[item.id]} — ${item.detail}`} aria-label={`${labels[item.id]}: ${item.detail}`} disabled={busy} className={`tool ${tool === item.id ? 'selected' : ''}`} onClick={() => { setTool(item.id); setError('') }}>
          <span className="tool-icon">{item.icon}</span><strong>{labels[item.id]}</strong><small>{item.detail}</small>
        </button>)}</div>
        {toolOutput(inputTools.map((item) => item.id))}
      </section>
      <section className="tool-section popup-tool-group vm-tool-section" aria-labelledby="vm-tools-heading">
        <div className="section-title" id="vm-tools-heading"><span>THÔNG TIN VM</span></div>
        <div className="tool-grid">{vmTools.map((item) => <button type="button" key={item.id} title={`${labels[item.id]} — ${item.detail}`} aria-label={`${labels[item.id]}: ${item.detail}`} disabled={busy} className={`tool ${tool === item.id ? 'selected' : ''}`} onClick={() => { setTool(item.id); setError(''); void run(item.id) }}>
          <span className="tool-icon">{item.icon}</span><strong>{labels[item.id]}</strong><small>{item.detail}</small>
        </button>)}</div>
        {toolOutput(vmTools.map((item) => item.id))}
      </section>
      <section className="tool-section popup-tool-group network-info-section" aria-labelledby="network-info-heading">
        <div className="section-title" id="network-info-heading"><span>THÔNG TIN MẠNG</span></div>
        <div className="tool-grid">{networkInfoTools.map((item) => <button type="button" key={item.id} title={`${labels[item.id]} — ${item.detail}`} aria-label={`${labels[item.id]}: ${item.detail}`} disabled={busy} className={`tool ${tool === item.id ? 'selected' : ''}`} onClick={() => { setTool(item.id); setError(''); void run(item.id) }}>
          <span className="tool-icon">{item.icon}</span><strong>{labels[item.id]}</strong><small>{item.detail}</small>
        </button>)}</div>
        {toolOutput(networkInfoTools.map((item) => item.id))}
      </section>
      {isServicePage && <section className="vm-transfer" aria-label="Sao chép cấu hình từ trang Dịch vụ">
        <div className="vm-transfer-title">CẤU HÌNH VM <span>PORTAL</span></div>
        <p>Lấy OS, CORE, RAM, Internet và STORAGE để dán VM; Site Provider chỉ dùng đối chiếu Khu vực. Không lấy IP hoặc Backup.</p>
        {vmConfig && <p>
          Đã lưu tạm: {vmConfig.cpu} Core · {vmConfig.ramGB} GB RAM · {vmConfig.internetMbps} Mb/s · {vmConfig.diskGB} GB {vmConfig.diskType.replace('_STORAGE', '')} · OS: {vmConfig.os || vmConfig.osId || 'Không có'} · Site Provider: {vmConfig.siteProvider || vmConfig.siteProviderId || 'Không có'}{buildVmName(vmConfig.ownerName, vmConfig.serviceCode) ? ` · Tên VM: ${buildVmName(vmConfig.ownerName, vmConfig.serviceCode)}` : ''}.
        </p>}
        <button type="button" disabled={configBusy || busy} onClick={() => void copyPortalConfig()}><ClipboardCopy size={15} /> {configBusy ? 'Đang sao chép...' : 'Sao chép thông số'}</button>
        {configMessage && <p className={`vm-transfer-message${configFailed ? ' vm-transfer-error' : ''}`} role={configFailed ? 'alert' : 'status'}>{configMessage}</p>}
      </section>}
      {!tool && <div className="source-hint"><span className="hint-icon"><Globe2 size={15} /></span>Chọn một công cụ để bắt đầu</div>}
      <div className="section-title history-title"><span>GẦN ĐÂY</span><button className="history-link" onClick={() => { void chrome.windows.getCurrent().then((w) => chrome.sidePanel.open({ windowId: w.id! })).catch(() => chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') })) }}>Xem tất cả <ArrowRight size={13} /></button></div>
      {recent.length ? recent.map((item) => <HistoryItem key={item.id} record={item} selected={record?.id === item.id} onClick={() => showRecord(item)} />) : <p className="empty"><Clock3 size={16} /> Chưa có lượt kiểm tra nào.</p>}
    </div> : activeTab === 'password' ? <div className="password-tab-content"><PasswordGenerator standalone /></div> : <Authenticator />}
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)
