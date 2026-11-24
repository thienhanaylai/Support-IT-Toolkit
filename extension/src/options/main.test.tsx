// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CheckRecord } from '../services/storage'

const records: CheckRecord[] = [
  { id: 'one', at: '2026-11-24T12:00:00Z', tool: 'Ping', target: 'example.com', source: 'Local Agent', status: 'ok', result: { message: 'pong' } },
  { id: 'two', at: '2026-11-23T12:00:00Z', tool: 'TCP Port', target: 'test.net:443', source: 'Local Agent', status: 'warn', result: { message: 'timeout' } },
]

async function openSettings(initialHistory = records) {
  document.body.innerHTML = '<div id="root"></div>'
  let onChanged: ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void) | undefined
  const get = vi.fn(async (key: string) => key === 'history' ? { history: initialHistory } : { settings: { timeoutMs: 3200, saveHistory: true, mxtoolboxApiKey: '', bknsApiKey: '' } })
  const set = vi.fn(async () => {})
  const remove = vi.fn(async () => {})
  vi.stubGlobal('chrome', {
    runtime: { id: 'abcdefghijklmnopabcdefghijklmnop', getManifest: () => ({ version: '0.1.4' }) },
    storage: { local: { get, set, remove }, onChanged: {
      addListener: (listener: typeof onChanged) => { onChanged = listener },
      removeListener: vi.fn(),
    } },
  })
  await import('./main')
  await vi.waitFor(() => expect(document.querySelector('.options-history-list .recent')).not.toBeNull())
  return { get, set, remove, changed: (history: CheckRecord[]) => onChanged?.({ history: { newValue: history } as chrome.storage.StorageChange }, 'local') }
}

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); document.body.innerHTML = '' })

describe('Settings history', () => {
  it('shows saved records, filters them, and opens the selected result', async () => {
    await openSettings()
    expect(document.querySelectorAll('.options-history-list .recent')).toHaveLength(2)
    const search = document.querySelector<HTMLInputElement>('.options-search input')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'example.com')
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() => expect(document.querySelectorAll('.options-history-list .recent')).toHaveLength(1))
    expect(document.body.textContent).toContain('1 kết quả phù hợp')
    document.querySelector<HTMLButtonElement>('.options-history-list .recent')!.click()
    await vi.waitFor(() => expect(document.querySelector('.options-history-detail .result')).not.toBeNull())
    expect(document.querySelector('.options-history-detail')?.textContent).toContain('example.com')
  })

  it('asks before clearing and keeps the save-history preference independent of existing records', async () => {
    const { set, remove } = await openSettings()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const clear = [...document.querySelectorAll<HTMLButtonElement>('.options-history-tools button')].find((button) => button.textContent?.includes('Xóa tất cả'))!
    clear.click()
    expect(remove).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    clear.click()
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith('history'))
    await vi.waitFor(() => expect(document.querySelector('.options-history-list')).toBeNull())
    const toggle = document.querySelector<HTMLInputElement>('#save-history')!
    toggle.click()
    document.querySelector<HTMLButtonElement>('.options-save button')!.click()
    await vi.waitFor(() => expect(set).toHaveBeenCalledWith({ settings: expect.objectContaining({ saveHistory: false, timeoutMs: 3200 }) }))
    confirm.mockRestore()
  })

  it('updates the Settings history when another extension page changes storage', async () => {
    const { changed } = await openSettings()
    changed([records[1]])
    await vi.waitFor(() => expect(document.querySelectorAll('.options-history-list .recent')).toHaveLength(1))
    expect(document.querySelector('.options-history-list')?.textContent).toContain('test.net:443')
  })
})
