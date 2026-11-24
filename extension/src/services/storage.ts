export type CheckRecord = {
  id: string
  at: string
  tool: string
  target: string
  source: string
  status: 'ok' | 'warn' | 'error'
  result: Record<string, unknown>
}
export type Settings = { timeoutMs: number; saveHistory: boolean; mxtoolboxApiKey: string; bknsApiKey: string }
export const defaultSettings: Settings = { timeoutMs: 3000, saveHistory: true, mxtoolboxApiKey: '', bknsApiKey: '' }

const sensitiveField = /(?:api[-_]?key|authorization|password|passwd|secret|access[-_]?token|refresh[-_]?token|session[-_]?token)/i

export function redactSensitive(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item, seen))
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return '[Đã lược bỏ dữ liệu lặp]'
  seen.add(value)
  const clean: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    clean[key] = sensitiveField.test(key) ? '[ĐÃ ẨN]' : redactSensitive(item, seen)
  }
  return clean
}

export async function getSettings(): Promise<Settings> {
  const data = await chrome.storage.local.get('settings')
  const saved = data.settings as Partial<Settings> | undefined
  return {
    timeoutMs: saved?.timeoutMs ?? defaultSettings.timeoutMs,
    saveHistory: saved?.saveHistory ?? defaultSettings.saveHistory,
    mxtoolboxApiKey: saved?.mxtoolboxApiKey ?? defaultSettings.mxtoolboxApiKey,
    bknsApiKey: saved?.bknsApiKey ?? defaultSettings.bknsApiKey,
  }
}

export async function getHistory(): Promise<CheckRecord[]> {
  const data = await chrome.storage.local.get('history')
  const history = (data.history as CheckRecord[]) || []
  return history.map((record) => ({ ...record, result: redactSensitive(record.result) as Record<string, unknown> }))
}

export async function saveRecord(record: CheckRecord): Promise<void> {
  const settings = await getSettings()
  if (!settings.saveHistory) return
  const history = await getHistory()
  const safeRecord = { ...record, result: redactSensitive(record.result) as Record<string, unknown> }
  await chrome.storage.local.set({ history: [safeRecord, ...history].slice(0, 50) })
}
