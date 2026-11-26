import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPublicIP, publicIPEndpoint } from './public-ip'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('browser Public IP', () => {
  it('fetches and validates the same ifconfig.me endpoint without an Agent', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => ' 203.0.113.8\r\n' }))
    vi.stubGlobal('fetch', fetchMock)
    const progress = vi.fn()
    await expect(fetchPublicIP(3_000, progress)).resolves.toEqual({
      success: true, action: 'public_ip', ip: '203.0.113.8',
    })
    expect(fetchMock).toHaveBeenCalledWith(publicIPEndpoint, expect.objectContaining({
      method: 'GET', cache: 'no-store', credentials: 'omit',
    }))
    expect(progress).toHaveBeenCalledWith({ text: 'Đang lấy IP Public từ ifconfig.me...' })
  })

  it('rejects HTTP errors and invalid response bodies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, text: async () => '' })))
    await expect(fetchPublicIP(3_000)).rejects.toThrow('ifconfig.me thất bại: HTTP 503')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '<html>error</html>' })))
    await expect(fetchPublicIP(3_000)).rejects.toThrow('ifconfig.me không trả về địa chỉ IP hợp lệ')
  })

  it('aborts after the configured timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    const pending = fetchPublicIP(500)
    const rejection = expect(pending).rejects.toThrow('ifconfig.me hết thời gian chờ')
    await vi.advanceTimersByTimeAsync(500)
    await rejection
  })
})
