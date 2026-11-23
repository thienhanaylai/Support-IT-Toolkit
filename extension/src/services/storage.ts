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
  return (data.history as CheckRecord[]) || []
}

export async function saveRecord(record: CheckRecord): Promise<void> {
  const settings = await getSettings()
  if (!settings.saveHistory) return
  const history = await getHistory()
  await chrome.storage.local.set({ history: [record, ...history].slice(0, 50) })
}
