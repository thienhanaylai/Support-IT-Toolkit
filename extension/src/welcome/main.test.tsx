// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { agentInstallerURL, agentZipURL } from '../services/agentDownload'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); document.body.innerHTML = '' })

it('shows the standalone CMD, ZIP fallback and the installed Extension ID', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  vi.stubGlobal('chrome', { runtime: { id: 'abcdefghijklmnopabcdefghijklmnop' } })
  await import('./main')
  await vi.waitFor(() => expect(document.querySelector('#extension-id')).not.toBeNull())
  expect((document.querySelector('#extension-id') as HTMLInputElement).value).toBe(chrome.runtime.id)
  expect(document.querySelector(`a[href="${agentInstallerURL}"]`)).not.toBeNull()
  expect(document.querySelector(`a[href="${agentZipURL}"]`)).not.toBeNull()
  expect(document.body.textContent).toContain('cần Local Agent')
})

it('keeps both Agent download links in Settings for later use', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  vi.stubGlobal('chrome', {
    runtime: { id: 'abcdefghijklmnopabcdefghijklmnop', getManifest: () => ({ version: '0.1.3' }) },
    storage: { local: { get: vi.fn(async () => ({})) } },
  })
  await import('../options/main')
  await vi.waitFor(() => expect(document.querySelector('#current-extension-id')).not.toBeNull())
  expect((document.querySelector('#current-extension-id') as HTMLInputElement).value).toBe(chrome.runtime.id)
  expect(document.querySelector(`a[href="${agentInstallerURL}"]`)).not.toBeNull()
  expect(document.querySelector(`a[href="${agentZipURL}"]`)).not.toBeNull()
})
