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
