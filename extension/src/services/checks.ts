import { runBrowserTool } from '../engines/browser-engine'
import { publicIP } from './formatRecord'
import { getVMInfoFromTab } from './vmInfo'
import { getSettings, saveRecord, type CheckRecord } from './storage'
import { safeHTTPCount, safeTimeout } from './validation'
import { dohResolverLabel, type DoHRecordType, type DoHResolver } from './network/dns-lookup'
import { parseHTTPURL, type HTTPMethod } from './network/http-ping'
import type { CheckProgress } from './progress'

export const tools = ['doh_lookup', 'public_ip', 'http_ping', 'vm_info'] as const
export type Tool = typeof tools[number]
export const labels: Record<Tool, string> = {
  doh_lookup: 'DNS over HTTPS', public_ip: 'IP Public',
  http_ping: 'HTTP Ping', vm_info: 'Thông tin VM',
}

export function isTool(value: unknown): value is Tool {
  return typeof value === 'string' && (tools as readonly string[]).includes(value)
}

export async function runCheck(
  tool: Tool,
  input: string,
  httpCount = 4,
  onProgress?: (event: CheckProgress) => void,
  tabId?: number,
  httpMethod: HTTPMethod = 'HEAD',
  dohRecordType: DoHRecordType = 'AUTO',
  dohResolver: DoHResolver = 'cloudflare',
  signal?: AbortSignal,
): Promise<CheckRecord> {
  onProgress?.({ text: 'Đang đọc cài đặt...' })
  const settings = await getSettings()
  const timeoutMs = safeTimeout(settings.timeoutMs)
  let host = ''
  if (tool === 'http_ping') {
    host = parseHTTPURL(input).href
  } else if (tool === 'doh_lookup') {
    host = input.trim()
  }
  let target = tool === 'public_ip' ? 'Đường truyền hiện tại' : host
  let result: Record<string, unknown> = {}
  let source = ''
  if (tool === 'vm_info') {
    onProgress?.({ text: 'Đang đọc thông tin từ tab Portal...' })
    const info = await getVMInfoFromTab(tabId)
    result = { ...info }
    target = info.computingName
    source = 'Tab hiện tại · Portal nội bộ'
  } else if (tool === 'http_ping') {
    result = await runBrowserTool('http_ping', {
      input: host, method: httpMethod, count: safeHTTPCount(httpCount), timeoutMs,
    }, onProgress, signal)
    source = 'Trình duyệt · Fetch HTTP'
  } else if (tool === 'doh_lookup') {
    result = await runBrowserTool('doh_lookup', {
      input: host, recordType: dohRecordType, resolver: dohResolver, timeoutMs,
    }, onProgress, signal)
    source = `DNS over HTTPS · ${dohResolverLabel(dohResolver)}`
  } else if (tool === 'public_ip') {
    result = await runBrowserTool('public_ip', { timeoutMs }, onProgress, signal)
    if (!publicIP(result)) throw new Error('ifconfig.me không trả về địa chỉ IP hợp lệ')
    source = 'Trình duyệt · Fetch ifconfig.me'
  }
  onProgress?.({ text: 'Đang hoàn tất kết quả...' })
  const status: CheckRecord['status'] = result.open === false || (typeof result.status === 'number' && result.status >= 400) ||
    (typeof result.loss === 'number' && result.loss > 0) || result.verified === false ||
    (typeof result.Status === 'number' && result.Status !== 0) || result.timedOut === true ||
    (typeof result.timeoutCount === 'number' && result.timeoutCount > 0) ||
    (tool === 'http_ping' && typeof result.okCount === 'number' && typeof result.received === 'number' && result.okCount < result.received) ||
    (tool === 'doh_lookup' && (result.status !== 'NOERROR' || (Array.isArray(result.records) && result.records.length === 0))) ||
    (tool === 'vm_info' && (!result.vmName || !result.vmp || !result.host || !result.resourcePool || !result.group)) ? 'warn' : 'ok'
  const record: CheckRecord = { id: crypto.randomUUID(), at: new Date().toISOString(), tool: labels[tool], target, source, status, result }
  await saveRecord(record)
  return record
}
