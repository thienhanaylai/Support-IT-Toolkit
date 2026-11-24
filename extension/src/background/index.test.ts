import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

describe('context menu popup', () => {
  it('opens at a width that accommodates the full extension layout', async () => {
    let onClicked: ((info: { menuItemId: string; selectionText?: string }) => void) | undefined
    const set = vi.fn(async () => {})
    const create = vi.fn(async () => ({}))
    vi.stubGlobal('chrome', {
      runtime: { onInstalled: { addListener: vi.fn() }, onMessage: { addListener: vi.fn() },
        getURL: (file: string) => `chrome-extension://test/${file}` },
      contextMenus: { onClicked: { addListener: (fn: typeof onClicked) => { onClicked = fn } } },
      storage: { session: { set } },
      windows: { create },
    })
    await import('./index')
    onClicked!({ menuItemId: 'check-selection', selectionText: ' example.com ' })
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(set).toHaveBeenCalledWith({ selectedTarget: 'example.com' })
    expect(create).toHaveBeenCalledWith({
      url: 'chrome-extension://test/popup.html', type: 'popup', width: 578, height: 720,
    })
  })

  it('opens Agent instructions only on first install, not on extension updates', async () => {
    let onInstalled: ((details: { reason: string }) => void) | undefined
    const create = vi.fn(async () => ({}))
    vi.stubGlobal('chrome', {
      runtime: {
        onInstalled: { addListener: (listener: typeof onInstalled) => { onInstalled = listener } },
        onMessage: { addListener: vi.fn() },
        getURL: (file: string) => `chrome-extension://test/${file}`,
      },
      contextMenus: { create: vi.fn(), onClicked: { addListener: vi.fn() } },
      sidePanel: { setPanelBehavior: vi.fn(async () => {}) },
      tabs: { create },
    })
    await import('./index')
    onInstalled!({ reason: 'update' })
    expect(create).not.toHaveBeenCalled()
    onInstalled!({ reason: 'install' })
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(create).toHaveBeenCalledWith({ url: 'chrome-extension://test/welcome.html' })
  })

  it('routes Portal page buttons through the service worker with the sender tab', async () => {
    const listeners: Array<(message: { type?: string }, sender: { tab?: { id?: number; url?: string } }, respond: (value: unknown) => void) => boolean | void> = []
    const config = {
      cpu: 2, ramGB: 4, internetMbps: 200, diskGB: 50, diskType: 'NVME_STORAGE',
      os: 'Windows Server 2022 Standard (64-bit)', osId: '118498',
      siteProvider: 'HCM', siteProviderId: '106066',
    }
    const executeScript = vi.fn(async (options: { world?: string }) =>
      options.world === 'MAIN' ? [{ result: { applied: ['CPU', 'RAM', 'Internet', 'Disk'] } }] : [{ result: config }])
    const set = vi.fn(async () => {})
    vi.stubGlobal('chrome', {
      runtime: {
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: (listener: typeof listeners[number]) => listeners.push(listener) },
      },
      contextMenus: { create: vi.fn(), onClicked: { addListener: vi.fn() } },
      sidePanel: { setPanelBehavior: vi.fn(async () => {}) },
      storage: { session: { get: vi.fn(async () => ({ portalVmConfig: config })), set } },
      scripting: { executeScript },
    })
    await import('./index')
    const portalListener = listeners.at(-1)!

    const copied = vi.fn()
    expect(portalListener(
      { type: 'toolkit:copy-vm-config' },
      { tab: { id: 9, url: 'https://portal.longvan.vn/cloud-service-manager/manager/cloud-service-detail.xhtml?id=1' } },
      copied,
    )).toBe(true)
    await vi.waitFor(() => expect(copied).toHaveBeenCalledWith({ config }))
    expect(set).toHaveBeenCalledWith({ portalVmConfig: config })
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 9 } }))

    const pasted = vi.fn()
    expect(portalListener(
      { type: 'toolkit:paste-vm-config' },
      { tab: { id: 10, url: 'https://portal.longvan.vn/computing-manager/manager/computing/computing_create.xhtml?id=1' } },
      pasted,
    )).toBe(true)
    await vi.waitFor(() => expect(pasted).toHaveBeenCalledWith({ applied: ['CPU', 'RAM', 'Internet', 'Disk'] }))
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 10 }, world: 'MAIN', args: [config] }))
  })
})
