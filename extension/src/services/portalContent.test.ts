// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { expect, it, vi } from 'vitest'

const script = readFileSync(fileURLToPath(new URL('../../public/portal.js', import.meta.url)), 'utf8')
const config = {
  cpu: 2, ramGB: 4, internetMbps: 200, diskGB: 50, diskType: 'NVME_STORAGE',
  os: 'Windows Server 2022 Standard (64-bit)', osId: '118498',
  siteProvider: 'HCM', siteProviderId: '106066',
}

async function execute(url: string, body: string, sendMessage: ReturnType<typeof vi.fn>) {
  const dom = new JSDOM(`<!doctype html><body>${body}</body>`, { url, runScripts: 'outside-only' })
  Object.defineProperty(dom.window, 'chrome', { value: { runtime: { sendMessage } } })
  dom.window.eval(script)
  await vi.waitFor(() => expect(dom.window.document.querySelector('.it-toolkit-portal-button')).not.toBeNull())
  return dom
}

it('places Copy configuration beside the Service attribute panel actions', async () => {
  const sendMessage = vi.fn(async () => ({ config }))
  const dom = await execute(
    'https://portal.longvan.vn/cloud-service-manager/manager/cloud-service-detail.xhtml?id=1',
    `<div class="ui-panel">
      <div class="ui-panel-titlebar"><span>Nhóm thuộc tính</span><div class="ui-panel-actions"><button>Thêm</button></div></div>
      <div><table><tbody id="frm-info-service:componentInfoService:resourceBare_data"></tbody></table></div>
    </div>`,
    sendMessage,
  )
  const button = dom.window.document.querySelector<HTMLButtonElement>('.it-toolkit-portal-button')!
  expect(button.textContent).toBe('Sao chép thông số')
  expect(button.closest('.ui-panel-actions')).not.toBeNull()
  button.click()
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'toolkit:copy-vm-config' }))
  await vi.waitFor(() => expect(dom.window.document.querySelector('.it-toolkit-portal-status')?.textContent).toContain('2 Core'))
  expect(dom.window.document.querySelector('.it-toolkit-portal-status')?.textContent)
    .toContain('OS: Windows Server 2022 Standard (64-bit) (118498)')
  expect(dom.window.document.querySelector('.it-toolkit-portal-status')?.textContent)
    .toContain('Site Provider: HCM (106066)')
  expect(dom.window.document.querySelector('.it-toolkit-service-status')?.parentElement?.classList.contains('ui-panel')).toBe(true)
  dom.window.dispatchEvent(new dom.window.Event('pagehide'))
  dom.window.close()
})

it('places Paste configuration inside Resources and reports the required order', async () => {
  const sendMessage = vi.fn(async (message: { type: string }) =>
    message.type === 'toolkit:get-vm-config' ? { config } : { applied: ['CPU', 'RAM', 'Internet', 'Disk'] })
  const dom = await execute(
    'https://portal.longvan.vn/computing-manager/manager/computing/computing_create.xhtml?id=1',
    `<form id="frmMain"><fieldset><legend>Tài nguyên</legend><div class="ui-fieldset-content">
      <label>CPU</label><label>RAM</label><label>Internet</label><label>Disk</label>
    </div></fieldset></form>`,
    sendMessage,
  )
  await vi.waitFor(() => expect(dom.window.document.querySelector('.it-toolkit-config-summary')?.textContent).toContain('2 Core'))
  const button = dom.window.document.querySelector<HTMLButtonElement>('.it-toolkit-portal-button')!
  expect(button.textContent).toBe('Dán cấu hình đã sao chép')
  expect(button.closest('.ui-fieldset-content')).not.toBeNull()
  button.click()
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'toolkit:paste-vm-config' }))
  await vi.waitFor(() => expect(dom.window.document.querySelector('.it-toolkit-portal-status')?.textContent)
    .toContain('CPU → RAM → Internet → Disk'))
  dom.window.dispatchEvent(new dom.window.Event('pagehide'))
  dom.window.close()
})

it('shows OS or Site mismatches as an error after pasting resources', async () => {
  const sendMessage = vi.fn(async (message: { type: string }) =>
    message.type === 'toolkit:get-vm-config'
      ? { config }
      : {
          applied: ['CPU', 'RAM', 'Internet', 'Disk'],
          mismatches: ['Template không khớp: cần "Windows Server 2022", hiện tại "Ubuntu 22.04".'],
        })
  const dom = await execute(
    'https://portal.longvan.vn/computing-manager/manager/computing/computing_create.xhtml?id=1',
    `<form id="frmMain">
      <div class="ui-g-12 template-field"><label>Template *</label><select><option>Ubuntu 22.04</option></select></div>
      <div class="ui-g-12 site-field"><label>Khu vực *</label><select><option>HCM</option></select></div>
      <fieldset><legend>Tài nguyên</legend><div class="ui-fieldset-content"></div></fieldset>
    </form>`,
    sendMessage,
  )
  const button = dom.window.document.querySelector<HTMLButtonElement>('.it-toolkit-create-tools .it-toolkit-portal-button')!
  button.click()
  const status = dom.window.document.querySelector('.it-toolkit-create-tools .it-toolkit-portal-status')!
  await vi.waitFor(() => expect(status.textContent).toContain('OS/Site không khớp'))
  expect(status.textContent).toContain('Đã điền CPU → RAM → Internet → Disk')
  expect(status.classList.contains('is-error')).toBe(true)
  expect(dom.window.document.querySelector('.template-field')?.classList.contains('it-toolkit-context-mismatch')).toBe(true)
  expect(dom.window.document.querySelector('.site-field')?.classList.contains('it-toolkit-context-mismatch')).toBe(false)
  dom.window.dispatchEvent(new dom.window.Event('pagehide'))
  dom.window.close()
})

it('places quick generation beside Password and updates the field with input and change events', async () => {
  let savedOptions = {
    length: 20, numbers: true, lowercase: true, uppercase: true, special: false,
    excludeEnabled: true, excludeChars: '0O',
  }
  const sendMessage = vi.fn(async (message: { type: string; options?: typeof savedOptions }) => {
    if (message.type === 'toolkit:get-vm-config') return { config }
    if (message.type === 'toolkit:get-password-options') return { options: savedOptions }
    if (message.type === 'toolkit:set-password-options') {
      savedOptions = message.options!
      return { options: savedOptions }
    }
    if (message.type === 'toolkit:generate-password') {
      return { password: 'Generated-Password9!', options: savedOptions }
    }
    return {}
  })
  const dom = await execute(
    'https://portal.longvan.vn/computing-manager/manager/computing/computing_create.xhtml?id=1',
    `<form id="frmMain">
      <div class="ui-g">
        <div class="ui-g-12 ui-md-6 password-column">
          <label for="frmMain:password">Password *</label>
          <input id="frmMain:password" type="password">
        </div>
      </div>
      <fieldset><legend>Tài nguyên</legend><div class="ui-fieldset-content"></div></fieldset>
    </form>`,
    sendMessage,
  )
  const button = await vi.waitFor(() => {
    const value = dom.window.document.querySelector<HTMLButtonElement>('.it-toolkit-password-button')
    expect(value).not.toBeNull()
    return value!
  })
  expect(button.textContent).toBe('Tạo mật khẩu')
  expect(button.closest('.it-toolkit-password-tools')?.classList.contains('ui-md-6')).toBe(true)
  expect(dom.window.document.querySelectorAll('.it-toolkit-password-button')).toHaveLength(1)
  const optionsButton = dom.window.document.querySelector<HTMLButtonElement>('.it-toolkit-password-options-button')!
  const optionsPanel = dom.window.document.querySelector<HTMLElement>('.it-toolkit-password-options')!
  Object.defineProperty(optionsPanel, 'offsetHeight', { value: 120, configurable: true })
  optionsButton.getBoundingClientRect = () => ({
    x: 420, y: 300, top: 300, right: 500, bottom: 339, left: 420,
    width: 80, height: 39, toJSON: () => ({}),
  })
  expect(optionsButton.textContent).toBe('Tùy chọn')
  optionsButton.click()
  await vi.waitFor(() => expect(optionsPanel.hidden).toBe(false))
  await vi.waitFor(() => expect(optionsPanel.style.top).toBe('172px'))
  expect(optionsButton.textContent).toBe('Tùy chọn')
  expect(optionsButton.classList.contains('is-open')).toBe(true)
  expect(optionsPanel.parentElement).toBe(dom.window.document.body)
  expect(optionsPanel.querySelector<HTMLInputElement>('[data-option="length"]')?.value).toBe('20')
  expect(optionsPanel.querySelector<HTMLInputElement>('[data-option="special"]')?.checked).toBe(false)
  expect(optionsPanel.querySelector<HTMLInputElement>('[data-option="excludeChars"]')?.value).toBe('0O')
  const length = optionsPanel.querySelector<HTMLInputElement>('[data-option="length"]')!
  length.value = '24'
  length.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({
    type: 'toolkit:set-password-options',
  }))
  const saveOptions = optionsPanel.querySelector<HTMLButtonElement>('.it-toolkit-password-options-save')!
  expect(saveOptions.textContent).toBe('Lưu')
  saveOptions.click()
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({
    type: 'toolkit:set-password-options',
    options: expect.objectContaining({ length: 24, excludeChars: '0O' }),
  }))
  await vi.waitFor(() => expect(saveOptions.disabled).toBe(false))
  expect(optionsPanel.querySelector('.it-toolkit-password-options-notice')?.textContent).toBe('')
  expect(optionsPanel.getAttribute('role')).toBe('dialog')
  const closeOptions = optionsPanel.querySelector<HTMLButtonElement>('.it-toolkit-password-options-close')!
  closeOptions.click()
  await vi.waitFor(() => expect(optionsPanel.hidden).toBe(true))
  expect(optionsButton.textContent).toBe('Tùy chọn')
  expect(optionsButton.classList.contains('is-open')).toBe(false)
  optionsButton.click()
  await vi.waitFor(() => expect(optionsPanel.hidden).toBe(false))
  dom.window.document.body.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }))
  await vi.waitFor(() => expect(optionsPanel.hidden).toBe(true))

  const input = dom.window.document.querySelector<HTMLInputElement>('input[type="password"]')!
  input.type = 'text' // Portal's eye button reveals the password by changing the input type.
  const onInput = vi.fn()
  const onChange = vi.fn()
  const writeText = vi.fn(async () => {})
  Object.defineProperty(dom.window.navigator, 'clipboard', {
    value: { writeText }, configurable: true,
  })
  input.addEventListener('input', onInput)
  input.addEventListener('change', onChange)
  button.click()
  await vi.waitFor(() => expect(input.value).toBe('Generated-Password9!'))
  expect(sendMessage).toHaveBeenCalledWith({ type: 'toolkit:generate-password' })
  expect(onInput).toHaveBeenCalledOnce()
  expect(onChange).toHaveBeenCalledOnce()
  expect(dom.window.document.querySelector('.it-toolkit-password-status-text')?.textContent)
    .toBe('Đã tạo pass: Generated-Password9!')
  const copy = dom.window.document.querySelector<HTMLButtonElement>('.it-toolkit-password-copy')!
  expect(copy.hidden).toBe(false)
  copy.click()
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('Generated-Password9!'))
  await vi.waitFor(() => expect(copy.textContent).toBe('Đã chép'))
  dom.window.dispatchEvent(new dom.window.Event('pagehide'))
  dom.window.close()
})

it('handles an invalidated extension context without an uncaught error', async () => {
  const sendMessage = vi.fn(() => { throw new Error('Extension context invalidated.') })
  const dom = await execute(
    'https://portal.longvan.vn/computing-manager/manager/computing/computing_create.xhtml?id=1',
    `<form id="frmMain"><fieldset><legend>Tài nguyên</legend><div class="ui-fieldset-content"></div></fieldset></form>`,
    sendMessage,
  )
  await vi.waitFor(() => expect(dom.window.document.querySelector('.it-toolkit-portal-status')?.textContent)
    .toContain('refresh trang Portal'))
  expect(dom.window.document.querySelector('.it-toolkit-portal-status')?.classList.contains('is-error')).toBe(true)
  dom.window.dispatchEvent(new dom.window.Event('pagehide'))
  dom.window.close()
})

it('handles a missing chrome.runtime context after an extension reload', async () => {
  const dom = new JSDOM(
    `<!doctype html><body><form id="frmMain"><fieldset><legend>Tài nguyên</legend><div class="ui-fieldset-content"></div></fieldset></form></body>`,
    { url: 'https://portal.longvan.vn/computing-manager/manager/computing/computing_create.xhtml?id=1', runScripts: 'outside-only' },
  )
  Object.defineProperty(dom.window, 'chrome', { value: {}, configurable: true })
  dom.window.eval(script)
  await vi.waitFor(() => expect(dom.window.document.querySelector('.it-toolkit-portal-status')?.textContent)
    .toContain('refresh trang Portal'))
  dom.window.dispatchEvent(new dom.window.Event('pagehide'))
  dom.window.close()
})
