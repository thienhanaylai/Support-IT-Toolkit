export type PortalVmConfig = {
  cpu: number
  ramGB: number
  internetMbps: number
  diskGB: number
  diskType: string
  os: string
  osId: string
  siteProvider: string
  siteProviderId: string
  ownerName: string
  serviceCode: string
}

export const portalVmConfigKey = 'portalVmConfig'

export function normalizeOwnerName(value: string): string {
  return value.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLocaleLowerCase('vi-VN')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 80)
}

export function buildVmName(ownerName: string, serviceCode: string): string {
  const owner = normalizeOwnerName(ownerName)
  const code = serviceCode.replace(/\s+/g, '').slice(0, 200)
  return owner && code ? `${owner}-${code}` : ''
}

const portalOrigin = 'https://portal.longvan.vn'
const servicePath = '/cloud-service-manager/manager/cloud-service-detail.xhtml'
const createPath = '/computing-manager/manager/computing/computing_create.xhtml'

function isPortalPath(value: string, pathname: string): boolean {
  try {
    const url = new URL(value)
    return !url.username && !url.password && url.origin === portalOrigin && url.pathname === pathname
  } catch {
    return false
  }
}

export function isPortalServiceUrl(value: string): boolean { return isPortalPath(value, servicePath) }
export function isPortalCreateUrl(value: string): boolean { return isPortalPath(value, createPath) }

function portalAccessError(cause: unknown): Error {
  const message = cause instanceof Error ? cause.message : String(cause)
  if (/cannot access contents|must request permission|cannot access page|missing host permission/i.test(message)) {
    return new Error('Extension chưa có quyền truy cập Portal. Hãy tải lại extension tại edge://extensions, refresh trang Portal rồi thử lại.')
  }
  return cause instanceof Error ? cause : new Error(message)
}

export function isPortalVmConfig(value: unknown): value is PortalVmConfig {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<PortalVmConfig>
  return Number.isInteger(data.cpu) && data.cpu! > 0 && data.cpu! <= 256 &&
    Number.isInteger(data.ramGB) && data.ramGB! > 0 && data.ramGB! <= 4096 &&
    Number.isInteger(data.internetMbps) && data.internetMbps! > 0 && data.internetMbps! <= 100000 &&
    Number.isInteger(data.diskGB) && data.diskGB! > 0 && data.diskGB! <= 1000000 &&
    typeof data.diskType === 'string' && data.diskType.length <= 80 &&
    /^(?:[A-Z0-9]+_)*STORAGE$/.test(data.diskType) &&
    typeof data.os === 'string' && data.os.length <= 300 &&
    typeof data.osId === 'string' && data.osId.length <= 300 &&
    typeof data.siteProvider === 'string' && data.siteProvider.length <= 300 &&
    typeof data.siteProviderId === 'string' && data.siteProviderId.length <= 300 &&
    typeof data.ownerName === 'string' && data.ownerName.length <= 300 &&
    typeof data.serviceCode === 'string' && data.serviceCode.length <= 300
}

// Runs in the service tab. Read only the displayed attribute cells, never hidden editors.
// This function must remain self-contained for chrome.scripting.executeScript.
export function extractServiceConfigFromDOM(): PortalVmConfig | null {
  const table = document.getElementById('frm-info-service:componentInfoService:resourceBare_data')
  if (!table) return null
  const values = new Map<string, { name: string; value: string }>()
  for (const row of table.querySelectorAll(':scope > tr')) {
    const cells = row.querySelectorAll(':scope > td')
    const name = cells[0]?.querySelector('.ui-cell-editor-output')
    const value = cells[1]?.querySelector('.ui-cell-editor-output')
    const code = name?.querySelector('span')?.textContent?.trim().toUpperCase()
    const recognized = code && (/^#(?:CORE|CPU|RAM|INTERNET|OS|PROVINCE|SITE_PROVIDER|SITEPROVIDER)$/.test(code) ||
      /^#(?:[A-Z0-9]+_)*STORAGE$/.test(code))
    if (!name || !code || !recognized) continue
    if (!value || values.has(code)) return null
    const displayName = [...name.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim().slice(0, 300)
    values.set(code, {
      name: displayName,
      value: (value.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 300),
    })
  }
  function amount(code: string, unit: RegExp): number | null {
    const match = values.get(code)?.value.match(unit)
    const number = match ? Number(match[1]) : NaN
    return Number.isSafeInteger(number) && number > 0 ? number : null
  }
  const diskCodes = [...values.keys()].filter((code) => /^#(?:[A-Z0-9]+_)*STORAGE$/.test(code))
  if (diskCodes.length !== 1) return null
  const cpuCodes = ['#CORE', '#CPU'].filter((code) => values.has(code))
  if (cpuCodes.length !== 1) return null
  const cpu = amount(cpuCodes[0], /^(\d+)\s*(?:Core|CPU|vCPU)$/i)
  const ramGB = amount('#RAM', /^(\d+)\s*GB$/i)
  const internetMbps = amount('#INTERNET', /^(\d+)\s*Mb\/s$/)
  const diskGB = amount(diskCodes[0], /^(\d+)\s*GB$/i)
  if (cpu === null || ramGB === null || internetMbps === null || diskGB === null) return null
  const os = values.get('#OS')
  const provider = values.get('#SITE_PROVIDER') ?? values.get('#SITEPROVIDER') ?? values.get('#PROVINCE')

  function labelledValue(scope: Element | null | undefined, label: string): string {
    if (!scope) return ''
    const target = `${label.toLocaleLowerCase('vi-VN')}:`
    for (const node of scope.querySelectorAll('div, span')) {
      if (node.children.length) continue
      const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi-VN')
      if (text !== target) continue
      const value = (node.nextElementSibling?.textContent ?? '')
        .replace(/\s+/g, ' ').trim().slice(0, 300)
      if (value) return value
    }
    return ''
  }
  const serviceInfo = document.getElementById('frm-info-service:componentInfoService:resourceService')
  const ownerPanel = document.getElementById('frm-info-service:componentInfoService:panelContact')
  const ownerTitle = [...(ownerPanel?.querySelectorAll('.ui-panel-title') ?? [])].find((node) =>
    (node.textContent ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi-VN') === 'sở hữu')
  const ownerLink = ownerPanel?.querySelector('a[href*="ownerId="]')
  const ownerScope = ownerTitle?.closest('.ui-g') ?? ownerLink?.closest('.ui-g') ?? ownerPanel
  const serviceCode = labelledValue(serviceInfo, 'mã') ||
    (document.querySelector('#frm-page-header .copy-block')?.textContent ?? '')
      .replace(/\s+/g, ' ').trim().slice(0, 300)
  const ownerName = labelledValue(ownerScope, 'tên')

  return {
    cpu, ramGB, internetMbps, diskGB, diskType: diskCodes[0].slice(1),
    os: os?.name ?? '', osId: os?.value ?? '',
    siteProvider: provider?.name ?? '', siteProviderId: provider?.value ?? '',
    ownerName, serviceCode,
  }
}

export async function copyServiceConfig(tabId: number, url: string): Promise<PortalVmConfig> {
  if (!isPortalServiceUrl(url)) throw new Error('Hãy mở trang chi tiết Dịch vụ trên Portal.')
  let injection: chrome.scripting.InjectionResult<PortalVmConfig | null> | undefined
  try {
    [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: extractServiceConfigFromDOM })
  } catch (cause) {
    throw portalAccessError(cause)
  }
  const config = injection?.result
  if (!isPortalVmConfig(config)) {
    throw new Error('Không đọc đủ CORE, RAM, Internet và một STORAGE từ Nhóm thuộc tính. Hãy kiểm tra trang đã tải xong.')
  }
  await chrome.storage.session.set({ [portalVmConfigKey]: config })
  return config
}

export type PasteResult = { applied: string[]; error?: string; mismatches?: string[] }

// Runs in the create tab's MAIN world to use the page's PrimeFaces widgets.
// Wait for each PrimeFaces AJAX update before finding the next field in the rerendered form.
// Never clicks Save/Create, and stops on the first missing field or failed update.
export async function pasteServiceConfigIntoDOM(config: PortalVmConfig): Promise<PasteResult> {
  const applied: string[] = []
  const mismatches: string[] = []
  const result = (extra: Omit<PasteResult, 'applied' | 'mismatches'> = {}): PasteResult => ({
    applied, ...(mismatches.length ? { mismatches } : {}), ...extra,
  })
  const error = (message: string): PasteResult => result({ error: message })
  const numbers = [config.cpu, config.ramGB, config.internetMbps, config.diskGB]
  if (numbers.some((value) => !Number.isSafeInteger(value) || value <= 0) ||
      !/^(?:[A-Z0-9]+_)*STORAGE$/.test(config.diskType) || config.diskType.length > 80) {
    return error('Cấu hình đã sao chép không hợp lệ.')
  }
  function resourceSection(): Element | undefined {
    const form = document.getElementById('frmMain')
    return [...(form?.querySelectorAll('fieldset') ?? [])]
      .find((field) => field.querySelector('legend')?.textContent?.trim() === 'Tài nguyên')
  }
  if (!resourceSection()) return error('Không thấy phần Tài nguyên của trang Tạo computing.')
  const pf = (window as typeof window & { PrimeFaces?: {
    widgets: Record<string, {
      input?: { 0?: Element }
      autonumeric?: { set: (value: string) => void }
      setValue?: (value: string | number) => void
      copyValueToHiddenInput?: () => string
      getValue?: () => string
      selectValue?: (value: string) => void
      triggerChange?: () => void
    }>
  } }).PrimeFaces
  const jq = (window as typeof window & { jQuery?: (node: Document | Element) => {
    on: (name: string, handler: (...args: unknown[]) => void) => void
    off: (name: string, handler: (...args: unknown[]) => void) => void
    trigger: (name: string) => void
  } }).jQuery
  if (!pf?.widgets || !jq) return error('PrimeFaces chưa sẵn sàng. Hãy đợi trang tải xong rồi thử lại.')

  function normalizedLabel(value: string | null | undefined): string {
    return (value ?? '').replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi-VN')
  }
  function choiceField(label: string): { field: Element; select: HTMLSelectElement } | null {
    const form = document.getElementById('frmMain')
    const fieldLabel = [...(form?.querySelectorAll('label') ?? [])]
      .find((node) => normalizedLabel(node.textContent) === normalizedLabel(label))
    const field = fieldLabel?.closest('.ui-g-12, [class*="p-col"]') ?? fieldLabel?.parentElement
    const select = field?.querySelector<HTMLSelectElement>('select:not([disabled])')
    return field && select ? { field, select } : null
  }
  function currentChoice(label: string): { name: string; id: string } | null {
    const found = choiceField(label)
    if (!found) return null
    const selected = found.select.selectedOptions[0]
    const display = found.field.querySelector<HTMLElement>(
      '.ui-selectonemenu-label, .p-dropdown-label, [role="combobox"] input, input:not([type="hidden"])',
    )
    const name = (selected?.textContent || ('value' in (display ?? {}) ? (display as HTMLInputElement).value : display?.textContent) || '')
      .replace(/\s+/g, ' ').trim().slice(0, 300)
    const id = (selected?.value || found.select.value || '').trim().slice(0, 300)
    return name ? { name, id } : null
  }
  function normalizedChoice(value: string): string {
    return value.normalize('NFKC').replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi-VN')
  }
  function normalizedOsName(value: string): string {
    // The Portal and service page may spell the same architecture as 64bit, 64-bit or 64 bit.
    return normalizedChoice(value).replace(/(\d+)\s*-?\s*bits?\b/g, '$1bit')
  }
  function osMatchesCurrent(): boolean {
    const current = currentChoice('Template')
    if (!current) return false
    return (!!config.os && normalizedOsName(current.name) === normalizedOsName(config.os)) ||
      (!config.os && !!config.osId && !!current.id && current.id === config.osId)
  }
  function osOption(select: HTMLSelectElement): HTMLOptionElement | null {
    if (config.os) {
      const expected = normalizedOsName(config.os)
      return [...select.options].find((option) =>
        normalizedOsName(option.textContent ?? '') === expected) ?? null
    }
    if (config.osId) return [...select.options].find((option) => option.value === config.osId) ?? null
    return null
  }
  function compareChoice(
    label: string, expectedName: string, expectedId: string,
    normalizeName: (value: string) => string = normalizedChoice,
  ): void {
    // A service page without this attribute has nothing to compare; do not flag the form.
    if (!expectedName && !expectedId) return
    const current = currentChoice(label)
    if (!current) {
      mismatches.push(`Không xác định được ${label} hiện tại để đối chiếu.`)
      return
    }
    const namesMatch = !!expectedName && normalizeName(current.name) === normalizeName(expectedName)
    const idsMatch = !expectedName && !!expectedId && !!current.id && current.id === expectedId
    if (!namesMatch && !idsMatch) {
      const expected = expectedName || expectedId || 'Không có'
      const actual = current.name || current.id || 'Không có'
      mismatches.push(`${label} không khớp: cần "${expected}", hiện tại "${actual}".`)
    }
  }
  compareChoice('Khu vực', config.siteProvider, config.siteProviderId)
  function container(label: string): Element | null {
    const field = [...(resourceSection()?.querySelectorAll('label') ?? [])]
      .find((node) => normalizedLabel(node.textContent) === normalizedLabel(label))
    return field?.closest('.ui-g-12') ?? field?.parentElement ?? null
  }
  function numberInput(label: string): HTMLInputElement | null {
    const inputs = [...(container(label)?.querySelectorAll<HTMLInputElement>('input:not([type="hidden"])') ?? [])]
    return inputs.find((input) => input.id.endsWith('_input') &&
      (input.closest('.ui-inputnumber') || input.inputMode === 'numeric')) ?? null
  }
  function widgetFor(input: Element) {
    return Object.values(pf!.widgets).find((widget) => widget.input?.[0] === input)
  }
  function diskSelect(): HTMLSelectElement | null {
    return container('Disk')?.querySelector<HTMLSelectElement>('select[id$="_input"]') ?? null
  }
  function storageSignature(value: string): string {
    return value.toUpperCase().replace(/_STORAGE$/, '').replace(/(?:^|_)PRO(?:_|$)/g, '_')
      .replace(/[^A-Z0-9]/g, '')
  }
  function diskOption(select: HTMLSelectElement): HTMLOptionElement | null {
    const exact = [...select.options].find((option) => option.value === config.diskType)
    if (exact) return exact
    const signature = storageSignature(config.diskType)
    const compatible = [...select.options].filter((option) => storageSignature(option.value) === signature)
    return compatible.length === 1 ? compatible[0] : null
  }
  function waitForUpdate(source: string, change: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const events = jq!(document)
      let updated = false
      const matches = (settings: unknown) => !!settings && typeof settings === 'object' &&
        (settings as { source?: string }).source === source
      const cleanup = () => {
        clearTimeout(timer)
        events.off('pfAjaxUpdated', onUpdated)
        events.off('pfAjaxError', onError)
        events.off('pfAjaxComplete', onComplete)
      }
      const onUpdated = (_event: unknown, _xhr: unknown, settings: unknown) => {
        if (matches(settings)) updated = true
      }
      const onError = (_event: unknown, _xhr: unknown, settings: unknown) => {
        if (matches(settings)) { cleanup(); reject(new Error(`Portal không cập nhật được ${source}.`)) }
      }
      const onComplete = (_event: unknown, _xhr: unknown, settings: unknown) => {
        if (!matches(settings)) return
        cleanup()
        if (updated) resolve()
        else reject(new Error(`Portal không xác nhận cập nhật ${source}.`))
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(`Hết thời gian chờ Portal cập nhật ${source}.`))
      }, 15000)
      events.on('pfAjaxUpdated', onUpdated)
      events.on('pfAjaxError', onError)
      events.on('pfAjaxComplete', onComplete)
      try { change() } catch (cause) { cleanup(); reject(cause) }
    })
  }

  async function setNumber(label: string, value: number): Promise<void> {
    // PrimeFaces may replace the InputNumber once more immediately after a Template update,
    // or return the old server value on the first resource AJAX request. Always reacquire the
    // current control and retry once instead of continuing with a detached widget.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const input = numberInput(label)
      if (!input) throw new Error(`Không tìm thấy ô ${label} sau khi Portal cập nhật.`)
      const widget = widgetFor(input)
      if ((!widget?.setValue && !widget?.autonumeric?.set) || !widget?.copyValueToHiddenInput || !widget?.getValue) {
        throw new Error(`Ô ${label} chưa sẵn sàng.`)
      }
      if (Number(widget.getValue()) === value) return
      await waitForUpdate(input.id.slice(0, -'_input'.length), () => {
        if (widget.setValue) widget.setValue(value)
        else widget.autonumeric!.set(String(value))
        // InputNumber keeps a formatted visible input and a submitted hidden input. Trigger its
        // normal typing hooks, then explicitly synchronize the hidden value before p:ajax change.
        jq!(input).trigger('input')
        jq!(input).trigger('keyup')
        widget.copyValueToHiddenInput!()
        const hidden = document.getElementById(input.id.replace(/_input$/, '_hinput')) as HTMLInputElement | null
        if (hidden && Number(hidden.value) !== value) hidden.value = String(value)
        if (Number(widget.getValue!()) !== value) {
          throw new Error(`Ô ${label} không nhận giá trị ${value}.`)
        }
        jq!(input).trigger('change')
      })
      await Promise.resolve()
      const current = numberInput(label)
      const currentWidget = current && widgetFor(current)
      if (currentWidget?.getValue && Number(currentWidget.getValue()) === value) return
    }
    throw new Error(`Portal chưa giữ giá trị ${label} vừa nhập sau 2 lần thử.`)
  }

  try {
    // Apply Template first: changing OS rerenders the form, so resources must be filled afterwards.
    if (config.os || config.osId) {
      const template = choiceField('Template')
      if (!template) {
        mismatches.push('Không xác định được Template hiện tại để đối chiếu.')
      } else if (!osMatchesCurrent()) {
        const desired = osOption(template.select)
        if (!desired) {
          const current = currentChoice('Template')
          const actual = current?.name || current?.id || 'Không có'
          mismatches.push(`Template không khớp: cần "${config.os || config.osId}", hiện tại "${actual}".`)
        } else {
          const widget = widgetFor(template.select)
          if (!widget?.selectValue || !widget.triggerChange) throw new Error('Ô chọn Template chưa sẵn sàng.')
          const source = template.select.id.endsWith('_input')
            ? template.select.id.slice(0, -'_input'.length) : template.select.id
          await waitForUpdate(source, () => {
            widget.selectValue!(desired.value)
            widget.triggerChange!()
          })
          if (!osMatchesCurrent()) throw new Error('Portal chưa giữ Template vừa chọn.')
          applied.push('Template')
        }
      }
    }
    // Template changes can replace the entire resource form and its available disk types.
    // Validate only after Portal has finished applying the desired OS.
    const missing = ['CPU', 'RAM', 'Internet', 'Disk'].filter((label) => !numberInput(label))
    if (missing.length) throw new Error(`Không tìm thấy ô ${missing.join(', ')} trong phần Tài nguyên.`)
    const disk = container('Disk')
    const initialDiskSelect = diskSelect()
    if (!disk || !initialDiskSelect) throw new Error('Không tìm thấy ô chọn loại Disk.')
    const initialDiskOption = diskOption(initialDiskSelect)
    if (!initialDiskOption) {
      const available = [...initialDiskSelect.options]
        .map((option) => option.textContent?.trim() || option.value).filter(Boolean).join(', ')
      throw new Error(`Loại Disk ${config.diskType} không tương thích với trang Tạo computing${available ? ` (đang có: ${available})` : ''}.`)
    }
    const diskInputs = [...disk.querySelectorAll<HTMLInputElement>('input:not([type="hidden"])')]
      .filter((input) => input.id.endsWith('_input') && (input.closest('.ui-inputnumber') || input.inputMode === 'numeric'))
    if (diskInputs.length !== 1) throw new Error('Không xác định duy nhất ô dung lượng Disk.')

    await setNumber('CPU', config.cpu)
    applied.push('CPU')
    await setNumber('RAM', config.ramGB)
    applied.push('RAM')
    await setNumber('Internet', config.internetMbps)
    applied.push('Internet')
    const currentSelect = diskSelect()
    if (!currentSelect) throw new Error('Không còn ô chọn loại Disk.')
    const desiredOption = diskOption(currentSelect)
    if (!desiredOption) throw new Error(`Loại Disk ${config.diskType} không còn trong danh sách.`)
    const desiredDiskType = desiredOption.value
    if (currentSelect.value !== desiredDiskType) {
      const widget = widgetFor(currentSelect)
      if (!widget?.selectValue || !widget.triggerChange) throw new Error('Ô chọn loại Disk chưa sẵn sàng.')
      await waitForUpdate(currentSelect.id.slice(0, -'_input'.length), () => {
        widget.selectValue!(desiredDiskType)
        widget.triggerChange!()
      })
    }
    if (diskSelect()?.value !== desiredDiskType) {
      throw new Error('Portal chưa giữ loại Disk vừa chọn.')
    }
    await setNumber('Disk', config.diskGB)
    applied.push('Disk')
    return result()
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'Không thể điền cấu hình vào Portal.')
  }
}

export async function pasteServiceConfig(tabId: number, url: string): Promise<PasteResult> {
  if (!isPortalCreateUrl(url)) throw new Error('Hãy mở trang Tạo computing trên Portal.')
  const saved = (await chrome.storage.session.get(portalVmConfigKey))[portalVmConfigKey]
  if (!isPortalVmConfig(saved)) throw new Error('Chưa có cấu hình hợp lệ. Hãy sao chép thông số ở trang Dịch vụ trước.')
  let injection: chrome.scripting.InjectionResult<PasteResult> | undefined
  try {
    [injection] = await chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN', func: pasteServiceConfigIntoDOM, args: [saved],
    })
  } catch (cause) {
    throw portalAccessError(cause)
  }
  if (!injection?.result) throw new Error('Trang Tạo computing đã thay đổi hoặc không phản hồi.')
  return injection.result
}
