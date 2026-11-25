import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

function chromeMock(allowed: boolean, registered: boolean) {
  const registerContentScripts = vi.fn(async () => {})
  const unregisterContentScripts = vi.fn(async () => {})
  const permissionsListeners: Array<() => void> = []
  return {
    registerContentScripts, unregisterContentScripts, permissionsListeners,
    chrome: {
      runtime: { onInstalled: { addListener: vi.fn() }, onMessage: { addListener: vi.fn() }, lastError: undefined },
      contextMenus: { create: vi.fn(), onClicked: { addListener: vi.fn() } },
      sidePanel: { setPanelBehavior: vi.fn(async () => {}) },
      storage: { local: { setAccessLevel: vi.fn((_value, done) => done()) }, session: {} },
      permissions: {
        contains: vi.fn(async () => allowed),
        onAdded: { addListener: (listener: () => void) => permissionsListeners.push(listener) },
        onRemoved: { addListener: (listener: () => void) => permissionsListeners.push(listener) },
      },
      scripting: {
        getRegisteredContentScripts: vi.fn(async () => registered ? [{ id: 'longvan-portal-tools' }] : []),
        registerContentScripts, unregisterContentScripts,
      },
    },
  }
}

it('registers Portal content scripts only after optional access is granted', async () => {
  const mock = chromeMock(true, false)
  vi.stubGlobal('chrome', mock.chrome)
  await import('../background/index')
  await vi.waitFor(() => expect(mock.registerContentScripts).toHaveBeenCalledWith([expect.objectContaining({
    id: 'longvan-portal-tools', js: ['portal.js'], css: ['portal.css'],
    matches: expect.arrayContaining([
      'https://portal.longvan.vn/computing-manager/manager/computing/computing_detail.xhtml*',
    ]),
  })]))
  expect(mock.unregisterContentScripts).not.toHaveBeenCalled()
})

it('unregisters Portal content scripts after optional access is revoked', async () => {
  const mock = chromeMock(false, true)
  vi.stubGlobal('chrome', mock.chrome)
  await import('../background/index')
  await vi.waitFor(() => expect(mock.unregisterContentScripts).toHaveBeenCalledWith({ ids: ['longvan-portal-tools'] }))
  expect(mock.registerContentScripts).not.toHaveBeenCalled()
})
