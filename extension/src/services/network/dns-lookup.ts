import type { NativeProgress } from '../nativeHost'
import { abortError, clampTimeout, withTimeout } from './timeout'

export type DoHRecordType = 'AUTO' | 'A' | 'AAAA' | 'MX' | 'TXT' | 'NS' | 'CNAME' | 'PTR' | 'SOA' | 'CAA' | 'SRV'
export type DoHResolver = 'cloudflare' | 'google' | 'quad9'

export const dohResolvers: Record<DoHResolver, { label: string; endpoint: string }> = {
  cloudflare: { label: 'Cloudflare DoH (cloudflare-dns.com)', endpoint: 'https://cloudflare-dns.com/dns-query' },
  google: { label: 'Google DoH (dns.google)', endpoint: 'https://dns.google/dns-query' },
  quad9: { label: 'Quad9 DoH (dns.quad9.net)', endpoint: 'https://dns.quad9.net/dns-query' },
}

export const dohRecordTypes: DoHRecordType[] = ['AUTO', 'A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'PTR', 'SOA', 'CAA', 'SRV']

export function isDoHResolver(value: unknown): value is DoHResolver {
  return value === 'cloudflare' || value === 'google' || value === 'quad9'
}

export function safeDoHRecordType(value: unknown): DoHRecordType {
  return typeof value === 'string' && dohRecordTypes.includes(value as DoHRecordType)
    ? value as DoHRecordType : 'AUTO'
}

export function dohResolverLabel(value: unknown): string {
  return dohResolvers[isDoHResolver(value) ? value : 'cloudflare'].label
}

const typeCodes: Record<Exclude<DoHRecordType, 'AUTO'>, number> = {
  A: 1, NS: 2, CNAME: 5, SOA: 6, PTR: 12, MX: 15, TXT: 16, AAAA: 28, SRV: 33, CAA: 257,
}

const typeNames: Record<number, string> = {
  1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR', 15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV', 257: 'CAA',
}

const rcodeNames: Record<number, string> = {
  0: 'NOERROR', 1: 'FORMERR', 2: 'SERVFAIL', 3: 'NXDOMAIN', 4: 'NOTIMP', 5: 'REFUSED',
}

function parseIPv4(value: string): number[] | null {
  const parts = value.split('.')
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) return null
  return parts.map(Number)
}

function parseIPv6(value: string): string[] | null {
  const raw = value.replace(/^\[|\]$/g, '').split('%')[0]
  if (!raw.includes(':')) return null
  const halves = raw.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  if (halves.length === 1 && head.length !== 8) return null
  if (halves.length === 2 && head.length + tail.length >= 8) return null
  const groups = [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail]
  if (groups.length !== 8 || !groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) return null
  return groups.map((group) => group.toLowerCase().padStart(4, '0'))
}

export function isIPAddress(value: string): boolean {
  return parseIPv4(value) !== null || parseIPv6(value) !== null
}

export function reverseDNSName(value: string): string {
  const ipv4 = parseIPv4(value)
  if (ipv4) return `${[...ipv4].reverse().join('.')}.in-addr.arpa`
  const ipv6 = parseIPv6(value)
  if (!ipv6) throw new Error('PTR yêu cầu địa chỉ IPv4 hoặc IPv6 hợp lệ')
  return `${ipv6.join('').split('').reverse().join('.')}.ip6.arpa`
}

function validateDNSName(name: string, allowUnderscore = false): void {
  const value = name.replace(/\.$/, '')
  if (!value || value.length > 253) throw new Error('Tên miền không hợp lệ')
  const labelPattern = allowUnderscore ? /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/i : /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i
  if (!value.split('.').every((label) => labelPattern.test(label))) throw new Error('Tên miền không hợp lệ')
}

export function dohQuery(input: string, recordType: DoHRecordType): {
  display: string
  name: string
  type: Exclude<DoHRecordType, 'AUTO'>
} {
  const display = input.trim().replace(/^\[|\]$/g, '')
  if (!display) throw new Error('Nhập domain hoặc địa chỉ IP cần truy vấn')
  const type = recordType === 'AUTO' ? (isIPAddress(display) ? 'PTR' : 'A') : recordType
  if (type === 'PTR') {
    const name = isIPAddress(display) ? reverseDNSName(display) : display.replace(/\.$/, '')
    validateDNSName(name)
    return { display, name, type }
  }
  validateDNSName(display, type === 'SRV')
  return { display, name: display.replace(/\.$/, ''), type }
}

function randomID(): number {
  const bytes = new Uint8Array(2)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else { bytes[0] = Math.floor(Math.random() * 256); bytes[1] = Math.floor(Math.random() * 256) }
  return (bytes[0] << 8) | bytes[1]
}

export function buildDNSQuery(name: string, type: Exclude<DoHRecordType, 'AUTO'>): Uint8Array {
  const labels = name.replace(/\.$/, '').split('.').filter(Boolean)
  const nameLength = labels.reduce((sum, label) => sum + 1 + new TextEncoder().encode(label).length, 1)
  const bytes = new Uint8Array(12 + nameLength + 4)
  const view = new DataView(bytes.buffer)
  view.setUint16(0, randomID())
  view.setUint16(2, 0x0100)
  view.setUint16(4, 1)
  let offset = 12
  const encoder = new TextEncoder()
  for (const label of labels) {
    const encoded = encoder.encode(label)
    bytes[offset++] = encoded.length
    bytes.set(encoded, offset)
    offset += encoded.length
  }
  bytes[offset++] = 0
  view.setUint16(offset, typeCodes[type])
  view.setUint16(offset + 2, 1)
  return bytes
}

type DNSAnswer = { name: string; type: number; typeName: string; ttl: number; data: string }
type DNSMessage = {
  id: number
  rcode: number
  status: string
  truncated: boolean
  answers: DNSAnswer[]
}

function readName(view: DataView, start: number, depth = 0): { name: string; next: number } {
  if (depth > 20) throw new Error('DNS name compression quá sâu')
  const labels: string[] = []
  let offset = start
  let next = start
  let jumped = false
  for (let step = 0; step < 256; step++) {
    if (offset >= view.byteLength) throw new Error('DNS response bị cắt')
    const length = view.getUint8(offset)
    if (length === 0) {
      if (!jumped) next = offset + 1
      return { name: labels.join('.'), next }
    }
    if ((length & 0xc0) === 0xc0) {
      if (offset + 1 >= view.byteLength) throw new Error('DNS response bị cắt')
      const pointer = ((length & 0x3f) << 8) | view.getUint8(offset + 1)
      if (!jumped) next = offset + 2
      jumped = true
      offset = pointer
      continue
    }
    if (length > 63 || offset + 1 + length > view.byteLength) throw new Error('DNS label không hợp lệ')
    labels.push(new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset + offset + 1, length)))
    offset += 1 + length
    if (!jumped) next = offset
  }
  throw new Error('DNS name quá dài')
}

function formatIPv6(bytes: Uint8Array): string {
  const groups = Array.from({ length: 8 }, (_, index) => (bytes[index * 2] << 8) | bytes[index * 2 + 1])
  let bestStart = -1
  let bestLength = 0
  for (let index = 0; index < groups.length;) {
    if (groups[index] !== 0) { index++; continue }
    let end = index
    while (end < groups.length && groups[end] === 0) end++
    if (end - index > bestLength) { bestStart = index; bestLength = end - index }
    index = end
  }
  if (bestLength < 2) return groups.map((group) => group.toString(16)).join(':')
  const head = groups.slice(0, bestStart).map((group) => group.toString(16)).join(':')
  const tail = groups.slice(bestStart + bestLength).map((group) => group.toString(16)).join(':')
  return `${head}::${tail}`
}

function bytesAt(view: DataView, offset: number, length: number): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset + offset, length)
}

function formatRData(view: DataView, type: number, start: number, end: number): string {
  if (type === 1 && end - start === 4) return Array.from(bytesAt(view, start, 4)).join('.')
  if (type === 28 && end - start === 16) return formatIPv6(bytesAt(view, start, 16))
  if (type === 2 || type === 5 || type === 12) return readName(view, start).name
  if (type === 15) return `${view.getUint16(start)} ${readName(view, start + 2).name}`
  if (type === 16) {
    const chunks: string[] = []
    let offset = start
    while (offset < end) {
      const length = view.getUint8(offset++)
      if (offset + length > end) break
      chunks.push(`"${new TextDecoder().decode(bytesAt(view, offset, length)).replace(/"/g, '\\"')}"`)
      offset += length
    }
    return chunks.join(' ')
  }
  if (type === 6) {
    const mname = readName(view, start)
    const rname = readName(view, mname.next)
    const values = [mname.name, rname.name]
    for (let index = 0; index < 5; index++) values.push(String(view.getUint32(rname.next + index * 4)))
    return values.join(' ')
  }
  if (type === 257) {
    const flags = view.getUint8(start)
    const tagLength = view.getUint8(start + 1)
    const tag = new TextDecoder().decode(bytesAt(view, start + 2, tagLength))
    const value = new TextDecoder().decode(bytesAt(view, start + 2 + tagLength, end - start - 2 - tagLength))
    return `${flags} ${tag} "${value.replace(/"/g, '\\"')}"`
  }
  if (type === 33) {
    const priority = view.getUint16(start)
    const weight = view.getUint16(start + 2)
    const port = view.getUint16(start + 4)
    return `${priority} ${weight} ${port} ${readName(view, start + 6).name}`
  }
  return Array.from(bytesAt(view, start, end - start)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function parseDNSMessage(bytes: Uint8Array): DNSMessage {
  if (bytes.byteLength < 12) throw new Error('DNS response quá ngắn')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const flags = view.getUint16(2)
  const rcode = flags & 0x000f
  const questionCount = view.getUint16(4)
  const answerCount = view.getUint16(6)
  let offset = 12
  for (let index = 0; index < questionCount; index++) {
    offset = readName(view, offset).next + 4
  }
  const answers: DNSAnswer[] = []
  for (let index = 0; index < answerCount; index++) {
    if (offset >= view.byteLength) break
    const name = readName(view, offset)
    offset = name.next
    if (offset + 10 > view.byteLength) break
    const type = view.getUint16(offset)
    const ttl = view.getUint32(offset + 4)
    const length = view.getUint16(offset + 8)
    offset += 10
    if (offset + length > view.byteLength) break
    answers.push({
      name: name.name, type, typeName: typeNames[type] ?? `TYPE${type}`, ttl,
      data: formatRData(view, type, offset, offset + length),
    })
    offset += length
  }
  return {
    id: view.getUint16(0),
    rcode,
    status: rcodeNames[rcode] ?? `RCODE${rcode}`,
    truncated: (flags & 0x0200) !== 0,
    answers,
  }
}

export async function resolveDoH(
  input: string,
  recordType: DoHRecordType,
  resolver: DoHResolver,
  timeoutMs: number,
  onProgress?: (event: NativeProgress) => void,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const query = dohQuery(input, recordType)
  const selected = dohResolvers[resolver] ?? dohResolvers.cloudflare
  const body = buildDNSQuery(query.name, query.type)
  const scope = withTimeout(clampTimeout(timeoutMs), signal)
  const started = performance.now()
  onProgress?.({ text: `Đang truy vấn ${query.type} qua ${selected.label}...` })
  try {
    const response = await fetch(selected.endpoint, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      signal: scope.signal,
      headers: {
        'Content-Type': 'application/dns-message',
        Accept: 'application/dns-message',
      },
      body,
    })
    if (!response.ok) throw new Error(`${selected.label} thất bại: HTTP ${response.status}`)
    const parsed = parseDNSMessage(new Uint8Array(await response.arrayBuffer()))
    const durationMs = Math.max(0, Math.round(performance.now() - started))
    const records = parsed.answers.map((answer) => `${answer.typeName} ${answer.data}`)
    onProgress?.({ text: `DNS ${parsed.status} · ${records.length} bản ghi · ${durationMs} ms` })
    return {
      success: true,
      action: 'doh_lookup',
      name: query.display,
      queryName: query.name,
      recordType: query.type,
      records,
      status: parsed.status,
      rcode: parsed.rcode,
      truncated: parsed.truncated,
      answerCount: parsed.answers.length,
      durationMs,
      resolver: selected.label,
      note: 'Kết quả từ resolver DoH công khai, không đại diện cho DNS hệ điều hành hoặc VPN. NXDOMAIN/SERVFAIL được giữ nguyên theo phản hồi.',
    }
  } catch (error) {
    const abort = abortError(scope, signal, 'DNS over HTTPS')
    if (abort) throw abort
    throw error
  } finally {
    scope.cleanup()
  }
}
