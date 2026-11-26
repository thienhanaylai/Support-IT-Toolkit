import { afterEach, describe, expect, it, vi } from 'vitest'
import { httpPing, parseHTTPURL } from './http-ping'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function response(status: number) {
  return { status, ok: status >= 200 && status < 300, body: { cancel: vi.fn(async () => {}) } }
}

describe('HTTP Ping', () => {
  it('normalizes bare hosts to HTTPS and rejects unsupported URLs', () => {
    expect(parseHTTPURL('example.com/path').href).toBe('https://example.com/path')
    expect(parseHTTPURL(' http://example.com/ ').href).toBe('http://example.com/')
    expect(() => parseHTTPURL('')).toThrow('Nhập URL')
    expect(() => parseHTTPURL('ftp://example.com/')).toThrow('Chỉ hỗ trợ URL HTTP hoặc HTTPS')
    expect(() => parseHTTPURL('https://user:pass@example.com/')).toThrow('thông tin đăng nhập')
  })

  it('measures response headers and keeps 4xx responses as HTTP replies', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(404))
    vi.stubGlobal('fetch', fetchMock)
    const progress = vi.fn()
    const result = await httpPing('https://example.com/', 'HEAD', 2, 3_000, progress)
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://example.com/', expect.objectContaining({
      method: 'HEAD', cache: 'no-store', credentials: 'omit', redirect: 'follow',
    }))
    expect(result).toMatchObject({
      success: true, action: 'http_ping', url: 'https://example.com/', method: 'HEAD',
      sent: 2, received: 2, failed: 0, loss: 0, okCount: 1,
    })
    expect(result.attempts).toMatchObject([
      { index: 1, status: 200, ok: true },
      { index: 2, status: 404, ok: false },
    ])
    expect(String(result.raw)).toContain('[1] HTTP 200')
    expect(String(result.raw)).toContain('4xx/5xx vẫn là phản hồi HTTP')
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ completed: 2, total: 2 }))
  })

  it('counts network errors as packet loss without aborting the run', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(response(204))
    vi.stubGlobal('fetch', fetchMock)
    const result = await httpPing('example.com', 'GET', 2, 3_000)
    expect(result).toMatchObject({ sent: 2, received: 1, failed: 1, loss: 50, okCount: 1 })
    expect(result.attempts).toMatchObject([
      { index: 1, ok: false, error: 'Failed to fetch' },
      { index: 2, status: 204, ok: true },
    ])
    expect(String(result.raw)).toContain('Lỗi mạng: Failed to fetch')
  })

  it('aborts after the configured timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    const pending = httpPing('example.com', 'HEAD', 1, 500)
    const rejection = expect(pending).rejects.toThrow('HTTP Ping hết thời gian chờ')
    await vi.advanceTimersByTimeAsync(500)
    await rejection
  })

  it('honours an external abort signal', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    const pending = httpPing('example.com', 'HEAD', 1, 3_000, undefined, controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow('Đã hủy kiểm tra.')
  })
})
