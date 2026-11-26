import { publicIP } from '../formatRecord'
import type { NativeProgress } from '../nativeHost'

export const publicIPEndpoint = 'https://ifconfig.me/ip'

export async function fetchPublicIP(
  timeoutMs: number,
  onProgress?: (event: NativeProgress) => void,
): Promise<Record<string, unknown>> {
  const timeout = Number.isFinite(timeoutMs) ? Math.min(10_000, Math.max(500, Math.trunc(timeoutMs))) : 3_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  onProgress?.({ text: 'Đang lấy IP Public từ ifconfig.me...' })
  try {
    const response = await fetch(publicIPEndpoint, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      signal: controller.signal,
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
    if (controller.signal.aborted) throw new Error('ifconfig.me hết thời gian chờ')
    throw error
  } finally {
    clearTimeout(timer)
  }
}
