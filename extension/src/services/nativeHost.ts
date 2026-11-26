export const HOST_NAME = 'com.itsupport.toolkit'

export type NativeAction = 'ping' | 'traceroute' | 'tcp_check' | 'port_scan' | 'dns_lookup' | 'tls_check' | 'local_interfaces' | 'public_ip'
export type NativeProgress = { text: string; completed?: number; total?: number }

export async function nativeRequest(action: NativeAction, params: Record<string, unknown> = {}, onProgress?: (event: NativeProgress) => void): Promise<Record<string, unknown>> {
  try {
    const result = onProgress
      ? await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
        const port = chrome.runtime.connectNative(HOST_NAME)
        let settled = false
        const cleanup = () => {
          port.onMessage.removeListener(onMessage)
          port.onDisconnect.removeListener(onDisconnect)
          port.disconnect()
        }
        const finish = (value?: Record<string, unknown>, error?: Error) => {
          if (settled) return
          settled = true
          cleanup()
          if (error) reject(error)
          else resolve(value)
        }
        const onMessage = (message: Record<string, unknown>) => {
          if (message?.type === 'progress') {
            if (typeof message.text === 'string') {
              try {
                onProgress({
                  text: message.text,
                  completed: typeof message.completed === 'number' ? message.completed : undefined,
                  total: typeof message.total === 'number' ? message.total : undefined,
                })
              } catch (error) {
                finish(undefined, error instanceof Error ? error : new Error(String(error)))
              }
            }
          } else finish(message)
        }
        const onDisconnect = () => finish(undefined, new Error(chrome.runtime.lastError?.message || 'Kết nối Local Agent bị ngắt trước khi có kết quả'))
        port.onMessage.addListener(onMessage)
        port.onDisconnect.addListener(onDisconnect)
        try { port.postMessage({ action, ...params, stream: true }) }
        catch (error) { finish(undefined, error instanceof Error ? error : new Error(String(error))) }
      })
      : await chrome.runtime.sendNativeMessage(HOST_NAME, { action, ...params }) as Record<string, unknown> | undefined
    const unsupportedAction = /action không được hỗ trợ/i.test(String(result?.error))
    const unsupportedDNSAuto = action === 'dns_lookup' && /recordType.*không được hỗ trợ/i.test(String(result?.error))
    if (result?.success === false && ((['port_scan', 'public_ip', 'dns_lookup'].includes(action) && unsupportedAction) || unsupportedDNSAuto)) {
      const feature = action === 'port_scan' ? 'Quét Port' : action === 'dns_lookup' ? 'DNS Check' : 'IP Public qua curl ifconfig.me'
      throw new Error(`Local Agent đã cũ, chưa hỗ trợ ${feature}. Chạy lại bộ cài Agent với Extension ID hiện tại để cập nhật.`)
    }
    if (!result || result.success === false) throw new Error(String(result?.error || 'Agent trả về lỗi'))
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/native host|not found|disconnected|specified native/i.test(message)) {
      throw new Error('Không tìm thấy Local Agent. Hãy cài Agent, đăng ký Extension ID rồi thử lại.')
    }
    throw error
  }
}
