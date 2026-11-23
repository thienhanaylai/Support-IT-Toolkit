// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { draftKey, jobKey } from '../services/work'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); document.body.innerHTML = '' })

it('restores the form and live progress after the popup is reopened, then shows the completed result', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.scrollTo = vi.fn()
  const running = { id: 'job-1', tool: 'ping', status: 'running', progress: [{ text: 'Reply 1/4' }] }
  const draft = {
    input: 'example.com', port: 443, pingCount: 4, maxHops: 20,
    scanMode: 'common', customPorts: '22,80,443', mxCommand: 'dns', tool: 'ping',
  }
  let onChanged: ((changes: Record<string, unknown>, area: string) => void) | undefined
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: vi.fn(async () => ({ job: running })) },
    tabs: { query: vi.fn(async () => []) },
    storage: {
      session: {
        get: vi.fn(async () => ({ [draftKey]: draft })),
        set: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
      },
      local: { get: vi.fn(async () => ({ history: [] })) },
      onChanged: {
        addListener: (listener: typeof onChanged) => { onChanged = listener },
        removeListener: vi.fn(),
      },
    },
  })
  await import('./main')
  await vi.waitFor(() => expect((document.querySelector('#target') as HTMLInputElement)?.value).toBe('example.com'))
  expect(document.body.textContent).toContain('Reply 1/4')
  expect(document.body.textContent).toContain('Đang kiểm tra Ping')

  const record = {
    id: 'record-1', at: new Date().toISOString(), tool: 'Ping', target: 'example.com',
    source: 'Local Agent', status: 'ok', result: { raw: 'Reply from example.com' },
  }
  onChanged?.({ [jobKey]: { newValue: { ...running, status: 'done', record } } }, 'session')
  await vi.waitFor(() => expect(document.body.textContent).toContain('Reply from example.com'))
})
