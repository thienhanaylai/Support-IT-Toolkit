// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { draftKey, jobKey } from '../services/work'
import { portalVmConfigKey } from '../services/portalVmConfig'
import { tagElementsStorageKey } from '../services/tagElements'

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
  const running = { id: 'job-1', tool: 'http_ping', status: 'running', progress: [{ text: '[1] HTTP 200 · 20 ms' }] }
  const draft = {
    input: 'https://example.com/', httpCount: 2, httpMethod: 'HEAD', tool: 'http_ping',
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
  await vi.waitFor(() => expect((document.querySelector('#target') as HTMLInputElement)?.value).toBe('https://example.com/'))
  const domainTools = document.querySelector('.domain-tool-section')!
  const vmTools = document.querySelector('.vm-tool-section')!
  const networkTools = document.querySelector('.network-info-section')!
  expect(domainTools.contains(document.querySelector('#target'))).toBe(true)
  expect(domainTools.textContent).not.toContain('DOMAIN HOẶC ĐỊA CHỈ IP')
  expect(document.querySelector('#target')?.getAttribute('aria-label')).toBe('URL HTTP hoặc HTTPS')
  expect(vmTools.textContent).toContain('THÔNG TIN VM')
  expect(vmTools.textContent).toContain('Thông tin VM')
  expect(vmTools.textContent).not.toContain('Mạng LAN')
  expect(vmTools.textContent).not.toContain('IP Public')
  expect(networkTools.textContent).toContain('THÔNG TIN MẠNG')
  expect(networkTools.textContent).not.toContain('Mạng LAN')
  expect(networkTools.textContent).toContain('IP Public')
  expect(networkTools.textContent).not.toContain('Thông tin VM')
  expect(domainTools.compareDocumentPosition(vmTools) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(vmTools.compareDocumentPosition(networkTools) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(document.body.textContent).toContain('[1] HTTP 200')
  expect(document.body.textContent).toContain('Đang kiểm tra HTTP Ping')
  expect(domainTools.querySelector('.checking')?.textContent).toContain('Đang kiểm tra HTTP Ping')
  expect(vmTools.querySelector('.checking')).toBeNull()
  expect(networkTools.querySelector('.checking')).toBeNull()
  expect(scrollIntoView).not.toHaveBeenCalled()

  const record = {
    id: 'record-1', at: new Date().toISOString(), tool: 'HTTP Ping', target: 'https://example.com/',
    source: 'Trình duyệt · Fetch HTTP', status: 'ok', result: { raw: '[1] HTTP 200 · 20 ms' },
  }
  onChanged?.({ [jobKey]: { newValue: { ...running, status: 'done', record } } }, 'session')
  await vi.waitFor(() => expect(document.querySelector('.domain-tool-section .result')?.textContent).toContain('[1] HTTP 200 · 20 ms'))
  expect(scrollIntoView).not.toHaveBeenCalled()
})

it('scrolls to the result when the user starts a check, not when the popup reopens', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  const scrollIntoView = vi.fn()
  Element.prototype.scrollIntoView = scrollIntoView
  const draft = {
    input: 'https://example.com/', httpCount: 2, httpMethod: 'HEAD', tool: 'http_ping',
  }
  const sendMessage = vi.fn(async (message: { type: string }) =>
    message.type === 'toolkit:get-job'
      ? {}
      : { job: { id: 'new', tool: 'http_ping', status: 'running', progress: [] } })
  vi.stubGlobal('chrome', {
    runtime: { sendMessage },
    tabs: { query: vi.fn(async () => []) },
    permissions: { contains: vi.fn(async () => true), request: vi.fn(async () => true) },
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

it('shows only browser tools and sends the selected DoH options', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  Element.prototype.scrollIntoView = vi.fn()
  const draft = {
    input: 'example.com', httpCount: 4,
    dohRecordType: 'AAAA', dohResolver: 'google', tool: 'doh_lookup',
  }
  const sendMessage = vi.fn(async (message: { type: string }) =>
    message.type === 'toolkit:get-job' ? {} :
      { job: { id: 'dns-job', tool: 'doh_lookup', status: 'running', progress: [] } })
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
  const section = document.querySelector('.domain-tool-section')!
  expect(section.textContent).toContain('DNS over HTTPS')
  expect(section.textContent).toContain('HTTP Ping')
  for (const removed of ['Ping', 'Traceroute', 'TCP Port', 'Quét Port', 'DNS Check', 'SSL / TLS']) {
    expect([...section.querySelectorAll('.tool strong')].map((item) => item.textContent)).not.toContain(removed)
  }
  expect((document.querySelector('#doh-record-type') as HTMLSelectElement).value).toBe('AAAA')
  expect((document.querySelector('#doh-resolver') as HTMLSelectElement).value).toBe('google')
  document.querySelector<HTMLButtonElement>('.inline-check')!.click()
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
    type: 'toolkit:start-job',
    request: expect.objectContaining({
      tool: 'doh_lookup', input: 'example.com', dohRecordType: 'AAAA', dohResolver: 'google',
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
    input: '', httpCount: 4, tool: 'vm_info',
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
      job: { id: 'failed-http', tool: 'http_ping', status: 'error', progress: [], error: 'HTTP Ping thất bại' },
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
  await vi.waitFor(() => expect(document.querySelector('.error')?.textContent).toContain('HTTP Ping thất bại'))
  expect(document.querySelector('.retry-vm')).toBeNull()
})

it('opens a recent result inside the matching tool group', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  Element.prototype.scrollIntoView = vi.fn()
  const record = {
    id: 'network-record', at: new Date().toISOString(), tool: 'IP Public', target: 'Đường truyền hiện tại',
    source: 'Trình duyệt · Fetch ifconfig.me', status: 'ok' as const, result: { ip: '203.0.113.10' },
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
  await vi.waitFor(() => expect(document.querySelector('.network-info-section .result')?.textContent).toContain('203.0.113.10'))
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

it('shows HTTP Ping and DoH as independent browser tools with their own options', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  Element.prototype.scrollIntoView = vi.fn()
  const draft = {
    input: 'https://example.com/path', httpCount: 3, httpMethod: 'GET',
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
      tool: 'http_ping', input: 'https://example.com/path', httpCount: 3, httpMethod: 'GET',
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

it('shows Tag Element beside VM info and copies the complete recognized mention', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  const groups = [{
    id: 'vmware', name: 'Vmware', members: [{
      id: 'vuong', name: 'Lê Ngọc Vương', elementId: '@10.19530321:team.longvan.vn',
    }],
  }]
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: vi.fn(async () => ({})) },
    tabs: { query: vi.fn(async () => []) },
    storage: {
      session: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
      local: { get: vi.fn(async (key: string) =>
        key === 'history' ? { history: [] } :
          key === tagElementsStorageKey ? { [tagElementsStorageKey]: groups } : {}) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  })
  await import('./main')
  await showTools()
  const tagPanel = await vi.waitFor(() => {
    const panel = document.querySelector('.tag-elements-quick')
    expect(panel).not.toBeNull()
    return panel!
  })
  expect(document.querySelector('.vm-tools-layout')?.contains(tagPanel)).toBe(true)
  expect(tagPanel.textContent).toContain('Vmware')
  expect(tagPanel.textContent).toContain('Lê Ngọc Vương')
  tagPanel.querySelector<HTMLButtonElement>('.tag-member-buttons button')!.click()
  await vi.waitFor(() => expect(writeText)
    .toHaveBeenCalledWith('(Lê Ngọc Vương)[@10.19530321:team.longvan.vn]'))
  await vi.waitFor(() => expect(tagPanel.textContent).toContain('Đã chép'))
})
