import type { CheckRecord } from './storage'
import { formatMXToolbox, formatWHOIS } from './domainLookup'
import { formatVMInfo } from './vmInfo'

export function formatRecord(record: CheckRecord): string {
  return JSON.stringify({
    tool: record.tool,
    target: record.target,
    at: record.at,
    source: record.source,
    status: record.status,
    result: record.result,
  }, null, 2)
}

export function getRawOutput(result: Record<string, unknown>): string | null {
  const output = typeof result.raw === 'string' ? result.raw :
    typeof result.ipconfig === 'string' ? result.ipconfig : null
  return output && output.length > 0 ? output : null
}

export function formatLAN(result: Record<string, unknown>): string {
  const adapters = Array.isArray(result.adapters) ? result.adapters : []
  const lines = adapters.flatMap((adapter: unknown) => {
    if (!adapter || typeof adapter !== 'object' || Array.isArray(adapter)) return []
    const item = adapter as Record<string, unknown>
    const ips = Array.isArray(item.ipAddresses)
      ? item.ipAddresses.filter((ip): ip is string => typeof ip === 'string') : []
    return [
      `Adapter: ${typeof item.name === 'string' ? item.name : '—'}`,
      `IP: ${ips.length ? ips.join(', ') : '—'}`,
      `MAC: ${typeof item.mac === 'string' ? item.mac : '—'}`,
      '',
    ]
  })
  return lines.length ? lines.join('\n').trim() : 'Không có thông tin adapter mạng.'
}

export function publicIP(result: Record<string, unknown>): string | null {
  if (typeof result.ip !== 'string') return null
  const ip = result.ip.trim()
  const octets = ip.split('.')
  if (octets.length === 4 && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)) return ip
  if (!ip.includes(':') || !/^[0-9a-f:.]+$/i.test(ip)) return null
  try {
    const parsed = new URL(`http://[${ip}]/`)
    return parsed.hostname.startsWith('[') ? ip : null
  } catch { return null }
}

export function formatDNSCheck(result: Record<string, unknown>): string {
  const records = Array.isArray(result.records)
    ? result.records.filter((item): item is string => typeof item === 'string') : []
  return [
    `Tên/IP: ${String(result.name ?? '—')}`,
    `Loại bản ghi: ${String(result.recordType ?? '—')}`,
    `DNS server: ${String(result.resolver ?? '—')}`,
    `Thời gian: ${String(result.durationMs ?? '—')} ms`,
    '',
    records.length ? 'Kết quả:' : 'Không tìm thấy bản ghi.',
    ...records.map((item) => `• ${item}`),
  ].join('\n').trim()
}

export function getCopyText(record: CheckRecord): string {
  if (record.tool === 'IP Public') return publicIP(record.result) ?? ''
  if (record.tool === 'Thông tin VM') return formatVMInfo(record.result)
  if (record.tool === 'DNS Check') return formatDNSCheck(record.result)
  if (record.tool === 'MXToolbox') return formatMXToolbox(record.result)
  if (record.tool === 'WHOIS' || record.tool === 'WHOIS / RDAP') return formatWHOIS(record.result)
  const raw = getRawOutput(record.result)
  if (raw) return raw
  if (record.tool === 'Mạng LAN') return formatLAN(record.result)
  if (Array.isArray(record.result.ports)) {
    const rows = record.result.ports.filter((item): item is { port: number; state: string; service?: string; durationMs?: number } =>
      typeof item === 'object' && item !== null && typeof item.port === 'number' && typeof item.state === 'string')
    return [
      `${record.tool}: ${record.target} (${String(record.result.resolvedIp ?? '')})`,
      `${String(record.result.openCount ?? 0)} mở · ${String(record.result.closedCount ?? 0)} đóng · ${String(record.result.timeoutCount ?? 0)} timeout`,
      'PORT\tDỊCH VỤ\tTRẠNG THÁI\tMS',
      ...rows.map((item) => `${item.port}\t${item.service ?? '-'}\t${item.state}\t${item.durationMs ?? '-'}`),
    ].join('\n')
  }
  return formatRecord(record)
}
