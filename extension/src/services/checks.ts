import { nativeRequest, type NativeProgress } from './nativeHost'
import { domainOnly, mxToolboxLookup, registrationDomain, whoisLookup, type MXCommand } from './domainLookup'
import { grantHost } from './hostAccess'
import { publicIP } from './formatRecord'
import { commonPorts } from './scanPorts'
import { getVMInfoFromTab } from './vmInfo'
import { getSettings, saveRecord, type CheckRecord } from './storage'
import { parseInput, safeMaxHops, safePingCount, safePort, safeTimeout } from './validation'

export type Tool = 'ping' | 'traceroute' | 'tcp_check' | 'port_scan' | 'tls_check' | 'local_interfaces' | 'public_ip' | 'vm_info' | 'mxtoolbox' | 'whois'
export const labels: Record<Tool, string> = {
  ping: 'Ping', traceroute: 'Traceroute', tcp_check: 'TCP Port', port_scan: 'Quét Port',
  tls_check: 'SSL / TLS',
  local_interfaces: 'Mạng LAN', public_ip: 'IP Public', vm_info: 'Thông tin VM',
  mxtoolbox: 'MXToolbox', whois: 'WHOIS / RDAP',
}
const external = new Set<Tool>(['public_ip', 'mxtoolbox', 'whois'])
const browser = new Set<Tool>(['vm_info', ...external])

async function fetchJSON(url: string, timeoutMs: number, onProgress?: (event: NativeProgress) => void): Promise<Record<string, unknown>> {
  await grantHost(url)
  onProgress?.({ text: 'Đang chờ phản hồi IP Public...' })
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Dịch vụ trả về HTTP ${response.status}`)
  return await response.json() as Record<string, unknown>
}

export async function runCheck(tool: Tool, input: string, portInput: number, scanPorts: number[] = commonPorts, mxCommand: MXCommand = 'dns', pingCount = 4, maxHops = 20, onProgress?: (event: NativeProgress) => void): Promise<CheckRecord> {
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
    const info = await getVMInfoFromTab()
    result = { ...info }
    target = info.computingName
    source = 'Tab hiện tại · Portal nội bộ'
  } else if (tool === 'mxtoolbox') {
    result = await mxToolboxLookup(domainOnly(host), mxCommand, settings.mxtoolboxApiKey, timeoutMs, (text) => onProgress?.({ text }))
    source = 'Dịch vụ bên ngoài · MXToolbox'
  } else if (tool === 'whois') {
    target = registrationDomain(host)
    result = await whoisLookup(target, timeoutMs, settings.bknsApiKey, (text) => onProgress?.({ text }))
    source = target.endsWith('.vn') ? 'Dịch vụ bên ngoài · BKNS WHOIS' : 'Dịch vụ bên ngoài · RDAP'
  } else if (tool === 'public_ip') {
    onProgress?.({ text: 'Đang xin quyền truy cập ipify...' })
    result = await fetchJSON('https://api.ipify.org?format=json', timeoutMs, onProgress)
    if (!publicIP(result)) throw new Error('Dịch vụ IP Public không trả về địa chỉ IP hợp lệ')
    source = 'Dịch vụ bên ngoài · ipify'
  } else {
    const params: Record<string, unknown> = { timeoutMs }
    if (tool === 'ping') Object.assign(params, { target: host, count: safePingCount(pingCount) })
    if (tool === 'traceroute') Object.assign(params, { target: host, maxHops: safeMaxHops(maxHops) })
    if (tool === 'tcp_check') Object.assign(params, { target: host, port: safePort(portInput) })
    if (tool === 'port_scan') Object.assign(params, { target: host, ports: scanPorts, timeoutMs: Math.min(timeoutMs, 2000) })
    if (tool === 'tls_check') Object.assign(params, { host, port: safePort(portInput) })
    onProgress?.({ text: tool === 'local_interfaces' ? 'Đang đọc cấu hình mạng...' :
      tool === 'tls_check' ? 'Đang kết nối TLS và kiểm tra chứng chỉ...' :
      tool === 'tcp_check' ? 'Đang thử kết nối TCP...' :
      tool === 'port_scan' ? 'Đang quét các cổng TCP...' :
      tool === 'ping' ? 'Đang gửi gói Ping...' : 'Đang theo dõi các hop...' })
    result = await nativeRequest(tool, params, onProgress)
  }
  onProgress?.({ text: 'Đang hoàn tất kết quả...' })
  const status: CheckRecord['status'] = result.open === false || (typeof result.status === 'number' && result.status >= 400) ||
    (typeof result.loss === 'number' && result.loss > 0) || result.verified === false ||
    (typeof result.Status === 'number' && result.Status !== 0) || result.timedOut === true ||
    (typeof result.timeoutCount === 'number' && result.timeoutCount > 0) ||
    (tool === 'mxtoolbox' && Array.isArray(result.records) && result.records.length === 0) ||
    (tool === 'vm_info' && (!result.vmName || !result.vmp || !result.host || !result.resourcePool || !result.group)) ? 'warn' : 'ok'
  const record: CheckRecord = { id: crypto.randomUUID(), at: new Date().toISOString(), tool: labels[tool], target, source, status, result }
  await saveRecord(record)
  return record
}

export function toolRequiresAgent(tool: Tool): boolean { return !browser.has(tool) }
