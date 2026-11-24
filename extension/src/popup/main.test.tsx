// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { draftKey, jobKey } from '../services/work'
import { portalVmConfigKey } from '../services/portalVmConfig'

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

it('offers copy on the Service tab and stores only the four resource values', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  const config = { cpu: 2, ramGB: 4, internetMbps: 200, diskGB: 50, diskType: 'NVME_STORAGE' }
  const set = vi.fn(async () => {})
  const executeScript = vi.fn(async () => [{ result: config }])
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: vi.fn(async () => ({})) },
    tabs: { query: vi.fn(async () => [{ id: 4, url: 'https://portal.longvan.vn/cloud-service-manager/manager/cloud-service-detail.xhtml?id=1' }]) },
    scripting: { executeScript },
    storage: {
      session: { get: vi.fn(async () => ({})), set, remove: vi.fn(async () => {}) },
      local: { get: vi.fn(async () => ({ history: [] })) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  })
  await import('./main')
  await vi.waitFor(() => expect(document.querySelector('.vm-transfer button')).not.toBeNull())
  document.querySelector<HTMLButtonElement>('.vm-transfer button')!.click()
  await vi.waitFor(() => expect(set).toHaveBeenCalledWith({ [portalVmConfigKey]: config }))
  expect(document.querySelector('.vm-transfer')?.textContent).toContain('Đã sao chép 4 thông số')
  expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 4 } }))
})

it('offers paste on the Create computing tab, using MAIN world for PrimeFaces', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  const config = { cpu: 2, ramGB: 4, internetMbps: 200, diskGB: 50, diskType: 'NVME_STORAGE' }
  const executeScript = vi.fn(async () => [{ result: { applied: ['CPU', 'RAM', 'Internet', 'Disk'] } }])
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: vi.fn(async () => ({})) },
    tabs: { query: vi.fn(async () => [{ id: 5, url: 'https://portal.longvan.vn/computing-manager/manager/computing/computing_create.xhtml?id=2' }]) },
    scripting: { executeScript },
    storage: {
      session: { get: vi.fn(async (key: string | string[]) => typeof key === 'string' && key === portalVmConfigKey ? { [portalVmConfigKey]: config } : {}), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
      local: { get: vi.fn(async () => ({ history: [] })) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  })
  await import('./main')
  await vi.waitFor(() => expect(document.querySelector<HTMLButtonElement>('.vm-transfer button')?.disabled).toBe(false))
  document.querySelector<HTMLButtonElement>('.vm-transfer button')!.click()
  await vi.waitFor(() => expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 5 }, world: 'MAIN', args: [config] })))
  expect(document.querySelector('.vm-transfer')?.textContent).toContain('Đã điền CPU → RAM → Internet → Disk')
})

it('retries a failed VM lookup using the currently active Portal tab', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  Element.prototype.scrollIntoView = vi.fn()
  const draft = {
    input: '', port: 443, pingCount: 4, maxHops: 20,
    scanMode: 'common', customPorts: '22,80,443', mxCommand: 'dns', tool: 'vm_info',
  }
  const failed = { id: 'old', tool: 'vm_info', status: 'error', progress: [{ text: 'Đang đọc thông tin từ tab Portal...' }], error: 'Hãy mở tab chi tiết computing trên portal.longvan.vn' }
  const sendMessage = vi.fn(async (message: { type: string }) =>
    message.type === 'toolkit:get-job' ? { job: failed } :
      { job: { id: 'retry', tool: 'vm_info', status: 'running', progress: [] } })
  const query = vi.fn()
    .mockResolvedValueOnce([{ id: 3, url: 'https://example.com' }])
    .mockResolvedValue([{ id: 77, url: 'https://portal.longvan.vn/computing-manager/manager/computing/computing_detail.xhtml?id=1' }])
  vi.stubGlobal('chrome', {
    runtime: { sendMessage },
    tabs: { query },
    storage: {
      session: {
        get: vi.fn(async (key: string | string[]) => Array.isArray(key) ? { [draftKey]: draft } : {}),
        set: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
      },
      local: { get: vi.fn(async () => ({ history: [] })) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  })
  await import('./main')
  const retry = await vi.waitFor(() => {
    const button = document.querySelector<HTMLButtonElement>('.retry-vm')
    expect(button).not.toBeNull()
    return button!
  })
  expect(retry.textContent).toContain('Thử lại')
  retry.click()
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
    type: 'toolkit:start-job',
    request: expect.objectContaining({ tool: 'vm_info', tabId: 77 }),
  })))
  await vi.waitFor(() => expect(document.querySelector('.retry-vm')).toBeNull())
})

it('does not show VM retry for an unrelated failed check', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: vi.fn(async () => ({
      job: { id: 'failed-ping', tool: 'ping', status: 'error', progress: [], error: 'Ping thất bại' },
    })) },
    tabs: { query: vi.fn(async () => []) },
    storage: {
      session: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
      local: { get: vi.fn(async () => ({ history: [] })) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  })
  await import('./main')
  await vi.waitFor(() => expect(document.querySelector('.error')?.textContent).toContain('Ping thất bại'))
  expect(document.querySelector('.retry-vm')).toBeNull()
})

async function openMXPopup(domain: string, failed = false) {
  document.body.innerHTML = '<div id="root"></div>'
  Element.prototype.scrollIntoView = vi.fn()
  const draft = {
    input: domain, port: 443, pingCount: 4, maxHops: 20,
    scanMode: 'common', customPorts: '22,80,443', mxCommand: 'dns', tool: 'mxtoolbox',
  }
  const settings = { timeoutMs: 4200, saveHistory: false, mxtoolboxApiKey: '', bknsApiKey: '' }
  const get = vi.fn(async (key: string | string[]) =>
    key === 'settings' ? { settings } : key === 'history' ? { history: [] } :
      Array.isArray(key) ? { [draftKey]: draft } : {})
  const set = vi.fn(async ({ settings: next }: { settings: typeof settings }) => { Object.assign(settings, next) })
  const sendMessage = vi.fn(async (message: { type: string }) =>
    message.type === 'toolkit:get-job'
      ? failed ? { job: { id: 'old', tool: 'mxtoolbox', status: 'error', progress: [{ text: 'Đang đọc cài đặt...' }], error: 'MXToolbox yêu cầu API key' } } : {}
      : { job: { id: 'new', tool: 'mxtoolbox', status: 'running', progress: [] } })
  vi.stubGlobal('chrome', {
    runtime: { sendMessage },
    tabs: { query: vi.fn(async () => []) },
    permissions: { contains: vi.fn(async () => true) },
    storage: {
      session: { get, set: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
      local: { get, set },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  })
  await import('./main')
  await vi.waitFor(() => expect(document.querySelector('.mx-key-prompt')).not.toBeNull())
  return { set, sendMessage, settings }
}

it('offers an inline MXToolbox key form before checking an arbitrary domain', async () => {
  const { set, sendMessage } = await openMXPopup('chatgpt.com', true)
  const check = document.querySelector<HTMLButtonElement>('.inline-check')!
  expect(check.textContent).toContain('Nhập API key')
  check.click()
  await vi.waitFor(() => expect(document.querySelector('#mx-key-popup')).not.toBeNull())
  expect(sendMessage.mock.calls.map(([message]) => message.type)).toEqual(['toolkit:get-job'])
  const input = document.querySelector<HTMLInputElement>('#mx-key-popup')!
  const save = document.querySelector<HTMLButtonElement>('.mx-key-actions button[type="submit"]')!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'invalid-key')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  save.click()
  await vi.waitFor(() => expect(document.querySelector('.mx-key-error')?.textContent).toContain('UUID'))
  expect(set).not.toHaveBeenCalled()

  const key = '12345678-1234-1234-1234-123456789abc'
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, key)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  save.click()
  await vi.waitFor(() => expect(set).toHaveBeenCalledWith({ settings: {
    timeoutMs: 4200, saveHistory: false, mxtoolboxApiKey: key, bknsApiKey: '',
  } }))
  expect(document.querySelector('#mx-key-popup')).toBeNull()
  expect(document.querySelector('.inline-check')?.textContent).toContain('Kiểm tra')
  check.click()
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
    type: 'toolkit:start-job',
    request: expect.objectContaining({ tool: 'mxtoolbox', input: 'chatgpt.com' }),
  })))
  expect(JSON.stringify(sendMessage.mock.calls)).not.toContain(key)
})

it('keeps the DNS example.com demo available without an MXToolbox API key', async () => {
  const { sendMessage } = await openMXPopup('example.com')
  const check = document.querySelector<HTMLButtonElement>('.inline-check')!
  expect(check.textContent).toContain('Kiểm tra')
  check.click()
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
    type: 'toolkit:start-job', request: expect.objectContaining({ tool: 'mxtoolbox', input: 'example.com' }),
  })))
})
