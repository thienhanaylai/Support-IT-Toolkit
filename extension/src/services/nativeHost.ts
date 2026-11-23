export const HOST_NAME = 'com.itsupport.toolkit'

export type NativeAction = 'ping' | 'traceroute' | 'tcp_check' | 'port_scan' | 'tls_check' | 'local_interfaces'

export async function nativeRequest(action: NativeAction, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  try {
    const result = await chrome.runtime.sendNativeMessage(HOST_NAME, { action, ...params }) as Record<string, unknown> | undefined
    if (action === 'port_scan' && result?.success === false && /action không được hỗ trợ/i.test(String(result.error))) {
      throw new Error('Local Agent đã cũ, chưa hỗ trợ Quét Port. Chạy lại packaging/install.ps1 với Extension ID hiện tại để cập nhật Agent.')
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
