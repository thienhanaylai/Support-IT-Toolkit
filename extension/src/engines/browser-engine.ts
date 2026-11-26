import { fetchPublicIP } from '../services/network/public-ip'
import type { NativeProgress } from '../services/nativeHost'

export type BrowserAction = 'public_ip'

export async function runBrowserTool(
  action: BrowserAction,
  params: Record<string, unknown> = {},
  onProgress?: (event: NativeProgress) => void,
): Promise<Record<string, unknown>> {
  switch (action) {
    case 'public_ip':
      return fetchPublicIP(Number(params.timeoutMs), onProgress)
  }
}
