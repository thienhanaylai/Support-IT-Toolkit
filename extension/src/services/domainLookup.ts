import { grantHost } from './hostAccess'
import { parseInput } from './validation'
import { getDomain } from 'tldts'

export const mxCommands = ['dns', 'a', 'aaaa', 'mx', 'txt', 'spf', 'dmarc', 'soa'] as const
export type MXCommand = typeof mxCommands[number]

export function domainOnly(input: string): string {
  const { host } = parseInput(input)
  if (!host.includes('.') || host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host)) {
    throw new Error('Nhập tên miền hợp lệ, không dùng địa chỉ IP')
  }
  return host.toLowerCase()
}

// WHOIS searches registrations, not individual hosts (e.g. portal.longvan.vn).
export function registrationDomain(input: string): string {
  const domain = getDomain(domainOnly(input), { allowPrivateDomains: false })
  if (!domain) throw new Error('Không xác định được tên miền đăng ký. Hãy nhập tên miền hợp lệ.')
  return domain.toLowerCase()
}

async function readJSON(response: Response, maxLength = 250_000): Promise<Record<string, unknown>> {
  const body = await response.text()
  if (body.length > maxLength) throw new Error('Phản hồi từ dịch vụ quá lớn')
  try {
    const data: unknown = JSON.parse(body)
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error()
    return data as Record<string, unknown>
  } catch { throw new Error('Dịch vụ không trả về dữ liệu JSON hợp lệ') }
}

export function mxRecordList(data: Record<string, unknown>): string[] {
  const information = Array.isArray(data.Information) ? data.Information :
    Array.isArray(data.Records) ? data.Records : []
  const fields = ['Type', 'Domain Name', 'IP Address', 'TTL']
  const fromRows = information.slice(0, 50).map((item: unknown) => {
    if (typeof item === 'string') return item.startsWith('Type: ') ? item.slice(0, 500).trim() : ''
    if (!item || typeof item !== 'object' || Array.isArray(item)) return ''
    const row = item as Record<string, unknown>
    return fields.flatMap((field) => {
      const value = row[field]
      if (typeof value !== 'string' && typeof value !== 'number') return []
      const clean = String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      return clean ? [`${field}: ${clean.slice(0, 200)}`] : []
    }).join(' · ')
  }).filter(Boolean)
  return [...new Set(fromRows)]
}

export async function mxToolboxLookup(domain: string, command: MXCommand, apiKey: string, timeoutMs: number, onProgress?: (text: string) => void): Promise<Record<string, unknown>> {
  if (!mxCommands.includes(command)) throw new Error('Loại truy vấn MXToolbox không hợp lệ')
  const key = apiKey.trim()
  if (key && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(key)) {
    throw new Error('API key MXToolbox phải là UUID hợp lệ')
  }
  if (!key && !(domain === 'example.com' && command === 'dns')) {
    throw new Error('MXToolbox yêu cầu API key. Mở Cài đặt để nhập key; chỉ DNS example.com dùng thử không cần key.')
  }
  const url = key
    ? `https://api.mxtoolbox.com/api/v1/Lookup/${command}/?argument=${encodeURIComponent(domain)}`
    : 'https://mxtoolbox.com/api/v1/lookup/dns/example.com'
  onProgress?.('Đang kiểm tra quyền truy cập MXToolbox...')
  await grantHost(url)
  onProgress?.('Đang chờ kết quả MXToolbox...')
  const response = await fetch(url, {
    headers: key ? { Authorization: key, Accept: 'application/json' } : { Accept: 'application/json' },
    signal: AbortSignal.timeout(Math.max(5000, timeoutMs)),
    cache: 'no-store',
  })
  if (response.status === 401 || response.status === 403) throw new Error('API key MXToolbox không hợp lệ hoặc không có quyền truy vấn này')
  if (response.status === 429) throw new Error('MXToolbox đã hết hạn mức truy vấn. Hãy thử lại sau.')
  if (!response.ok) throw new Error(`MXToolbox trả về HTTP ${response.status}`)
  const data = await readJSON(response)
  if (data.IsError === true) throw new Error('MXToolbox báo lỗi khi tra cứu domain')
  return {
    domain, command,
    reportingNameServer: typeof data.ReportingNameServer === 'string' ? data.ReportingNameServer.slice(0, 200) : null,
    timeToCompleteMs: typeof data.TimeToComplete === 'number' || typeof data.TimeToComplete === 'string'
      ? String(data.TimeToComplete).slice(0, 30) : null,
    records: mxRecordList(data),
  }
}

export function formatMXToolbox(result: Record<string, unknown>): string {
  // Old saved results may still contain object-shaped records and health checks.
  const records = mxRecordList({ Information: result.records })
  return [
    `MXToolbox · ${String(result.command ?? 'dns')} · ${String(result.domain ?? '—')}`,
    `DNS server: ${String(result.reportingNameServer ?? '—')}`,
    `Thời gian: ${String(result.timeToCompleteMs ?? '—')} ms`,
    '',
    'BẢN GHI',
    ...(records.length ? records.map((item, index) => `${index + 1}. ${item}`) : ['Không có bản ghi.']),
  ].join('\n')
}

export function formatWHOIS(result: Record<string, unknown>): string {
  const events = result.events && typeof result.events === 'object' && !Array.isArray(result.events)
    ? result.events as Record<string, string> : {}
  return [
    `Tên miền: ${String(result.domain ?? '—')}`,
    ...(result.registrationStatus ? [`Tình trạng đăng ký: ${String(result.registrationStatus)}`] : []),
    `Nhà đăng ký: ${String(result.registrar ?? '—')}`,
    ...(result.handle ? [`Mã đăng ký: ${String(result.handle)}`] : []),
    `Ngày đăng ký: ${events.registration ?? '—'}`,
    `Ngày hết hạn: ${events.expiration ?? '—'}`,
    `Cập nhật cuối: ${events['last changed'] ?? '—'}`,
    `Trạng thái: ${Array.isArray(result.status) ? result.status.join(', ') : '—'}`,
    `Name servers: ${Array.isArray(result.nameServers) ? result.nameServers.join(', ') : '—'}`,
    ...(typeof result.dnssec === 'boolean' ? [`DNSSEC: ${result.dnssec ? 'Bật' : 'Tắt'}`] : []),
    `Nguồn: ${String(result.source ?? '—')}`,
  ].join('\n')
}
