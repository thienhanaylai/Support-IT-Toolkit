import { useEffect, useState } from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
import { formatDNSCheck, formatDoH, formatLAN, getCopyText, getRawOutput, publicIP } from '../services/formatRecord'
import { formatMXToolbox, formatWHOIS } from '../services/domainLookup'
import { formatVMInfo } from '../services/vmInfo'
import type { CheckRecord } from '../services/storage'
import { WhoisResult } from './WhoisResult'
import { TlsResult } from './TlsResult'

export function Result({ record, onCopyCurrentVM, copyingCurrentVM = false, copiedCurrentVM = false }: {
  record: CheckRecord
  onCopyCurrentVM?: () => Promise<void>
  copyingCurrentVM?: boolean
  copiedCurrentVM?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const rawOutput = getRawOutput(record.result)
  const isPingWithOutput = record.tool === 'Ping' && Boolean(rawOutput)
  const isHTTPPing = record.tool === 'HTTP Ping'
  const isLAN = record.tool === 'Mạng LAN'
  const isVMInfo = record.tool === 'Thông tin VM'
  const isDNSCheck = record.tool === 'DNS Check'
  const isDoH = record.tool === 'DNS over HTTPS'
  const isDomainLookup = record.tool === 'MXToolbox' || record.tool === 'WHOIS' || record.tool === 'WHOIS / RDAP'
  const scanRows = Array.isArray(record.result.ports) ? record.result.ports.filter(
    (item): item is { port: number; state: string; service?: string; durationMs?: number } =>
      typeof item === 'object' && item !== null && typeof item.port === 'number' && typeof item.state === 'string',
  ) : null
  useEffect(() => { setCopied(false); setCopyError(false) }, [record.id])

  async function copy() {
    try {
      const text = getCopyText(record)
      if (!text) throw new Error('Không có IP hợp lệ để sao chép')
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setCopyError(false)
    } catch {
      setCopyError(true)
    }
  }

  const details = rawOutput ? Object.fromEntries(Object.entries(record.result).filter(([key]) => key !== 'raw' && key !== 'ipconfig')) : record.result
  const copyButton = <button type="button" className="copy-button" onClick={() => void copy()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Đã sao chép' : record.tool === 'IP Public' ? 'Sao chép IP' : isVMInfo ? 'Sao chép kết quả này' : rawOutput ? (isHTTPPing ? 'Sao chép kết quả' : 'Sao chép dòng lệnh') : 'Sao chép kết quả'}</button>
  const vmCopyButtons = isVMInfo && onCopyCurrentVM ? <div className="vm-copy-actions">
    {copyButton}
    <button type="button" className="copy-button copy-current-vm" disabled={copyingCurrentVM}
      onClick={() => void onCopyCurrentVM().catch(() => setCopyError(true))}>
      {copiedCurrentVM ? <Check size={14} /> : <RefreshCw size={14} className={copyingCurrentVM ? 'spin' : ''} />}
      {copyingCurrentVM ? 'Đang lấy VM...' : copiedCurrentVM ? 'Đã lấy & sao chép' : 'Lấy mới & sao chép'}
    </button>
  </div> : copyButton

  return <section className={`result result-${record.status}`}>
    <div className="result-heading"><span className="status-dot" /><strong>{record.tool}</strong><span className="result-time">{new Date(record.at).toLocaleString('vi-VN')}</span></div>
    <div className="result-target">{record.target}</div>
    {!isPingWithOutput && <div className="source">{record.source}</div>}
    {!rawOutput && vmCopyButtons}
    {isPingWithOutput || isHTTPPing || (isLAN && rawOutput) ? null : record.tool === 'WHOIS' ? <WhoisResult result={record.result} /> : record.tool === 'SSL / TLS' ? <TlsResult result={record.result} /> : isLAN ? <pre>{formatLAN(record.result)}</pre> : isDNSCheck ? <pre>{formatDNSCheck(record.result)}</pre> : isDoH ? <pre>{formatDoH(record.result)}</pre> : isVMInfo || isDomainLookup ? <pre>{isVMInfo ? formatVMInfo(record.result) : record.tool === 'MXToolbox' ? formatMXToolbox(record.result) : formatWHOIS(record.result)}</pre> : scanRows ? <>
      <div className="scan-summary"><strong>{String(record.result.openCount ?? 0)} mở</strong><span>{String(record.result.closedCount ?? 0)} đóng</span><span>{String(record.result.timeoutCount ?? 0)} timeout</span></div>
      <div className="scan-address">IP kiểm tra: {String(record.result.resolvedIp ?? record.target)}</div>
      <div className="scan-table-wrap"><table className="scan-table"><thead><tr><th>PORT</th><th>GỢI Ý</th><th>TRẠNG THÁI</th><th>ĐỘ TRỄ</th></tr></thead><tbody>
        {scanRows.map((row) => <tr key={row.port}><td>{row.port}</td><td>{row.service || '—'}</td><td><span className={`scan-state scan-${row.state}`}>{row.state === 'open' ? 'Mở' : row.state === 'closed' ? 'Đóng' : 'Timeout'}</span></td><td>{row.durationMs ?? '—'} ms</td></tr>)}
      </tbody></table></div>
      <p className="scan-note">{String(record.result.note ?? '')}</p>
    </> : <pre>{JSON.stringify(details, null, 2)}</pre>}
    {rawOutput && <><div className="terminal-heading"><span>{isHTTPPing ? 'KẾT QUẢ HTTP PING' : 'KẾT QUẢ DÒNG LỆNH'}</span>{copyButton}</div><pre className="terminal-output" tabIndex={0} aria-label={`Kết quả ${record.tool}, cuộn để xem thêm`}>{rawOutput}</pre></>}
    {copyError && <p className="copy-error" role="alert">{record.tool === 'IP Public' && !publicIP(record.result) ? 'Không có địa chỉ IP hợp lệ để sao chép.' : 'Không thể sao chép. Hãy kiểm tra quyền clipboard của trình duyệt.'}</p>}
  </section>
}
