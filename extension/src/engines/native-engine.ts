import { nativeRequest, type NativeAction, type NativeProgress } from '../services/nativeHost'

export async function runNativeTool(
  action: NativeAction,
  params: Record<string, unknown> = {},
  onProgress?: (event: NativeProgress) => void,
): Promise<Record<string, unknown>> {
  return nativeRequest(action, params, onProgress)
}
