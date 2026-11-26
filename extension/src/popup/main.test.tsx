// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { draftKey, jobKey } from '../services/work'
import { portalVmConfigKey } from '../services/portalVmConfig'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); document.body.innerHTML = '' })

async function showTools() {
  await vi.waitFor(() => expect([...document.querySelectorAll<HTMLButtonElement>('.popup-tabs button')]
    .find((button) => button.textContent?.includes('Công cụ'))).toBeDefined())
  const toolsTab = [...document.querySelectorAll<HTMLButtonElement>('.popup-tabs button')]
    .find((button) => button.textContent?.includes('Công cụ'))!
  toolsTab.click()
  await vi.waitFor(() => expect(document.querySelector('.main-content')).not.toBeNull())
}

it('restores the form and live progress after the popup is reopened, then shows the completed result', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  const scrollIntoView = vi.fn()
  Element.prototype.scrollIntoView = scrollIntoView
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
  await showTools()
  await vi.waitFor(() => expect((document.querySelector('#target') as HTMLInputElement)?.value).toBe('example.com'))
  const domainTools = document.querySelector('.domain-tool-section')!
  const vmTools = document.querySelector('.vm-tool-section')!
  const networkTools = document.querySelector('.network-info-section')!
  expect(domainTools.contains(document.querySelector('#target'))).toBe(true)
  expect(domainTools.textContent).not.toContain('DOMAIN HOẶC ĐỊA CHỈ IP')
  expect(document.querySelector('#target')?.getAttribute('aria-label')).toBe('Domain hoặc địa chỉ IP')
  expect(vmTools.textContent).toContain('THÔNG TIN VM')
  expect(vmTools.textContent).toContain('Thông tin VM')
  expect(vmTools.textContent).not.toContain('Mạng LAN')
  expect(vmTools.textContent).not.toContain('IP Public')
  expect(networkTools.textContent).toContain('THÔNG TIN MẠNG')
  expect(networkTools.textContent).toContain('Mạng LAN')
  expect(networkTools.textContent).toContain('IP Public')
  expect(networkTools.textContent).not.toContain('Thông tin VM')
  expect(domainTools.compareDocumentPosition(vmTools) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(vmTools.compareDocumentPosition(networkTools) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(document.body.textContent).toContain('Reply 1/4')
  expect(document.body.textContent).toContain('Đang kiểm tra Ping')
  expect(domainTools.querySelector('.checking')?.textContent).toContain('Đang kiểm tra Ping')
  expect(vmTools.querySelector('.checking')).toBeNull()
  expect(networkTools.querySelector('.checking')).toBeNull()
  expect(scrollIntoView).not.toHaveBeenCalled()

  const record = {
    id: 'record-1', at: new Date().toISOString(), tool: 'Ping', target: 'example.com',
    source: 'Local Agent', status: 'ok', result: { raw: 'Reply from example.com' },
  }
  onChanged?.({ [jobKey]: { newValue: { ...running, status: 'done', record } } }, 'session')
  await vi.waitFor(() => expect(document.body.textContent).toContain('Reply from example.com'))
  expect(domainTools.querySelector('.result')?.textContent).toContain('Reply from example.com')
  expect(scrollIntoView).not.toHaveBeenCalled()
})

it('scrolls to the result when the user starts a check, not when the popup reopens', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  const scrollIntoView = vi.fn()
  Element.prototype.scrollIntoView = scrollIntoView
  const draft = {
    input: 'example.com', port: 443, pingCount: 4, maxHops: 20,
    scanMode: 'common', customPorts: '22,80,443', mxCommand: 'dns', tool: 'ping',
  }
  const sendMessage = vi.fn(async (message: { type: string }) =>
    message.type === 'toolkit:get-job'
      ? {}
      : { job: { id: 'new', tool: 'ping', status: 'running', progress: [] } })
  vi.stubGlobal('chrome', {
    runtime: { sendMessage },
    tabs: { query: vi.fn(async () => []) },
    storage: {
      session: {
        get: vi.fn(async () => ({ [draftKey]: draft })),
        set: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
      },
      local: { get: vi.fn(async () => ({ history: [] })) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  })
  await import('./main')
  await showTools()
  const check = await vi.waitFor(() => {
    const button = document.querySelector<HTMLButtonElement>('.inline-check')
    expect(button).not.toBeNull()
    return button!
  })
  expect(scrollIntoView).not.toHaveBeenCalled()

  check.click()

  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'toolkit:start-job' })))
  await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
})

it('shows DNS Check with record type and a custom DNS server', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  Element.prototype.scrollIntoView = vi.fn()
  const draft = {
    input: 'example.com', port: 443, pingCount: 4, maxHops: 20,
    scanMode: 'common', customPorts: '22,80,443', mxCommand: 'dns',
    dnsRecordType: 'AAAA', dnsServer: '1.1.1.1', tool: 'dns_lookup',
  }
  const sendMessage = vi.fn(async (message: { type: string }) =>
    message.type === 'toolkit:get-job' ? {} :
      { job: { id: 'dns-job', tool: 'dns_lookup', status: 'running', progress: [] } })
  vi.stubGlobal('chrome', {
    runtime: { sendMessage },
    tabs: { query: vi.fn(async () => []) },
    storage: {
      session: { get: vi.fn(async () => ({ [draftKey]: draft })), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
      local: { get: vi.fn(async () => ({ history: [] })) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  })
  await import('./main')
  await showTools()
  expect(document.querySelector('.domain-tool-section')?.textContent).toContain('DNS Check')
  expect((document.querySelector('#dns-record-type') as HTMLSelectElement).value).toBe('AAAA')
  expect((document.querySelector('#dns-server') as HTMLInputElement).value).toBe('1.1.1.1')
  document.querySelector<HTMLButtonElement>('.inline-check')!.click()
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
    type: 'toolkit:start-job',
    request: expect.objectContaining({
      tool: 'dns_lookup', input: 'example.com', dnsRecordType: 'AAAA', dnsServer: '1.1.1.1',
    }),
  })))
})

it('offers copy only on the Service tab and includes OS and Site Provider for review', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  const config = {
    cpu: 2, ramGB: 4, internetMbps: 200, diskGB: 50, diskType: 'NVME_STORAGE',
    os: 'Windows Server 2022 Standard (64-bit)', osId: '118498',
    siteProvider: 'HCM', siteProviderId: '106066',
    ownerName: 'Chu Xuân Hà', serviceCode: '20.2985.9322',
  }
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
  await showTools()
  await vi.waitFor(() => expect(document.querySelector('.vm-transfer button')).not.toBeNull())
  document.querySelector<HTMLButtonElement>('.vm-transfer button')!.click()
  await vi.waitFor(() => expect(set).toHaveBeenCalledWith({ [portalVmConfigKey]: config }))
  expect(document.querySelector('.vm-transfer')?.textContent).toContain('Đã sao chép cấu hình')
  expect(document.querySelector('.vm-transfer')?.textContent).toContain('Windows Server 2022 Standard')
  expect(document.querySelector('.vm-transfer')?.textContent).toContain('HCM')
  expect(document.querySelector('.vm-transfer')?.textContent).toContain('chuxuanha-20.2985.9322')
  expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 4 } }))
})

it('does not show the popup transfer section on the Create computing tab', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  const config = {
    cpu: 2, ramGB: 4, internetMbps: 200, diskGB: 50, diskType: 'NVME_STORAGE',
    os: 'Windows Server 2022 Standard (64-bit)', osId: '118498',
    siteProvider: 'HCM', siteProviderId: '106066',
    ownerName: 'Chu Xuân Hà', serviceCode: '20.2985.9322',
  }
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
  await showTools()
  await vi.waitFor(() => expect(document.querySelector('.popup-header')).not.toBeNull())
  expect(document.querySelector('.vm-transfer')).toBeNull()
  expect(executeScript).not.toHaveBeenCalled()
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
  await showTools()
  const retry = await vi.waitFor(() => {
    const button = document.querySelector<HTMLButtonElement>('.retry-vm')
    expect(button).not.toBeNull()
    return button!
  })
  expect(retry.textContent).toContain('Thử lại')
  expect(document.querySelector('.vm-tool-section')?.contains(retry.closest('.error'))).toBe(true)
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
  await showTools()
  await vi.waitFor(() => expect(document.querySelector('.error')?.textContent).toContain('Ping thất bại'))
  expect(document.querySelector('.retry-vm')).toBeNull()
})

it('opens a recent result inside the matching tool group', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  Element.prototype.scrollIntoView = vi.fn()
  const record = {
    id: 'network-record', at: new Date().toISOString(), tool: 'Mạng LAN', target: 'Máy này',
    source: 'Local Agent', status: 'ok' as const, result: { raw: 'Ethernet 192.168.1.2' },
  }
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: vi.fn(async () => ({})) },
    tabs: { query: vi.fn(async () => []) },
    storage: {
      session: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
      local: { get: vi.fn(async (key: string) => key === 'history' ? { history: [record] } : {}) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  })
  await import('./main')
  await showTools()
  const recent = await vi.waitFor(() => {
    const button = document.querySelector<HTMLButtonElement>('.recent')
    expect(button).not.toBeNull()
    return button!
  })
  recent.click()
  await vi.waitFor(() => expect(document.querySelector('.network-info-section .result')?.textContent).toContain('Ethernet 192.168.1.2'))
  expect(document.querySelector('.domain-tool-section .result')).toBeNull()
  expect(document.querySelector('.vm-tool-section .result')).toBeNull()
})

it('switches between the Tools and Authenticator feature tabs', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: vi.fn(async () => ({})) },
    tabs: { query: vi.fn(async () => []) },
    storage: {
      session: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
      local: { get: vi.fn(async (key: string) => key === 'history' ? { history: [] } : {}) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  })
  await import('./main')
  await vi.waitFor(() => expect([...document.querySelectorAll<HTMLButtonElement>('.popup-tabs button')]
    .find((button) => button.textContent?.includes('Auth'))).toBeDefined())
  const authTab = [...document.querySelectorAll<HTMLButtonElement>('.popup-tabs button')]
    .find((button) => button.textContent?.includes('Auth'))!
  expect(document.querySelector<HTMLButtonElement>('.popup-tabs button')?.textContent).toContain('Auth')
  await vi.waitFor(() => expect(document.querySelector('.auth-content')).not.toBeNull())
  expect(authTab.getAttribute('aria-selected')).toBe('true')
  expect(document.querySelector('.main-content')).toBeNull()

  const toolsTab = [...document.querySelectorAll<HTMLButtonElement>('.popup-tabs button')]
    .find((button) => button.textContent?.includes('Công cụ'))!
  toolsTab.click()
  await vi.waitFor(() => expect(document.querySelector('.main-content')).not.toBeNull())
  expect(document.querySelector('.auth-content')).toBeNull()

  const passwordTab = [...document.querySelectorAll<HTMLButtonElement>('.popup-tabs button')]
    .find((button) => button.textContent?.includes('Mật khẩu'))!
  passwordTab.click()
  await vi.waitFor(() => expect(document.querySelector('.password-tab-content .password-generator')).not.toBeNull())
  expect(document.querySelector('.main-content')).toBeNull()
  expect(document.querySelector('.auth-content')).toBeNull()
  expect(document.querySelectorAll('.popup-tabs button')[1]?.textContent).toContain('Mật khẩu')
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
  await showTools()
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

it('shows HTTP Ping and DoH as independent browser tools with their own options', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  Element.prototype.scrollIntoView = vi.fn()
  const draft = {
    input: 'https://example.com/path', port: 443, pingCount: 3, maxHops: 20,
    scanMode: 'common', customPorts: '22,80,443', mxCommand: 'dns',
    dnsRecordType: 'AUTO', dnsServer: '', httpMethod: 'GET',
    dohRecordType: 'CAA', dohResolver: 'quad9', tool: 'http_ping',
  }
  const sendMessage = vi.fn(async (message: { type: string }) =>
    message.type === 'toolkit:get-job' ? {} :
      { job: { id: 'browser-job', tool: 'http_ping', status: 'running', progress: [] } })
  const contains = vi.fn(async () => false)
  const request = vi.fn(async () => true)
  vi.stubGlobal('chrome', {
    runtime: { sendMessage },
    tabs: { query: vi.fn(async () => []) },
    permissions: { contains, request },
    storage: {
      session: {
        get: vi.fn(async (key: string | string[]) => Array.isArray(key) ? { [draftKey]: draft } : {}),
        set: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
      },
      local: { get: vi.fn(async (key: string) => key === 'history' ? { history: [] } : {}) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  })
  await import('./main')
  await showTools()

  expect(document.querySelector<HTMLInputElement>('#target')?.placeholder).toBe('https://example.com/')
  expect(document.querySelector<HTMLSelectElement>('#http-method')?.value).toBe('GET')
  expect(document.querySelector<HTMLInputElement>('#http-count')?.value).toBe('3')
  document.querySelector<HTMLButtonElement>('.inline-check')!.click()
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith({ origins: ['https://example.com/*'] }))
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
    type: 'toolkit:start-job',
    request: expect.objectContaining({
      tool: 'http_ping', input: 'https://example.com/path', pingCount: 3, httpMethod: 'GET',
    }),
  })))

  // Finish the mocked job so the UI permits selecting another tool.
  const changed = (chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
  changed?.({
    [jobKey]: { newValue: { id: 'browser-job', tool: 'http_ping', status: 'done', progress: [] } },
  }, 'session')
  await vi.waitFor(() => expect([...document.querySelectorAll<HTMLButtonElement>('.tool')]
    .find((button) => button.textContent?.includes('DNS over HTTPS'))?.disabled).toBe(false))
  const doh = [...document.querySelectorAll<HTMLButtonElement>('.tool')]
    .find((button) => button.textContent?.includes('DNS over HTTPS'))!
  doh.click()
  await vi.waitFor(() => expect(document.querySelector('#doh-record-type')).not.toBeNull())
  expect(document.querySelector<HTMLSelectElement>('#doh-record-type')?.value).toBe('CAA')
  expect(document.querySelector<HTMLSelectElement>('#doh-resolver')?.value).toBe('quad9')
  expect(document.querySelector('.domain-tool-section')?.textContent).toContain('không đại diện DNS hệ điều hành')
})
