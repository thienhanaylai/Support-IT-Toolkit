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
      url: 'chrome-extension://test/popup.html', type: 'popup', width: 680, height: 720,
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
})
