import type { NativeProgress } from '../nativeHost'
import { abortError, clampTimeout, withTimeout } from './timeout'

export type HTTPMethod = 'HEAD' | 'GET'

export type HTTPPingAttempt = {
  index: number
  status?: number
  ok: boolean
  durationMs?: number
  error?: string
}

export function parseHTTPURL(input: string): URL {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Nhập URL HTTP/HTTPS cần kiểm tra')
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new Error('URL không hợp lệ')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Chỉ hỗ trợ URL HTTP hoặc HTTPS')
  }
  if (!url.hostname) throw new Error('URL không có host')
  if (url.username || url.password) throw new Error('Không hỗ trợ URL có thông tin đăng nhập')
  return url
}

export function safeHTTPMethod(value: unknown): HTTPMethod {
  return value === 'GET' ? 'GET' : 'HEAD'
}

export async function httpPing(
  input: string,
  method: HTTPMethod,
  count: number,
  timeoutMs: number,
  onProgress?: (event: NativeProgress) => void,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const url = parseHTTPURL(input)
  const total = Math.min(5, Math.max(1, Math.trunc(count) || 4))
  const timeout = clampTimeout(timeoutMs)
  const attempts: HTTPPingAttempt[] = []
  const rawLines = [`HTTP Ping ${url.href} (${method})`]
  onProgress?.({ text: `Đang gửi ${total} yêu cầu ${method} tới ${url.host}...` })

  for (let index = 1; index <= total; index++) {
    const scope = withTimeout(timeout, signal)
    const started = performance.now()
    try {
      const response = await fetch(url.href, {
        method,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'follow',
        signal: scope.signal,
        headers: method === 'GET' ? { 'Cache-Control': 'no-cache' } : undefined,
      })
      const durationMs = Math.max(0, Math.round(performance.now() - started))
      try { await response.body?.cancel() } catch { /* body already consumed or absent */ }
      const ok = response.status >= 200 && response.status < 300
      attempts.push({ index, status: response.status, ok, durationMs })
      const line = `[${index}] HTTP ${response.status} · ${durationMs} ms${ok ? '' : ' · không phải 2xx'}`
      rawLines.push(line)
      onProgress?.({ text: line, completed: index, total })
    } catch (error) {
      const abort = abortError(scope, signal, 'HTTP Ping')
      if (abort) throw abort
      const message = error instanceof Error ? error.message : String(error)
      attempts.push({ index, ok: false, error: message })
      const line = `[${index}] Lỗi mạng: ${message}`
      rawLines.push(line)
      onProgress?.({ text: line, completed: index, total })
    } finally {
      scope.cleanup()
    }
  }

  const responded = attempts.filter((item): item is HTTPPingAttempt & { status: number; durationMs: number } =>
    typeof item.status === 'number' && typeof item.durationMs === 'number')
  const durations = responded.map((item) => item.durationMs)
  const okCount = responded.filter((item) => item.ok).length
  const failed = total - responded.length
  const loss = Math.round(100 * failed / total)
  const minimum = durations.length ? Math.min(...durations) : 0
  const maximum = durations.length ? Math.max(...durations) : 0
  const average = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0

  rawLines.push(
    '',
    `Kết quả: ${responded.length}/${total} phản hồi · ${okCount} HTTP 2xx · ${failed} lỗi mạng`,
  )
  if (durations.length) {
    rawLines.push(`Thời gian (ms): Min = ${minimum}, Max = ${maximum}, Avg = ${average}`)
  }
  rawLines.push(
    'Ghi chú: Thời gian đo tới response headers; trình duyệt có thể tái sử dụng kết nối và cache DNS. ' +
    '4xx/5xx vẫn là phản hồi HTTP, không phải lỗi mạng.',
  )

  return {
    success: true,
    action: 'http_ping',
    url: url.href,
    method,
    sent: total,
    received: responded.length,
    failed,
    loss,
    okCount,
    min: minimum,
    avg: average,
    max: maximum,
    attempts,
    raw: rawLines.join('\n'),
    note: 'HTTP Ping dùng Fetch API và đo thời gian tới response headers; không phải ICMP RTT.',
  }
}
