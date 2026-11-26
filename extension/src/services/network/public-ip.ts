import { publicIP } from '../formatRecord'
import type { NativeProgress } from '../nativeHost'
import { abortError, withTimeout } from './timeout'

export const publicIPEndpoint = 'https://ifconfig.me/ip'

export async function fetchPublicIP(
  timeoutMs: number,
  onProgress?: (event: NativeProgress) => void,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const scope = withTimeout(timeoutMs, signal)
  onProgress?.({ text: 'Đang lấy IP Public từ ifconfig.me...' })
  try {
    const response = await fetch(publicIPEndpoint, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      signal: scope.signal,
      headers: { Accept: 'text/plain' },
    })
    if (!response.ok) throw new Error(`ifconfig.me thất bại: HTTP ${response.status}`)
    const result: Record<string, unknown> = {
      success: true,
      action: 'public_ip',
      ip: (await response.text()).trim(),
    }
    if (!publicIP(result)) throw new Error('ifconfig.me không trả về địa chỉ IP hợp lệ')
    return result
  } catch (error) {
    const abort = abortError(scope, signal, 'ifconfig.me')
    if (abort) throw abort
    throw error
  } finally {
    scope.cleanup()
  }
}
