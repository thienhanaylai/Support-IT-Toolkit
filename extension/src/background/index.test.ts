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

  it('opens Browser-only onboarding only on first install, not on extension updates', async () => {
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

  it('removes the retired ipify host permission', async () => {
    const remove = vi.fn(async () => true)
    vi.stubGlobal('chrome', {
      runtime: { onInstalled: { addListener: vi.fn() }, onMessage: { addListener: vi.fn() } },
      permissions: { remove },
      contextMenus: { onClicked: { addListener: vi.fn() } },
    })
    await import('./index')
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith({ origins: ['https://api.ipify.org/*'] }))
  })

  it('removes API keys left by retired MXToolbox and WHOIS tools', async () => {
    const set = vi.fn(async () => {})
    vi.stubGlobal('chrome', {
      runtime: { onInstalled: { addListener: vi.fn() }, onMessage: { addListener: vi.fn() } },
      contextMenus: { onClicked: { addListener: vi.fn() } },
      storage: { local: {
        get: vi.fn(async () => ({
          settings: { timeoutMs: 2500, saveHistory: true, mxtoolboxApiKey: 'retired', bknsApiKey: 'retired' },
        })),
        set,
      } },
    })
    await import('./index')
    await vi.waitFor(() => expect(set).toHaveBeenCalledWith({
      settings: { timeoutMs: 2500, saveHistory: true },
    }))
  })

  it('opens the QR region picker on the active tab', async () => {
    type Listener = (
      message: { type?: string },
      sender: { tab?: { id?: number; url?: string } },
      respond: (value: unknown) => void,
    ) => boolean | void
    const listeners: Listener[] = []
    const set = vi.fn(async () => {})
    const executeScript = vi.fn(async () => [{ result: undefined }])
    vi.stubGlobal('crypto', { randomUUID: () => 'qr-token' })
    vi.stubGlobal('chrome', {
      runtime: {
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: (listener: Listener) => listeners.push(listener) },
      },
      contextMenus: { create: vi.fn(), onClicked: { addListener: vi.fn() } },
      sidePanel: { setPanelBehavior: vi.fn(async () => {}) },
      storage: {
        session: { set, remove: vi.fn(async () => {}) },
        local: { get: vi.fn(async () => ({})) },
      },
      tabs: { query: vi.fn(async () => [{ id: 21, windowId: 7, url: 'https://example.com/qr' }]) },
      scripting: { executeScript },
    })
    await import('./index')
    const respond = vi.fn()
    expect(listeners.at(-1)!({ type: 'toolkit:start-auth-qr-region' }, {}, respond)).toBe(true)
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ started: true }))
    expect(set).toHaveBeenCalledWith({
      authenticatorQRPicker: expect.objectContaining({
        token: 'qr-token', tabId: 21, windowId: 7,
      }),
    })
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 21 },
      func: expect.any(Function),
      args: ['qr-token'],
    })
  })

  it('routes Portal page buttons through the service worker with the sender tab', async () => {
    const listeners: Array<(message: { type?: string }, sender: { tab?: { id?: number; url?: string } }, respond: (value: unknown) => void) => boolean | void> = []
    const config = {
      cpu: 2, ramGB: 4, internetMbps: 200, diskGB: 50, diskType: 'NVME_STORAGE',
      os: 'Windows Server 2022 Standard (64-bit)', osId: '118498',
      siteProvider: 'HCM', siteProviderId: '106066',
      ownerName: 'Chu Xuân Hà', serviceCode: '20.2985.9322',
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
      storage: {
        session: { get: vi.fn(async () => ({ portalVmConfig: config })), set },
        local: { get: vi.fn(async () => ({})) },
      },
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
    await vi.waitFor(() => expect(copied).toHaveBeenCalledWith({
      config, vmName: 'chuxuanha-20.2985.9322',
    }))
    expect(set).toHaveBeenCalledWith({ portalVmConfig: config })
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 9 } }))

    const fetched = vi.fn()
    expect(portalListener({ type: 'toolkit:get-vm-config' }, {}, fetched)).toBe(true)
    await vi.waitFor(() => expect(fetched).toHaveBeenCalledWith({
      config, vmName: 'chuxuanha-20.2985.9322',
    }))

    const pasted = vi.fn()
    expect(portalListener(
      { type: 'toolkit:paste-vm-config' },
      { tab: { id: 10, url: 'https://portal.longvan.vn/computing-manager/manager/computing/computing_create.xhtml?id=1' } },
      pasted,
    )).toBe(true)
    await vi.waitFor(() => expect(pasted).toHaveBeenCalledWith({ applied: ['CPU', 'RAM', 'Internet', 'Disk'] }))
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 10 }, world: 'MAIN', args: [config] }))
  })

  it('generates a Portal password from saved options and keeps it in session history', async () => {
    type Listener = (
      message: { type?: string; options?: unknown },
      sender: { tab?: { id?: number; url?: string } },
      respond: (value: unknown) => void,
    ) => boolean | void
    const listeners: Listener[] = []
    const set = vi.fn(async () => {})
    const setLocal = vi.fn(async () => {})
    vi.stubGlobal('chrome', {
      runtime: {
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: (listener: Listener) => listeners.push(listener) },
      },
      contextMenus: { create: vi.fn(), onClicked: { addListener: vi.fn() } },
      storage: {
        local: {
          get: vi.fn(async () => ({ passwordGeneratorOptions: {
            length: 12, specialCount: 3, numbers: true, lowercase: false, uppercase: false, special: false,
            excludeEnabled: true, excludeChars: '012345678',
          } })),
          set: setLocal,
        },
        session: {
          get: vi.fn(async () => ({ passwordGeneratorRecent: ['old-password'] })),
          set,
        },
      },
    })
    await import('./index')
    const respond = vi.fn()
    const listener = listeners.at(-1)!
    expect(listener(
      { type: 'toolkit:generate-password' },
      { tab: { id: 12, url: 'https://portal.longvan.vn/computing-manager/manager/computing/computing_create.xhtml' } },
      respond,
    )).toBe(true)
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({
      password: '999999999999',
      options: {
        length: 12, specialCount: 3, numbers: true, lowercase: false, uppercase: false, special: false,
        excludeEnabled: true, excludeChars: '012345678',
      },
    }))
    expect(setLocal).toHaveBeenCalledWith({
      passwordGeneratorOptions: {
        length: 12, specialCount: 3, numbers: true, lowercase: false, uppercase: false, special: false,
        excludeEnabled: true, excludeChars: '012345678',
      },
    })
    expect(set).toHaveBeenCalledWith({
      passwordGeneratorRecent: ['999999999999', 'old-password'],
    })

    const denied = vi.fn()
    expect(listener(
      { type: 'toolkit:generate-password' },
      { tab: { id: 13, url: 'https://portal.longvan.vn/cloud-service-manager/manager/cloud-service-detail.xhtml' } },
      denied,
    )).toBe(false)
    expect(denied).toHaveBeenCalledWith({ error: 'Chỉ có thể tạo nhanh mật khẩu tại trang Tạo computing.' })
  })
})
