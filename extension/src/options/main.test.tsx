// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CheckRecord } from '../services/storage'
import { tagElementsStorageKey } from '../services/tagElements'

const records: CheckRecord[] = [
  { id: 'one', at: '2026-11-24T12:00:00Z', tool: 'Ping', target: 'example.com', source: 'Local Agent', status: 'ok', result: { message: 'pong' } },
  { id: 'two', at: '2026-11-23T12:00:00Z', tool: 'TCP Port', target: 'test.net:443', source: 'Local Agent', status: 'warn', result: { message: 'timeout' } },
]

async function openSettings(initialHistory = records) {
  document.body.innerHTML = '<div id="root"></div>'
  let onChanged: ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void) | undefined
  const get = vi.fn(async (key: string) => key === 'history' ? { history: initialHistory } : { settings: { timeoutMs: 3200, saveHistory: true } })
  const set = vi.fn(async () => {})
  const remove = vi.fn(async () => {})
  let portalAllowed = false
  const permissionRequest = vi.fn(async () => { portalAllowed = true; return true })
  const permissionRemove = vi.fn(async () => { portalAllowed = false; return true })
  vi.stubGlobal('chrome', {
    runtime: { id: 'abcdefghijklmnopabcdefghijklmnop', getManifest: () => ({ version: '0.2.1' }) },
    storage: { local: { get, set, remove }, onChanged: {
      addListener: (listener: typeof onChanged) => { onChanged = listener },
      removeListener: vi.fn(),
    } },
    permissions: {
      contains: vi.fn(async () => portalAllowed),
      request: permissionRequest,
      remove: permissionRemove,
    },
  })
  await import('./main')
  await vi.waitFor(() => expect(document.querySelector('.options-history-list .recent')).not.toBeNull())
  return { get, set, remove, permissionRequest, permissionRemove,
    changed: (history: CheckRecord[]) => onChanged?.({ history: { newValue: history } as chrome.storage.StorageChange }, 'local') }
}

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); document.body.innerHTML = '' })

describe('Settings history', () => {
  it('can grant and revoke Portal access from Settings', async () => {
    const { permissionRequest, permissionRemove } = await openSettings()
    const toggle = document.querySelector<HTMLInputElement>('#portal-access-toggle')!
    await vi.waitFor(() => expect(toggle.disabled).toBe(false))
    toggle.click()
    await vi.waitFor(() => expect(permissionRequest).toHaveBeenCalledWith({ origins: ['https://portal.longvan.vn/*'] }))
    await vi.waitFor(() => expect(toggle.checked).toBe(true))
    toggle.click()
    await vi.waitFor(() => expect(permissionRemove).toHaveBeenCalledWith({ origins: ['https://portal.longvan.vn/*'] }))
    await vi.waitFor(() => expect(toggle.checked).toBe(false))
  })

  it('does not expose retired Agent installation controls', async () => {
    await openSettings()
    expect(document.querySelector('#current-extension-id')).toBeNull()
    expect(document.querySelector('a[href="#agent"]')).toBeNull()
    expect(document.body.textContent).not.toContain('Local Agent cho Windows')
    expect(document.body.textContent).not.toContain('MXToolbox API key')
  })

  it('offers Authenticator export from Settings with a secret warning', async () => {
    await openSettings()
    const section = document.querySelector('#authenticator-backup')
    expect(section?.textContent).toContain('Export Auth')
    expect(section?.textContent).toContain('secret TOTP dạng đọc được')
    expect(document.querySelector('a[href="#authenticator-backup"]')).not.toBeNull()
  })

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

  it('imports, adds, edits, removes, and saves Tag Element groups and members', async () => {
    const { set } = await openSettings()
    const section = document.querySelector('#tag-elements')!
    expect(document.querySelector('a[href="#tag-elements"]')).not.toBeNull()
    const textarea = section.querySelector<HTMLTextAreaElement>('#tag-import-text')!
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      textarea,
      'Vmware\n(Lê Ngọc Vương)[@10.19530321:team.longvan.vn]',
    )
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    const recognize = [...section.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Nhận diện danh sách'))!
    recognize.click()
    await vi.waitFor(() => expect(section.querySelectorAll('.tag-group-editor')).toHaveLength(1))
    expect(section.textContent).toContain('Lê Ngọc Vương')

    section.querySelector<HTMLButtonElement>('.tag-add-member')!.click()
    await vi.waitFor(() => expect(section.querySelectorAll('.tag-member-editor')).toHaveLength(2))
    section.querySelectorAll<HTMLButtonElement>('.tag-delete-member')[1].click()
    await vi.waitFor(() => expect(section.querySelectorAll('.tag-member-editor')).toHaveLength(1))

    section.querySelector<HTMLButtonElement>('.tag-add-group')!.click()
    await vi.waitFor(() => expect(section.querySelectorAll('.tag-group-editor')).toHaveLength(2))
    section.querySelectorAll<HTMLButtonElement>('.tag-group-editor-heading .tag-delete')[1].click()
    await vi.waitFor(() => expect(section.querySelectorAll('.tag-group-editor')).toHaveLength(1))

    const groupName = section.querySelector<HTMLInputElement>('[aria-label="Tên lĩnh vực 1"]')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(groupName, 'VMware')
    groupName.dispatchEvent(new Event('input', { bubbles: true }))
    section.querySelector<HTMLButtonElement>('.tag-editor-actions .primary')!.click()
    await vi.waitFor(() => expect(set).toHaveBeenCalledWith({
      [tagElementsStorageKey]: [expect.objectContaining({
        name: 'VMware',
        members: [expect.objectContaining({
          name: 'Lê Ngọc Vương',
          elementId: '@10.19530321:team.longvan.vn',
        })],
      })],
    }))
    await vi.waitFor(() => expect(section.textContent).toContain('Đã lưu Tag Element'))
  })
})
