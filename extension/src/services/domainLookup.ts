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
