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

// WHOIS/RDAP searches registrations, not individual hosts (e.g. portal.longvan.vn).
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

type RDAPlike = Record<string, unknown>

export function summarizeRDAP(data: RDAPlike): Record<string, unknown> {
  const entities = Array.isArray(data.entities) ? data.entities : []
  const registrar = entities.find((item: unknown) =>
    item && typeof item === 'object' && Array.isArray((item as RDAPlike).roles) &&
    ((item as RDAPlike).roles as unknown[]).includes('registrar')) as RDAPlike | undefined
  const vcard = Array.isArray(registrar?.vcardArray) && Array.isArray(registrar.vcardArray[1])
    ? registrar.vcardArray[1] as unknown[] : []
  const name = vcard.find((field) => Array.isArray(field) && field[0] === 'fn')
  const events = Array.isArray(data.events) ? data.events : []
  const dates: Record<string, string> = {}
  for (const event of events) {
    if (!event || typeof event !== 'object') continue
    const { eventAction, eventDate } = event as RDAPlike
    if (typeof eventAction === 'string' && typeof eventDate === 'string' &&
        ['registration', 'expiration', 'last changed', 'last update of RDAP database'].includes(eventAction)) {
      dates[eventAction] = eventDate.slice(0, 50)
    }
  }
  return {
    domain: typeof data.ldhName === 'string' ? data.ldhName : null,
    handle: typeof data.handle === 'string' ? data.handle : null,
    registrar: Array.isArray(name) && typeof name[3] === 'string' ? name[3] : null,
    status: Array.isArray(data.status) ? data.status.filter((s): s is string => typeof s === 'string').slice(0, 20) : [],
    nameServers: Array.isArray(data.nameservers)
      ? data.nameservers.map((item: unknown) => item && typeof item === 'object' ? (item as RDAPlike).ldhName : null).filter((s): s is string => typeof s === 'string').slice(0, 30) : [],
    events: dates,
    dnssec: typeof (data.secureDNS as RDAPlike | undefined)?.delegationSigned === 'boolean'
      ? (data.secureDNS as RDAPlike).delegationSigned : null,
    note: 'RDAP là giao thức tra cứu đăng ký tên miền thay cho WHOIS; dữ liệu cá nhân có thể bị ẩn bởi registry.',
  }
}

// BKNS returns .vn registration data through its authorized VNNIC relay.
// Intentionally exclude registrant/owner and raw payload from history and reports.
export function summarizeBknsWhois(data: RDAPlike, domain: string): Record<string, unknown> {
  if (typeof data.domain !== 'string' || data.domain.toLowerCase() !== domain ||
      !['registered', 'pending', 'available', 'reserved', 'auction'].includes(String(data.status))) {
    throw new Error('Dịch vụ WHOIS trả về dữ liệu không hợp lệ hoặc không đúng tên miền')
  }
  const details = data.data && typeof data.data === 'object' && !Array.isArray(data.data)
    ? data.data as RDAPlike : {}
  const registrar = details.registrar && typeof details.registrar === 'object'
    ? details.registrar as RDAPlike : {}
  const dates = details.dates && typeof details.dates === 'object'
    ? details.dates as RDAPlike : {}
  const safe = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : null
  return {
    domain,
    registrationStatus: data.status,
    registrar: safe(registrar.name),
    events: {
      registration: safe(dates.created),
      expiration: safe(dates.expiry),
      'last changed': safe(dates.updated),
    },
    status: Array.isArray(details.domainStatus)
      ? details.domainStatus.filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 100)).slice(0, 20) : [],
    nameServers: Array.isArray(details.nameservers)
      ? details.nameservers.filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 200)).slice(0, 30) : [],
    dnssec: typeof details.dnssec === 'boolean' ? details.dnssec : null,
    source: 'BKNS WHOIS (dữ liệu .vn từ VNNIC)',
  }
}

export async function bknsWhoisLookup(domain: string, apiKey: string, timeoutMs: number, onProgress?: (text: string) => void): Promise<Record<string, unknown>> {
  const key = apiKey.trim()
  if (!key) {
    throw new Error('Tra cứu WHOIS .vn tự động cần BKNS API key trong Cài đặt. Nếu chưa có key, tra cứu thủ công trên VNNIC.')
  }
  const url = `https://whois.bkns.vn/api/v2/whois?domain=${encodeURIComponent(domain)}`
  onProgress?.('Đang kiểm tra quyền truy cập BKNS WHOIS...')
  await grantHost(url)
  onProgress?.('Đang chờ kết quả BKNS WHOIS...')
  const response = await fetch(url, {
    headers: { 'X-API-Key': key, Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(Math.max(5000, timeoutMs)),
    cache: 'no-store',
  })
  if (response.status === 401 || response.status === 403) throw new Error('BKNS API key không hợp lệ hoặc không có quyền tra cứu')
  if (response.status === 429) throw new Error('BKNS giới hạn số lần tra cứu. Hãy thử lại sau.')
  if (!response.ok) throw new Error(`BKNS WHOIS trả về HTTP ${response.status}`)
  return summarizeBknsWhois(await readJSON(response), domain)
}

export function rdapURLFromBootstrap(domain: string, bootstrap: Record<string, unknown>): string | null {
  const tld = domain.toLowerCase().split('.').at(-1)
  if (!tld || !Array.isArray(bootstrap.services)) return null
  for (const service of bootstrap.services) {
    if (!Array.isArray(service) || !Array.isArray(service[0]) || !service[0].includes(tld) || !Array.isArray(service[1])) continue
    for (const base of service[1]) {
      if (typeof base !== 'string') continue
      try {
        const url = new URL(base)
        if (url.protocol !== 'https:' || url.username || url.password ||
            !/^[a-z0-9.-]+$/i.test(url.hostname) || !url.hostname.includes('.') ||
            /^\d+(?:\.\d+){3}$/.test(url.hostname) || url.hostname.endsWith('.localhost')) continue
        return new URL(`domain/${encodeURIComponent(domain)}`, url.href.endsWith('/') ? url.href : `${url.href}/`).href
      } catch { /* skip malformed bootstrap entries */ }
    }
  }
  return null
}

async function rdapEndpoint(domain: string, timeoutMs: number, onProgress?: (text: string) => void): Promise<string> {
  // Direct registry endpoints for .com/.net avoid the opaque 302 response of rdap.org in extension fetch.
  const tld = domain.toLowerCase().split('.').at(-1)
  if (tld === 'com' || tld === 'net') return `https://rdap.verisign.com/${tld}/v1/domain/${encodeURIComponent(domain)}`
  const bootstrapURL = 'https://data.iana.org/rdap/dns.json'
  onProgress?.('Đang kiểm tra quyền truy cập danh mục RDAP IANA...')
  await grantHost(bootstrapURL)
  onProgress?.('Đang tải danh mục RDAP IANA...')
  const response = await fetch(bootstrapURL, {
    signal: AbortSignal.timeout(Math.max(5000, timeoutMs)), cache: 'force-cache',
  })
  if (!response.ok) throw new Error(`Không tải được danh mục RDAP của IANA (HTTP ${response.status})`)
  const bootstrap = await readJSON(response, 2_000_000)
  const endpoint = rdapURLFromBootstrap(domain, bootstrap)
  if (!endpoint) throw new Error(`IANA chưa công bố máy chủ RDAP HTTPS cho .${tld}; không thể tra tự động tên miền này.`)
  return endpoint
}

export async function whoisLookup(domain: string, timeoutMs: number, bknsApiKey = '', onProgress?: (text: string) => void): Promise<Record<string, unknown>> {
  if (domain.endsWith('.vn')) return bknsWhoisLookup(domain, bknsApiKey, timeoutMs, onProgress)
  const url = await rdapEndpoint(domain, timeoutMs, onProgress)
  onProgress?.('Đang kiểm tra quyền truy cập máy chủ RDAP...')
  await grantHost(url)
  onProgress?.('Đang chờ phản hồi RDAP...')
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/rdap+json, application/json' },
      signal: AbortSignal.timeout(Math.max(5000, timeoutMs)),
      cache: 'no-store',
    })
  } catch {
    throw new Error('Không kết nối được máy chủ RDAP. Kiểm tra mạng và quyền truy cập host.')
  }
  if (response.status === 404) throw new Error('Không tìm thấy dữ liệu RDAP. Hãy nhập tên miền đã đăng ký (không phải tên máy/subdomain).')
  if (response.status === 429) throw new Error('Dịch vụ RDAP giới hạn truy vấn. Hãy thử lại sau.')
  if (!response.ok) throw new Error(response.status === 0 ? 'Trình duyệt chặn phản hồi RDAP. Kiểm tra quyền truy cập host.' : `RDAP trả về HTTP ${response.status}`)
  const data = await readJSON(response)
  return { ...summarizeRDAP(data), source: new URL(response.url || url).hostname }
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
