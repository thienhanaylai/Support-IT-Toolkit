import { nativeRequest, type NativeProgress } from './nativeHost'
import { domainOnly, mxToolboxLookup, registrationDomain, type MXCommand } from './domainLookup'
import { publicIP } from './formatRecord'
import { commonPorts } from './scanPorts'
import { getVMInfoFromTab } from './vmInfo'
import { longVanWhoisLookup } from './longVanWhois'
import { getSettings, saveRecord, type CheckRecord } from './storage'
import { parseInput, safeMaxHops, safePingCount, safePort, safeTimeout } from './validation'

export type Tool = 'ping' | 'traceroute' | 'tcp_check' | 'port_scan' | 'dns_lookup' | 'tls_check' | 'local_interfaces' | 'public_ip' | 'vm_info' | 'mxtoolbox' | 'whois'
export type DNSRecordType = 'AUTO' | 'A' | 'AAAA' | 'MX' | 'TXT' | 'NS' | 'CNAME' | 'PTR'
export const labels: Record<Tool, string> = {
  ping: 'Ping', traceroute: 'Traceroute', tcp_check: 'TCP Port', port_scan: 'Quét Port',
  dns_lookup: 'DNS Check', tls_check: 'SSL / TLS',
  local_interfaces: 'Mạng LAN', public_ip: 'IP Public', vm_info: 'Thông tin VM',
  mxtoolbox: 'MXToolbox', whois: 'WHOIS',
}
const external = new Set<Tool>(['mxtoolbox', 'whois'])
const browser = new Set<Tool>(['vm_info', ...external])

export async function runCheck(tool: Tool, input: string, portInput: number, scanPorts: number[] = commonPorts, mxCommand: MXCommand = 'dns', pingCount = 4, maxHops = 20, onProgress?: (event: NativeProgress) => void, tabId?: number, dnsRecordType: DNSRecordType = 'AUTO', dnsServer = ''): Promise<CheckRecord> {
  onProgress?.({ text: 'Đang đọc cài đặt...' })
  const settings = await getSettings()
  const timeoutMs = safeTimeout(settings.timeoutMs)
  let host = ''
  if (tool !== 'local_interfaces' && tool !== 'public_ip' && tool !== 'vm_info') host = parseInput(input).host
  let target = tool === 'local_interfaces' ? 'Máy này' : tool === 'public_ip' ? 'Đường truyền hiện tại' : host
  let result: Record<string, unknown>
  let source = 'Máy người dùng · Local Agent'
  if (tool === 'vm_info') {
    onProgress?.({ text: 'Đang đọc thông tin từ tab Portal...' })
    const info = await getVMInfoFromTab(tabId)
    result = { ...info }
    target = info.computingName
    source = 'Tab hiện tại · Portal nội bộ'
  } else if (tool === 'mxtoolbox') {
    result = await mxToolboxLookup(domainOnly(host), mxCommand, settings.mxtoolboxApiKey, timeoutMs, (text) => onProgress?.({ text }))
    source = 'Dịch vụ bên ngoài · MXToolbox'
  } else if (tool === 'whois') {
    target = registrationDomain(host)
    result = await longVanWhoisLookup(target, timeoutMs, (text) => onProgress?.({ text }))
    source = 'Trang WHOIS Long Vân'
  } else {
    const params: Record<string, unknown> = { timeoutMs }
    if (tool === 'ping') Object.assign(params, { target: host, count: safePingCount(pingCount) })
    if (tool === 'traceroute') Object.assign(params, { target: host, maxHops: safeMaxHops(maxHops) })
    if (tool === 'tcp_check') Object.assign(params, { target: host, port: safePort(portInput) })
    if (tool === 'port_scan') Object.assign(params, { target: host, ports: scanPorts, timeoutMs: Math.min(timeoutMs, 2000) })
    if (tool === 'dns_lookup') Object.assign(params, { name: host, recordType: dnsRecordType, resolver: dnsServer.trim() })
    if (tool === 'tls_check') Object.assign(params, { host, port: safePort(portInput) })
    onProgress?.({ text: tool === 'public_ip' ? 'Đang chạy curl ifconfig.me...' :
      tool === 'local_interfaces' ? 'Đang đọc cấu hình mạng...' :
      tool === 'dns_lookup' ? `Đang truy vấn DNS${dnsServer.trim() ? ` qua ${dnsServer.trim()}` : ' của hệ điều hành'}...` :
      tool === 'tls_check' ? 'Đang kết nối TLS và kiểm tra chứng chỉ...' :
      tool === 'tcp_check' ? 'Đang thử kết nối TCP...' :
      tool === 'port_scan' ? 'Đang quét các cổng TCP...' :
      tool === 'ping' ? 'Đang gửi gói Ping...' : 'Đang theo dõi các hop...' })
    result = await nativeRequest(tool, params, onProgress)
    if (tool === 'dns_lookup' && dnsServer.trim() && result.resolver === 'DNS của hệ điều hành') {
      throw new Error('Local Agent đã cũ, chưa hỗ trợ DNS server tùy chọn. Hãy chạy lại bộ cài Agent với Extension ID hiện tại.')
    }
    if (tool === 'public_ip') {
      if (!publicIP(result)) throw new Error('ifconfig.me không trả về địa chỉ IP hợp lệ')
      source = 'Máy người dùng · curl ifconfig.me'
    }
  }
  onProgress?.({ text: 'Đang hoàn tất kết quả...' })
  const status: CheckRecord['status'] = result.open === false || (typeof result.status === 'number' && result.status >= 400) ||
    (typeof result.loss === 'number' && result.loss > 0) || result.verified === false ||
    (typeof result.Status === 'number' && result.Status !== 0) || result.timedOut === true ||
    (typeof result.timeoutCount === 'number' && result.timeoutCount > 0) ||
    (tool === 'dns_lookup' && Array.isArray(result.records) && result.records.length === 0) ||
    (tool === 'mxtoolbox' && Array.isArray(result.records) && result.records.length === 0) ||
    (tool === 'vm_info' && (!result.vmName || !result.vmp || !result.host || !result.resourcePool || !result.group)) ? 'warn' : 'ok'
  const record: CheckRecord = { id: crypto.randomUUID(), at: new Date().toISOString(), tool: labels[tool], target, source, status, result }
  await saveRecord(record)
  return record
}

export function toolRequiresAgent(tool: Tool): boolean { return !browser.has(tool) }
