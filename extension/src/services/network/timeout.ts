export type TimeoutScope = {
  signal: AbortSignal
  cleanup: () => void
  timedOut: () => boolean
}

export function clampTimeout(value: number, fallback = 3000): number {
  return Number.isFinite(value) ? Math.min(10_000, Math.max(500, Math.round(value))) : fallback
}

export function withTimeout(timeoutMs: number, external?: AbortSignal): TimeoutScope {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, clampTimeout(timeoutMs))
  const onAbort = () => controller.abort()
  if (external) {
    if (external.aborted) controller.abort()
    else external.addEventListener('abort', onAbort, { once: true })
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onAbort)
    },
  }
}

export function abortError(scope: TimeoutScope, external: AbortSignal | undefined, label: string): Error | null {
  if (scope.timedOut()) return new Error(`${label} hết thời gian chờ`)
  if (external?.aborted) return new Error('Đã hủy kiểm tra.')
  return null
}
