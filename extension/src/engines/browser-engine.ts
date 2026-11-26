import type { CheckProgress } from '../services/progress'
import {
  resolveDoH, safeDoHRecordType, isDoHResolver,
} from '../services/network/dns-lookup'
import { httpPing, safeHTTPMethod } from '../services/network/http-ping'
import { fetchPublicIP } from '../services/network/public-ip'

export type BrowserAction = 'public_ip' | 'http_ping' | 'doh_lookup'

export async function runBrowserTool(
  action: BrowserAction,
  params: Record<string, unknown> = {},
  onProgress?: (event: CheckProgress) => void,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  switch (action) {
    case 'public_ip':
      return fetchPublicIP(Number(params.timeoutMs), onProgress, signal)
    case 'http_ping':
      return httpPing(
        String(params.input ?? ''),
        safeHTTPMethod(params.method),
        Number(params.count ?? 4),
        Number(params.timeoutMs),
        onProgress,
        signal,
      )
    case 'doh_lookup':
      return resolveDoH(
        String(params.input ?? ''),
        safeDoHRecordType(params.recordType),
        isDoHResolver(params.resolver) ? params.resolver : 'cloudflare',
        Number(params.timeoutMs),
        onProgress,
        signal,
      )
  }
}
