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
  serviceType: 'Smart Cloud Server', serviceTypeId: 'SMART_CLOUD_SERVER',
}
type RuntimeListener = (message: Record<string, unknown>) => void
const runtimeListeners = new WeakMap<JSDOM, RuntimeListener[]>()

async function execute(
  url: string,
  body: string,
  sendMessage: ReturnType<typeof vi.fn>,
  writeText = vi.fn(async () => {}),
  waitForTool = true,
) {
  const dom = new JSDOM(`<!doctype html><body>${body}</body>`, { url, runScripts: 'outside-only' })
  const listeners: RuntimeListener[] = []
  runtimeListeners.set(dom, listeners)
  Object.defineProperty(dom.window, 'chrome', { value: { runtime: {
    sendMessage,
    onMessage: {
      addListener: (listener: RuntimeListener) => listeners.push(listener),
      removeListener: (listener: RuntimeListener) => {
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      },
    },
  } } })
  Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText }, configurable: true })
  dom.window.eval(script)
  if (waitForTool) {
    await vi.waitFor(() => expect(dom.window.document.querySelector(
      '.it-toolkit-portal-button, .it-toolkit-vm-info-copy-button, .it-toolkit-otp-button',
    )).not.toBeNull())
  } else {
    await Promise.resolve()
  }
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

it('places quick and advanced VM copy buttons in the Information heading', async () => {
  const text = '[Link VM](https://portal.longvan.vn/vm)\n\nTên computing: COMPUTING-A\nVMID: 663312104'
  const sendMessage = vi.fn(async () => ({ info: { computingName: 'COMPUTING-A' }, text }))
  const writeText = vi.fn(async () => {})
  const dom = await execute(
    'https://portal.longvan.vn/computing-manager/manager/computing/computing_detail.xhtml?id=1',
    `<form id="frmMain"><div class="card">
      <div class="mb-1"><span>Thông tin</span></div>
      <div class="ui-g-12">Tên computing: <span class="FontBold">COMPUTING-A</span></div>
    </div></form>`,
    sendMessage,
    writeText,
  )
  const button = dom.window.document.querySelector<HTMLButtonElement>('.it-toolkit-vm-info-copy-quick')!
  const advanced = dom.window.document.querySelector<HTMLButtonElement>('.it-toolkit-vm-info-copy-advanced')!
  expect(button.textContent).toBe('Copy nhanh')
  expect(advanced.textContent).toBe('Copy nâng cao')
  expect(button.closest('.mb-1')?.textContent).toContain('Thông tin')
  button.click()
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'toolkit:get-current-vm-info' }))
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(text))
  await vi.waitFor(() => expect(button.textContent).toBe('✓ Đã sao chép'))
  expect(button.classList.contains('is-copied')).toBe(true)
  expect(dom.window.document.querySelector('.it-toolkit-vm-info-copy-status')?.textContent)
    .toContain('Đã sao chép COMPUTING-A')
  dom.window.dispatchEvent(new dom.window.Event('pagehide'))
  dom.window.close()
})

it('hides and restores every injected Portal tool from the global visibility message', async () => {
  const sendMessage = vi.fn(async (message: { type: string }) =>
    message.type === 'toolkit:get-portal-tools-enabled' ? { enabled: true } : { config })
  const dom = await execute(
    'https://portal.longvan.vn/cloud-service-manager/manager/cloud-service-detail.xhtml?id=1',
    `<div class="ui-panel">
      <div class="ui-panel-titlebar"><div class="ui-panel-actions"></div></div>
      <table><tbody id="frm-info-service:componentInfoService:resourceBare_data"></tbody></table>
    </div>`,
    sendMessage,
  )
  const listener = runtimeListeners.get(dom)![0]
  expect(dom.window.document.documentElement.classList.contains('it-toolkit-portal-disabled')).toBe(false)

  listener({ type: 'toolkit:portal-tools-enabled', enabled: false })
  expect(dom.window.document.documentElement.classList.contains('it-toolkit-portal-disabled')).toBe(true)
  expect(dom.window.document.querySelector('.it-toolkit-portal-button')).not.toBeNull()

  listener({ type: 'toolkit:portal-tools-enabled', enabled: true })
  expect(dom.window.document.documentElement.classList.contains('it-toolkit-portal-disabled')).toBe(false)
  dom.window.dispatchEvent(new dom.window.Event('pagehide'))
  dom.window.close()
})

it('composes editable VM info, extra text, and a configured Element group before one copy', async () => {
  const text = '[Link VM](https://portal.longvan.vn/vm)\n\nTên computing: COMPUTING-A\nVMID: 663312104'
  const groups = [{
    id: 'vmware', name: 'Vmware', members: [
      { id: 'vuong', name: 'Lê Ngọc Vương', elementId: '@10.19530321:team.longvan.vn' },
    ],
  }]
  const templates = [{ id: 'notice', name: 'Thông báo', content: 'Template mẫu' }]
  const savedTemplate = { id: 'saved-note', name: 'Ghi chú kiểm tra', content: 'Nội dung cần lưu' }
  const sendMessage = vi.fn(async (message: { type: string } & Record<string, unknown>) => {
    if (message.type === 'toolkit:get-tag-elements') return { groups, theme: 'dark' }
    if (message.type === 'toolkit:get-message-templates') return { templates }
    if (message.type === 'toolkit:save-message-template') {
      return { template: savedTemplate, templates: [...templates, savedTemplate] }
    }
    return { info: { computingName: 'COMPUTING-A' }, text }
  })
  const writeText = vi.fn(async () => {})
  const dom = await execute(
    'https://portal.longvan.vn/computing-manager/manager/computing/computing_detail.xhtml?id=1',
    `<form id="frmMain"><div class="card">
      <div class="mb-1"><span>Thông tin</span></div>
      <div class="ui-g-12">Tên computing: <span class="FontBold">COMPUTING-A</span></div>
    </div></form>`,
    sendMessage,
    writeText,
  )
  dom.window.document.querySelector<HTMLButtonElement>('.it-toolkit-vm-info-copy-advanced')!.click()
  const dialog = await vi.waitFor(() => {
    const value = dom.window.document.querySelector<HTMLElement>('.it-toolkit-vm-composer')
    expect(value).not.toBeNull()
    return value!
  })
  const vmText = dialog.querySelector<HTMLTextAreaElement>('.it-toolkit-vm-composer-vm')!
  await vi.waitFor(() => expect(vmText.value).toBe(text))
  expect(dialog.parentElement?.classList.contains('is-dark')).toBe(true)
  expect(sendMessage).toHaveBeenCalledWith({ type: 'toolkit:get-current-vm-info' })
  expect(sendMessage).toHaveBeenCalledWith({ type: 'toolkit:get-tag-elements' })
  expect(sendMessage).toHaveBeenCalledWith({ type: 'toolkit:get-message-templates' })

  vmText.value = `${text}\nTrạng thái: cần kiểm tra`
  vmText.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  const extra = dialog.querySelector<HTMLTextAreaElement>('.it-toolkit-vm-composer-extra')!
  const saveTemplate = dialog.querySelector<HTMLButtonElement>('.it-toolkit-vm-composer-template-save')!
  expect(saveTemplate.disabled).toBe(true)
  const templateSelect = dialog.querySelector<HTMLSelectElement>('.it-toolkit-vm-composer-template-select')!
  await vi.waitFor(() => expect(templateSelect.querySelectorAll('option')).toHaveLength(2))
  templateSelect.value = 'notice'
  templateSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  await vi.waitFor(() => expect(extra.value).toBe('Template mẫu'))
  expect(dialog.querySelector('.it-toolkit-vm-composer-template-insert')).toBeNull()
  expect(saveTemplate.textContent).toBe('Lưu')
  expect(saveTemplate.disabled).toBe(false)
  expect(dialog.querySelector('.it-toolkit-vm-composer-template-delete')).toBeNull()

  templateSelect.value = ''
  templateSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  extra.value = 'Nội dung cần lưu'
  extra.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  vi.spyOn(dom.window, 'prompt').mockReturnValue('Ghi chú kiểm tra')
  saveTemplate.click()
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({
    type: 'toolkit:save-message-template',
    templateId: undefined,
    name: 'Ghi chú kiểm tra',
    content: 'Nội dung cần lưu',
  }))
  await vi.waitFor(() => expect(templateSelect.value).toBe('saved-note'))
  expect(templateSelect.querySelectorAll('option')).toHaveLength(3)
  expect(dialog.querySelector('.it-toolkit-vm-composer-status')?.textContent)
    .toBe('Đã lưu template mới.')

  const groupButton = dialog.querySelector<HTMLButtonElement>('.it-toolkit-vm-composer-tag-buttons button')!
  groupButton.click()
  await vi.waitFor(() => expect(extra.value)
    .toContain('[Lê Ngọc Vương](https://matrix.to/#/@10.19530321:team.longvan.vn)'))
  expect(groupButton.classList.contains('is-added')).toBe(true)
  expect(groupButton.textContent).toBe('✓ Vmware')
  await vi.waitFor(() => expect(dialog.querySelector('.it-toolkit-vm-composer-status')?.textContent).toBe(''))
  extra.value = 'Template mẫu'
  extra.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  expect(groupButton.disabled).toBe(false)
  groupButton.click()
  await vi.waitFor(() => expect(extra.value)
    .toBe('Template mẫu\n\n[Lê Ngọc Vương](https://matrix.to/#/@10.19530321:team.longvan.vn)'))
  dialog.querySelector<HTMLButtonElement>('.it-toolkit-vm-composer-copy')!.click()
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(
    `${text}\nTrạng thái: cần kiểm tra\n\nTemplate mẫu\n\n[Lê Ngọc Vương](https://matrix.to/#/@10.19530321:team.longvan.vn)`,
  ))
  await vi.waitFor(() => expect(dom.window.document.querySelector('.it-toolkit-vm-composer')).toBeNull())
  await vi.waitFor(() => expect(dom.window.document.querySelector('.it-toolkit-vm-info-copy-status')?.textContent)
    .toContain('Đã sao chép toàn bộ nội dung nâng cao'))
  dom.window.dispatchEvent(new dom.window.Event('pagehide'))
  dom.window.close()
})

it('fills the Portal OTP field from the matching Long Van Authenticator', async () => {
  const sendMessage = vi.fn(async (message: { type: string }) => message.type === 'toolkit:get-authenticator-codes'
    ? {
        codes: [
          { id: 'github', issuer: 'GitHub', label: 'user', code: '111111' },
          { id: 'longvan', issuer: 'LONGVAN-PT', label: '0917580860', code: '654321' },
        ],
      }
    : {})
  const dom = await execute(
    'https://portal.longvan.vn/computing-manager/manager/computing/computing_detail.xhtml?id=1',
    `<div class="ui-dialog" role="dialog">
      <strong>Nhập mã xác thực để truy cập console</strong>
      <label for="portal-otp">Nhập mã OTP</label>
      <input id="portal-otp" type="text" value="">
    </div>`,
    sendMessage,
  )
  const input = dom.window.document.querySelector<HTMLInputElement>('#portal-otp')!
  const onInput = vi.fn()
  const onChange = vi.fn()
  input.addEventListener('input', onInput)
  input.addEventListener('change', onChange)
  const button = dom.window.document.querySelector<HTMLButtonElement>('.it-toolkit-otp-button')!
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'toolkit:get-authenticator-codes' }))
  await vi.waitFor(() => expect(button.textContent).toBe('LONGVAN-PT: 654321'))
  button.click()
  await vi.waitFor(() => expect(input.value).toBe('654321'))
  expect(onInput).toHaveBeenCalledOnce()
  expect(onChange).toHaveBeenCalledOnce()
  const picker = dom.window.document.querySelector<HTMLButtonElement>('.it-toolkit-otp-picker')!
  picker.click()
  await vi.waitFor(() => expect(dom.window.document.querySelector<HTMLElement>('.it-toolkit-otp-menu')?.hidden).toBe(false))
  const menu = dom.window.document.querySelector<HTMLElement>('.it-toolkit-otp-menu')!
  expect(menu.parentElement).toBe(dom.window.document.body)
  expect(menu.style.top || menu.style.bottom).not.toBe('')
  const github = [...dom.window.document.querySelectorAll<HTMLButtonElement>('.it-toolkit-otp-account')]
    .find((item) => item.textContent?.includes('GitHub'))!
  github.click()
  await vi.waitFor(() => expect(input.value).toBe('111111'))
  expect(button.textContent).toBe('GitHub: 111111')
  dom.window.dispatchEvent(new dom.window.Event('pagehide'))
  dom.window.close()
})

it('shows quick Auth paste on other Portal 2FA dialogs and hides it when the dialog closes', async () => {
  const hostingUrl = 'https://portal.longvan.vn/cloud-service-manager/manager/web-hosting-service-detail.xhtml?id=1'
  const otpDialog = (visible: boolean) => `<div id="j_idt2054:j_idt2059:dlgEnabled2FA" class="ui-dialog" role="dialog"
    aria-hidden="${visible ? 'false' : 'true'}" style="display:${visible ? 'block' : 'none'}">
    <strong>Nhập mã xác thực để xem mật khẩu</strong>
    <label for="hosting-otp">Nhập mã OTP</label>
    <input id="hosting-otp" type="text" value="">
  </div>`
  const hiddenMessage = vi.fn(async () => ({ codes: [
    { id: 'longvan', issuer: 'LONGVAN-PT', label: '0917580860', code: '654321' },
  ] }))
  const hidden = await execute(hostingUrl, otpDialog(false), hiddenMessage, undefined, false)
  await vi.waitFor(() => expect(hidden.window.document.querySelector('.it-toolkit-otp-button')).toBeNull())
  expect(hiddenMessage).not.toHaveBeenCalledWith({ type: 'toolkit:get-authenticator-codes' })
  hidden.window.dispatchEvent(new hidden.window.Event('pagehide'))
  hidden.window.close()

  const sendMessage = vi.fn(async () => ({ codes: [
    { id: 'longvan', issuer: 'LONGVAN-PT', label: '0917580860', code: '654321' },
  ] }))
  const dom = await execute(hostingUrl, otpDialog(true), sendMessage)
  const input = dom.window.document.querySelector<HTMLInputElement>('#hosting-otp')!
  const button = dom.window.document.querySelector<HTMLButtonElement>('.it-toolkit-otp-button')!
  await vi.waitFor(() => expect(button.textContent).toBe('LONGVAN-PT: 654321'))
  button.click()
  await vi.waitFor(() => expect(input.value).toBe('654321'))

  dom.window.document.querySelector('.ui-dialog')!.remove()
  dom.window.document.body.append(dom.window.document.createElement('span'))
  await vi.waitFor(() => expect(dom.window.document.querySelector('.it-toolkit-otp-button')).toBeNull())
  await vi.waitFor(() => expect(dom.window.document.querySelector('.it-toolkit-otp-menu')).toBeNull())
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

it('adds advanced VM paste and password tools to the matching create cards', async () => {
  const sendMessage = vi.fn(async (message: { type: string }) => {
    if (message.type === 'toolkit:get-vm-config') {
      return { config, vmName: 'chuxuanha-20.2985.9322' }
    }
    if (message.type === 'toolkit:get-password-options') return { options: {} }
    if (message.type === 'toolkit:generate-password') {
      return { password: 'Generated-Password9!', options: {} }
    }
    if (message.type === 'toolkit:paste-vm-config') {
      return {
        applied: [
          'Hình thức clone: Full', 'Tên', 'Cấu hình triển khai', 'CPU', 'RAM',
          'Internet', 'Cấu hình reservation', 'Disk Pool', 'Disk', 'Disk Reservation',
        ],
      }
    }
    return {}
  })
  const dom = await execute(
    'https://portal.longvan.vn/computing-manager/manager/computing/computing_create_plus.xhtml?wsId=20.1087&orgId=LONGVAN',
    `<form id="frmMain">
      <div class="card basic-card"><div class="ui-g"><div class="ui-g-12">
        <h5>Thông tin cơ bản</h5>
        <div class="ui-g-12 ui-md-6"><label>Tên</label><input id="advanced-name" type="text"></div>
        <div class="ui-g-12 ui-md-6"><label>Template</label><select><option>Windows Server 2022</option></select></div>
      </div></div></div>
      <div class="card login-card"><div class="ui-g"><div class="ui-g-12">
        <h5>Thông tin đăng nhập</h5>
        <div class="ui-g">
          <div class="ui-g-12 ui-md-6"><label>Username</label><input type="text"></div>
          <div class="ui-g-12 ui-md-6 password-column"><label for="advanced-password">Password</label>
            <input id="advanced-password" type="password">
          </div>
        </div>
      </div></div></div>
    </form>`,
    sendMessage,
  )

  const pasteButton = await vi.waitFor(() => {
    const found = dom.window.document.querySelector<HTMLButtonElement>('.it-toolkit-plus-tools .it-toolkit-portal-button')
    expect(found).not.toBeNull()
    return found!
  })
  expect(pasteButton.textContent).toBe('Dán thông tin VM')
  expect(pasteButton.closest('.basic-card')).not.toBeNull()
  const plusHeader = pasteButton.closest('.it-toolkit-plus-header')
  expect(plusHeader?.querySelector('h5')?.textContent).toBe('Thông tin cơ bản')
  expect(plusHeader?.children[0].tagName).toBe('H5')
  expect(plusHeader?.children[1].classList.contains('it-toolkit-plus-tools')).toBe(true)
  pasteButton.click()
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'toolkit:paste-vm-config' }))
  await vi.waitFor(() => expect(dom.window.document.querySelector('.it-toolkit-plus-tools .it-toolkit-portal-status')?.textContent)
    .toContain('Hình thức clone: Full → Tên → Cấu hình triển khai'))

  const passwordButton = dom.window.document.querySelector<HTMLButtonElement>('.it-toolkit-password-button')!
  expect(passwordButton.textContent).toBe('Tạo mật khẩu')
  expect(passwordButton.closest('.login-card')).not.toBeNull()
  passwordButton.click()
  await vi.waitFor(() => expect(dom.window.document.querySelector<HTMLInputElement>('#advanced-password')?.value)
    .toBe('Generated-Password9!'))
  expect(dom.window.document.querySelectorAll('.it-toolkit-password-button')).toHaveLength(1)
  dom.window.dispatchEvent(new dom.window.Event('pagehide'))
  dom.window.close()
})

it('fills the computing name from the owner name and service code', async () => {
  const sendMessage = vi.fn(async (message: { type: string }) =>
    message.type === 'toolkit:get-vm-config'
      ? { config, vmName: 'chuxuanha-20.2985.9322' }
      : {})
  const dom = await execute(
    'https://portal.longvan.vn/computing-manager/manager/computing/computing_create.xhtml?id=1',
    `<form id="frmMain">
      <div class="ui-g-12 ui-md-12 name-field"><label>Tên</label><i>*</i><input id="computing-name" type="text" value=""></div>
      <fieldset><legend>Tài nguyên</legend><div class="ui-fieldset-content"></div></fieldset>
    </form>`,
    sendMessage,
  )
  const button = await vi.waitFor(() => {
    const found = dom.window.document.querySelector<HTMLButtonElement>('.it-toolkit-vm-name-button')
    expect(found).not.toBeNull()
    return found!
  })
  expect(button.textContent).toBe('Dán tên VM')
  button.click()
  await vi.waitFor(() => expect(dom.window.document.querySelector<HTMLInputElement>('#computing-name')?.value)
    .toBe('chuxuanha-20.2985.9322'))
  expect(dom.window.document.querySelector('.it-toolkit-vm-name-status')?.textContent)
    .toContain('Đã điền: chuxuanha-20.2985.9322')
  dom.window.dispatchEvent(new dom.window.Event('pagehide'))
  dom.window.close()
})

it('receives copied VM data in real time and refreshes again before pasting the name', async () => {
  let current = {
    config,
    vmName: 'old-owner-20.0000.0000',
  }
  const sendMessage = vi.fn(async (message: { type: string }) =>
    message.type === 'toolkit:get-vm-config' ? current : {})
  const dom = await execute(
    'https://portal.longvan.vn/computing-manager/manager/computing/computing_create.xhtml?id=1',
    `<form id="frmMain">
      <div class="ui-g-12 ui-md-12 name-field"><label>Tên</label><input id="computing-name" type="text"></div>
      <fieldset><legend>Tài nguyên</legend><div class="ui-fieldset-content"></div></fieldset>
    </form>`,
    sendMessage,
  )
  await vi.waitFor(() => expect(dom.window.document.querySelector('.it-toolkit-config-summary')?.textContent)
    .toContain('old-owner-20.0000.0000'))

  const updatedConfig = { ...config, cpu: 8, ramGB: 16 }
  runtimeListeners.get(dom)![0]({
    type: 'toolkit:vm-config-updated',
    config: updatedConfig,
    vmName: 'new-owner-20.1111.1111',
  })
  await vi.waitFor(() => expect(dom.window.document.querySelector('.it-toolkit-config-summary')?.textContent)
    .toContain('8 Core · 16 GB RAM'))
  expect(dom.window.document.querySelector('.it-toolkit-config-summary')?.textContent)
    .toContain('new-owner-20.1111.1111')
  expect(dom.window.document.querySelector('.it-toolkit-portal-status')?.textContent)
    .toContain('Đã nhận cấu hình mới')

  current = {
    config: { ...updatedConfig, cpu: 12 },
    vmName: 'latest-owner-20.2222.2222',
  }
  dom.window.document.querySelector<HTMLButtonElement>('.it-toolkit-vm-name-button')!.click()
  await vi.waitFor(() => expect(dom.window.document.querySelector<HTMLInputElement>('#computing-name')?.value)
    .toBe('latest-owner-20.2222.2222'))
  expect(sendMessage).toHaveBeenLastCalledWith({ type: 'toolkit:get-vm-config' })

  dom.window.dispatchEvent(new dom.window.Event('pagehide'))
  expect(runtimeListeners.get(dom)).toHaveLength(0)
  dom.window.close()
})

it('reports when there is no copied VM name to paste', async () => {
  const sendMessage = vi.fn(async (message: { type: string }) =>
    message.type === 'toolkit:get-vm-config' ? { config, vmName: '' } : {})
  const dom = await execute(
    'https://portal.longvan.vn/computing-manager/manager/computing/computing_create.xhtml?id=1',
    `<form id="frmMain">
      <div class="ui-g-12 ui-md-12 name-field"><label>Tên</label><i>*</i><input id="computing-name" type="text" value=""></div>
      <fieldset><legend>Tài nguyên</legend><div class="ui-fieldset-content"></div></fieldset>
    </form>`,
    sendMessage,
  )
  const button = await vi.waitFor(() => {
    const found = dom.window.document.querySelector<HTMLButtonElement>('.it-toolkit-vm-name-button')
    expect(found).not.toBeNull()
    return found!
  })
  button.click()
  await vi.waitFor(() => expect(dom.window.document.querySelector('.it-toolkit-vm-name-status')?.textContent)
    .toContain('Chưa có tên VM'))
  expect(dom.window.document.querySelector<HTMLInputElement>('#computing-name')?.value).toBe('')
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
    length: 20, specialCount: 4, numbers: true, lowercase: true, uppercase: true, special: false,
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
  expect(optionsPanel.querySelector<HTMLInputElement>('[data-option="specialCount"]')?.value).toBe('4')
  expect(optionsPanel.querySelector<HTMLElement>('.it-toolkit-password-special-count')?.hidden).toBe(true)
  expect(optionsPanel.querySelector<HTMLInputElement>('[data-option="excludeChars"]')?.value).toBe('0O')
  const special = optionsPanel.querySelector<HTMLInputElement>('[data-option="special"]')!
  special.checked = true
  special.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  await vi.waitFor(() => expect(optionsPanel.querySelector<HTMLElement>('.it-toolkit-password-special-count')?.hidden).toBe(false))
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
    options: expect.objectContaining({ length: 24, special: true, specialCount: 4, excludeChars: '0O' }),
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
