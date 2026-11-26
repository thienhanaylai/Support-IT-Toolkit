import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, ArrowRight, Check, ClipboardCopy, Clock3, Cloud, Globe2, HardDrive, KeyRound, LockKeyhole, RotateCw, Search, Settings2, Tags, Wrench, Zap } from 'lucide-react'
import { HistoryItem } from '../components/HistoryItem'
import { Result } from '../components/Result'
import { PasswordGenerator } from '../components/PasswordGenerator'
import { Authenticator } from '../components/Authenticator'
import { isTool, labels, type Tool } from '../services/checks'
import { getHistory, type CheckRecord } from '../services/storage'
import { grantHost } from '../services/hostAccess'
import { dohQuery, dohRecordTypes, dohResolvers, type DoHRecordType, type DoHResolver } from '../services/network/dns-lookup'
import { parseHTTPURL, type HTTPMethod } from '../services/network/http-ping'
import { draftKey, jobKey, type CheckJob, type PopupDraft } from '../services/work'
import { buildVmName, copyServiceConfig, isPortalServiceUrl, isPortalVmConfig, portalVmConfigKey, type PortalVmConfig } from '../services/portalVmConfig'
import type { VMInfo } from '../services/vmInfo'
import {
  formatTagElement, loadTagElementGroups, tagElementsStorageKey, type TagElementGroup,
} from '../services/tagElements'
import '../style.css'

const tools: { id: Tool; icon: React.ReactNode; detail: string }[] = [
  { id: 'vm_info', icon: <HardDrive size={19} />, detail: 'Đọc từ tab Portal hiện tại' },
  { id: 'public_ip', icon: <Zap size={19} />, detail: 'IP Internet nhìn thấy' },
  { id: 'http_ping', icon: <Activity size={19} />, detail: 'Độ trễ phản hồi HTTP' },
  { id: 'doh_lookup', icon: <Cloud size={19} />, detail: 'DNS qua HTTPS' },
]
const instantTools: Tool[] = ['public_ip', 'vm_info']
const dohTypeLabels: Record<DoHRecordType, string> = {
  AUTO: 'Tự động (domain → A, IP → PTR)', A: 'A (IPv4)', AAAA: 'AAAA (IPv6)', CNAME: 'CNAME',
  MX: 'MX', TXT: 'TXT', NS: 'NS', SOA: 'SOA', PTR: 'PTR', CAA: 'CAA', SRV: 'SRV',
}
const inputTools = tools.filter((item) => !instantTools.includes(item.id))
const vmTools = tools.filter((item) => item.id === 'vm_info')
const networkInfoTools = tools.filter((item) => item.id === 'public_ip')

function toolForRecord(record: CheckRecord): Tool | undefined {
  return tools.find((candidate) => labels[candidate.id] === record.tool)?.id
}

function App() {
  const [activeTab, setActiveTab] = useState<'tools' | 'auth' | 'password'>('auth')
  const [input, setInput] = useState('')
  const [httpCount, setHttpCount] = useState(4)
  const [httpMethod, setHttpMethod] = useState<HTTPMethod>('HEAD')
  const [dohRecordType, setDohRecordType] = useState<DoHRecordType>('AUTO')
  const [dohResolver, setDohResolver] = useState<DoHResolver>('cloudflare')
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
  const [copyingCurrentVM, setCopyingCurrentVM] = useState(false)
  const [copiedCurrentVM, setCopiedCurrentVM] = useState(false)
  const [tagGroups, setTagGroups] = useState<TagElementGroup[]>([])
  const [activeTagGroupId, setActiveTagGroupId] = useState('')
  const [copiedTagMemberId, setCopiedTagMemberId] = useState('')
  const [tagCopyError, setTagCopyError] = useState('')
  const resultRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLPreElement>(null)
  const busy = starting || job?.status === 'running'
  const progress = job?.progress ?? []
  const inputPlaceholder = tool === 'http_ping' ? 'https://example.com/' : 'Domain hoặc IP'

  useEffect(() => {
    let mounted = true
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (mounted) setIsServicePage(Boolean(tab?.url && isPortalServiceUrl(tab.url)))
    }).catch(() => {})
    void chrome.storage.session.get(portalVmConfigKey).then((saved) => {
      if (mounted && isPortalVmConfig(saved[portalVmConfigKey])) setVmConfig(saved[portalVmConfigKey])
    }).catch(() => {})
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (!mounted) return
      if (area === 'local' && changes[tagElementsStorageKey]) {
        const next = changes[tagElementsStorageKey].newValue
        if (Array.isArray(next)) {
          setTagGroups(next as TagElementGroup[])
          setActiveTagGroupId((current) =>
            (next as TagElementGroup[]).some((group) => group.id === current)
              ? current : (next as TagElementGroup[])[0]?.id ?? '')
        }
        return
      }
      if (area === 'session' && changes[jobKey]) {
        const next = changes[jobKey].newValue as CheckJob | undefined
        setJob(next ?? null)
        if (next?.status === 'done' && next.record) {
          setRecord(next.record)
          setRecent((items) => [next.record!, ...items.filter((item) => item.id !== next.record!.id)].slice(0, 5))
        }
        if (next?.status === 'error' || next?.status === 'interrupted') setError(next.error ?? 'Kiểm tra bị gián đoạn')
      }
    }
    chrome.storage.onChanged.addListener(changed)
    void (async () => {
      const [stored, response, history, savedTagGroups] = await Promise.all([
        chrome.storage.session.get([draftKey, 'selectedTarget', 'displayedRecord']),
        chrome.runtime.sendMessage({ type: 'toolkit:get-job' }) as Promise<{ job?: CheckJob; error?: string }>,
        getHistory(),
        loadTagElementGroups(),
      ])
      if (!mounted) return
      const draft = stored[draftKey] as PopupDraft | undefined
      if (draft) {
        setInput(draft.input)
        const legacyDraft = draft as PopupDraft & { pingCount?: number }
        setHttpCount(draft.httpCount ?? legacyDraft.pingCount ?? 4)
        setHttpMethod(draft.httpMethod ?? 'HEAD')
        setDohRecordType(draft.dohRecordType ?? 'AUTO')
        setDohResolver(draft.dohResolver ?? 'cloudflare')
        setTool(isTool(draft.tool) ? draft.tool : null)
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
        if (isTool(response.job.tool) && (response.job.status === 'running' || !isTool(draft?.tool))) setTool(response.job.tool)
        if (response.job.status === 'error' || response.job.status === 'interrupted') setError(response.job.error ?? '')
      } else if (response.error) setError(response.error)
      const restoredRecord = (stored.displayedRecord as CheckRecord | undefined) ?? response.job?.record
      if (restoredRecord && toolForRecord(restoredRecord)) setRecord((current) => current ?? restoredRecord)
      const supportedHistory = history.filter((item) => toolForRecord(item))
      setRecent((current) => [...current, ...supportedHistory.filter((item) => !current.some((saved) => saved.id === item.id))].slice(0, 5))
      setTagGroups(savedTagGroups)
      setActiveTagGroupId(savedTagGroups[0]?.id ?? '')
      setReady(true)
    })().catch((cause) => { if (mounted) { setError(String(cause)); setReady(true) } })
    return () => { mounted = false; chrome.storage.onChanged.removeListener(changed) }
  }, [])

  useLayoutEffect(() => {
    if (!ready) return
    const draft: PopupDraft = {
      input, httpCount,
      httpMethod, dohRecordType, dohResolver, tool,
    }
    void chrome.storage.session.set({ [draftKey]: draft })
  }, [ready, input, httpCount, httpMethod, dohRecordType, dohResolver, tool])

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
    try {
      if (selectedTool === 'http_ping') parseHTTPURL(input)
      else if (selectedTool === 'doh_lookup') dohQuery(input, dohRecordType)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      scrollToResult()
      return
    }
    setTool(selectedTool)
    setStarting(true)
    scrollToResult()
    try {
      if (selectedTool === 'http_ping') await grantHost(parseHTTPURL(input).href)
      const [tab] = selectedTool === 'vm_info' ?
        await chrome.tabs.query({ active: true, currentWindow: true }) : [undefined]
      const response = await chrome.runtime.sendMessage({
        type: 'toolkit:start-job',
        request: { tool: selectedTool, input, httpCount, httpMethod, dohRecordType, dohResolver, tabId: tab?.id },
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
    const recordTool = toolForRecord(item)
    if (!recordTool) return
    setTool(recordTool)
    setRecord(item)
    setError('')
    void chrome.storage.session.set({ displayedRecord: item })
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
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

  async function copyTagMember(group: TagElementGroup, memberId: string) {
    const member = group.members.find((item) => item.id === memberId)
    if (!member) return
    setTagCopyError('')
    try {
      await navigator.clipboard.writeText(formatTagElement(member))
      setCopiedTagMemberId(member.id)
    } catch {
      setCopiedTagMemberId('')
      setTagCopyError('Không thể sao chép Tag Element.')
    }
  }

  function toolOutput(groupTools: Tool[]) {
    if (!tool || !groupTools.includes(tool)) return null
    return <div className="tool-group-output" ref={resultRef}>
      <div className="source-hint"><span className="hint-icon"><Globe2 size={15} /></span>{tool === 'vm_info' ? 'Chỉ đọc tab chi tiết computing của Portal khi bạn nhấn nút' : tool === 'http_ping' ? 'Chạy trong trình duyệt · cần cấp quyền host' : tool === 'doh_lookup' ? 'Truy vấn DNS over HTTPS trong trình duyệt' : 'Lấy IP Public trực tiếp trong trình duyệt'}</div>
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
          <div className="input-wrap"><Search size={18} /><input id="target" aria-label={tool === 'http_ping' ? 'URL HTTP hoặc HTTPS' : 'Domain hoặc địa chỉ IP'} placeholder={inputPlaceholder} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void run() }} /><button type="button" className="inline-check" disabled={busy || !tool} onClick={() => void run()}>{busy ? 'Đang chạy...' : tool ? 'Kiểm tra' : 'Chọn công cụ'}<ArrowRight size={14} /></button></div>
          {tool === 'http_ping' && <div className="dns-options">
            <div><label htmlFor="http-method">PHƯƠNG THỨC</label>
              <select id="http-method" value={httpMethod} onChange={(event) => setHttpMethod(event.target.value as HTTPMethod)}>
                <option value="HEAD">HEAD</option><option value="GET">GET</option>
              </select>
            </div>
            <div><label htmlFor="http-count">SỐ LẦN (1–5)</label>
              <input id="http-count" type="number" min={1} max={5} step={1} value={httpCount}
                onChange={(event) => setHttpCount(Number(event.target.value))}
                onKeyDown={(event) => { if (event.key === 'Enter') void run() }} />
            </div>
            <small>Đo thời gian tới response headers; 4xx/5xx vẫn là phản hồi HTTP, không phải lỗi mạng. Không phải ICMP RTT.</small>
          </div>}
          {tool === 'doh_lookup' && <div className="dns-options">
            <div><label htmlFor="doh-record-type">LOẠI BẢN GHI</label>
              <select id="doh-record-type" value={dohRecordType} onChange={(event) => setDohRecordType(event.target.value as DoHRecordType)}>
                {dohRecordTypes.map((type) => <option key={type} value={type}>{dohTypeLabels[type]}</option>)}
              </select>
            </div>
            <div><label htmlFor="doh-resolver">RESOLVER</label>
              <select id="doh-resolver" value={dohResolver} onChange={(event) => setDohResolver(event.target.value as DoHResolver)}>
                {(Object.entries(dohResolvers) as [DoHResolver, { label: string }][]).map(([value, item]) =>
                  <option key={value} value={value}>{item.label}</option>)}
              </select>
            </div>
            <small>Kết quả từ resolver DoH công khai, không đại diện DNS hệ điều hành hoặc VPN.</small>
          </div>}
        </div>}
        <div className="tool-grid">{inputTools.map((item) => <button type="button" key={item.id} title={`${labels[item.id]} — ${item.detail}`} aria-label={`${labels[item.id]}: ${item.detail}`} disabled={busy} className={`tool ${tool === item.id ? 'selected' : ''}`} onClick={() => { setTool(item.id); setError('') }}>
          <span className="tool-icon">{item.icon}</span><strong>{labels[item.id]}</strong><small>{item.detail}</small>
        </button>)}</div>
        {toolOutput(inputTools.map((item) => item.id))}
      </section>
      <section className="tool-section popup-tool-group vm-tool-section" aria-labelledby="vm-tools-heading">
        <div className="section-title" id="vm-tools-heading"><span>THÔNG TIN VM</span></div>
        <div className="vm-tools-layout">
          <div className="tool-grid vm-tool-grid">{vmTools.map((item) => <button type="button" key={item.id} title={`${labels[item.id]} — ${item.detail}`} aria-label={`${labels[item.id]}: ${item.detail}`} disabled={busy} className={`tool ${tool === item.id ? 'selected' : ''}`} onClick={() => { setTool(item.id); setError(''); void run(item.id) }}>
            <span className="tool-icon">{item.icon}</span><strong>{labels[item.id]}</strong><small>{item.detail}</small>
          </button>)}</div>
          <div className="tag-elements-quick" aria-label="Tag Element">
            <div className="tag-elements-quick-heading"><span><Tags size={14} /> TAG ELEMENT</span>
              <a href="options.html#tag-elements" target="_blank" rel="noreferrer" aria-label="Quản lý Tag Element">Sửa</a>
            </div>
            {tagGroups.length ? <>
              <div className="tag-group-tabs" role="tablist" aria-label="Lĩnh vực Tag Element">
                {tagGroups.map((group) => <button key={group.id} type="button" role="tab"
                  aria-selected={activeTagGroupId === group.id}
                  className={activeTagGroupId === group.id ? 'active' : ''}
                  onClick={() => { setActiveTagGroupId(group.id); setCopiedTagMemberId(''); setTagCopyError('') }}>
                  {group.name}
                </button>)}
              </div>
              {tagGroups.filter((group) => group.id === activeTagGroupId).map((group) =>
                <div className="tag-member-buttons" key={group.id}>
                  {group.members.length ? group.members.map((member) => <button type="button" key={member.id}
                    className={copiedTagMemberId === member.id ? 'is-copied' : ''}
                    title={`Sao chép ${formatTagElement(member)}`}
                    aria-label={`Sao chép Tag Element của ${member.name}`}
                    onClick={() => void copyTagMember(group, member.id)}>
                    {copiedTagMemberId === member.id && <Check size={12} />}{copiedTagMemberId === member.id ? 'Đã chép' : member.name}
                  </button>) : <span className="tag-elements-empty">Chưa có thành viên.</span>}
                </div>)}
            </> : <a className="tag-elements-empty-link" href="options.html#tag-elements" target="_blank" rel="noreferrer">Thêm danh sách trong Cài đặt</a>}
            {tagCopyError && <span className="tag-elements-error" role="alert">{tagCopyError}</span>}
          </div>
        </div>
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
