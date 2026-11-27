// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildVmName, copyServiceConfig, extractServiceConfigFromDOM, isPortalCreateUrl, isPortalServiceUrl,
  isPortalVmConfig, normalizeOwnerName, pasteServiceConfig, pasteServiceConfigIntoDOM,
  portalVmConfigKey, type PortalVmConfig,
} from './portalVmConfig'

const serviceUrl = 'https://portal.longvan.vn/cloud-service-manager/manager/cloud-service-detail.xhtml?id=123'
const createUrl = 'https://portal.longvan.vn/computing-manager/manager/computing/computing_create.xhtml?id=456'
const createPlusUrl = 'https://portal.longvan.vn/computing-manager/manager/computing/computing_create_plus.xhtml?id=456'
const config: PortalVmConfig = {
  cpu: 2, ramGB: 4, internetMbps: 200, diskGB: 50, diskType: 'NVME_STORAGE',
  os: 'Windows Server 2022 Standard (64-bit)', osId: '118498',
  siteProvider: 'HCM', siteProviderId: '106066',
  serviceType: 'Smart Cloud Server', serviceTypeId: 'SMART_CLOUD_SERVER',
  ownerName: 'Chu Xuân Hà', serviceCode: '20.2985.9322',
}

const serviceMeta = `
  <div id="frm-info-service:componentInfoService:resourceService">
    <div class="ui-g-12 ui-md-4">Mã:</div>
    <div class="ui-g-12 ui-md-8">20.2985.9322</div>
  </div>
  <span id="frm-info-service:componentInfoService:serviceTypePanel">
    <span class="ui-inplace-display"><span>Smart Cloud Server</span></span>
    <span class="ui-inplace-content"><select>
      <option value="ELASTIC_CLOUD">Elastic Cloud</option>
      <option value="SMART_CLOUD_SERVER">Smart Cloud Server</option>
    </select></span>
  </span>
  <div id="frm-info-service:componentInfoService:panelContact">
    <div class="ui-g">
      <span class="ui-panel-title">Sở hữu</span>
      <div class="ui-g-12">
        <div class="ui-g-12 ui-md-3">Mã:</div>
        <div class="ui-g-12 ui-md-9"><a href="https://portal.longvan.vn/crm/pages/customer/detail.xhtml?ownerId=20.238189.5720&amp;orgId=LONGVAN">20.238189.5720</a></div>
        <div class="ui-g-12 ui-md-3">Tên:</div>
        <div class="ui-g-12 ui-md-9">Chu Xuân Hà</div>
        <div class="ui-g-12 ui-md-3">SDT:</div>
        <div class="ui-g-12 ui-md-9">0915911183</div>
      </div>
    </div>
  </div>`

function serviceTable() {
  document.body.innerHTML = `<table><tbody id="frm-info-service:componentInfoService:resourceBare_data">
    ${[
      ['CORE', '#CORE', '2 Core'],
      ['RAM', '#RAM', '4 GB'],
      ['STORAGE', '#NVME_STORAGE', '50 GB'],
      ['IP', '#IP', '1 IP'],
      ['Internet', '#INTERNET', '200 Mb/s'],
      ['Backup', '#BACKUP', '1 Daily'],
      ['Windows Server 2022 Standard (64-bit)', '#OS', '118498'],
      ['HCM', '#PROVINCE', '106066'],
    ].map(([name, code, value]) => `<tr><td><div class="ui-cell-editor-output">${name}<br><span>${code}</span></div><div class="ui-cell-editor-input"><input value="WRONG-HIDDEN"></div></td><td><div class="ui-cell-editor-output">${value}</div><div class="ui-cell-editor-input"><input value="9999"></div></td></tr>`).join('')}
  </tbody></table>${serviceMeta}`
}

function createForm() {
  document.body.innerHTML = `<form id="frmMain">
    <div class="ui-g-12 ui-md-4"><label>Template *</label><select id="template_input"><option value="118498" selected>Windows Server 2022 Standard (64-bit)</option></select></div>
    <div class="ui-g-12 ui-md-4"><label>Khu vực *</label><select id="site_input"><option value="106066" selected>HCM</option></select></div>
    <fieldset><legend>Tài nguyên</legend>
    ${[['CPU', 'cpu', '1'], ['RAM', 'ram', '2'], ['Internet', 'internet', '100']].map(([label, id, value]) =>
      `<div class="ui-g-12 ui-md-4"><label>${label}</label><span class="ui-inputnumber"><input id="${id}_input" value="${value}"><input id="${id}_hinput" type="hidden" value="${value}"></span></div>`).join('')}
    <div class="ui-g-12 p-0"><label>Disk</label><select id="disk_type_input"><option value="SSD_STORAGE" selected>SSD</option><option value="NVME_STORAGE">NVMe</option></select>
      <span class="ui-inputnumber"><input id="disk_input" value="30"><input id="disk_hinput" type="hidden" value="30"></span></div>
  </fieldset><button type="submit" id="create-vm">Tạo VM</button></form>`
}

function createPlusForm() {
  window.history.replaceState({}, '', '/computing-manager/manager/computing/computing_create_plus.xhtml')
  document.body.innerHTML = `<form id="frmMain">
    <div class="card"><div class="ui-g-12">
      <h5>Thông tin cơ bản</h5>
      <div class="ui-g-12 ui-md-6"><label>Hình thức clone</label><select id="advanced_clone_input">
        <option value="LINKED" selected>Linked</option>
        <option value="FULL">Full</option>
      </select></div>
      <div class="ui-g-12 ui-md-6"><label>Tên</label><input id="advanced_name" type="text"></div>
      <div class="ui-g-12 ui-md-6"><label>Template</label><select id="advanced_template_input">
        <option value="20.1012.7635" selected>Windows Server 2022 Standard (64-bit)</option>
      </select></div>
      <div class="ui-g-12 ui-md-9"><label>Cấu hình triển khai</label>
        <span class="ui-autocomplete">
          <input id="templateMappingAC_input" role="combobox" aria-controls="templateMappingAC_panel">
          <input id="templateMappingAC_hinput" type="hidden">
          <button id="templateMappingAC_button" class="ui-autocomplete-dropdown" type="button">Mở</button>
        </span>
        <span id="templateMappingAC_panel"><table><tbody>
          <tr data-item-value="big-memory"><td>BIG_MEM_DEDICATED</td><td>P18-XD</td><td>other</td></tr>
          <tr data-item-value="first-smart"><td>SMART_CLOUD_SERVER</td><td>P25-SC</td><td>first</td></tr>
          <tr data-item-value="second-smart"><td>SMART_CLOUD_SERVER</td><td>P1-SC</td><td>second</td></tr>
        </tbody></table></span>
      </div>
    </div></div>
    <div class="card"><div class="ui-g-12">
      <h5>Thông tin cấu hình tài nguyên CPU, RAM, NETWORK</h5>
      <div class="ui-g-12 ui-md-4"><label>CPU</label><span class="ui-inputnumber">
        <input id="advanced_cpu_input" inputmode="numeric" value="1">
        <input id="advanced_cpu_hinput" type="hidden" value="1">
      </span></div>
      <div class="ui-g-12 ui-md-4"><label>RAM</label><span class="ui-inputnumber">
        <input id="advanced_ram_input" inputmode="numeric" value="2">
        <input id="advanced_ram_hinput" type="hidden" value="2">
      </span></div>
      <table><thead><tr><th>index</th><th>vLan</th><th>Subnet</th><th>IP</th><th aria-label="Bandwidth">Bandwidth</th></tr></thead>
        <tbody><tr><td>0</td><td></td><td></td><td></td><td><span class="ui-inputnumber">
          <input id="advanced_bandwidth_input" inputmode="numeric" value="100">
          <input id="advanced_bandwidth_hinput" type="hidden" value="100">
        </span></td></tr></tbody>
      </table>
      <div class="ui-g-12 ui-md-12"><label>Cấu hình reservation</label>
        <select id="advanced_reservation_input">
          <option value="">- Chọn -</option>
          <optgroup label="Smart Cloud Server"><option value="smart-reservation">VMWARE SMARTCLOUD</option></optgroup>
          <optgroup label="Elastic Cloud"><option value="elastic-reservation">ELASTIC CLOUD</option></optgroup>
        </select>
      </div>
    </div></div>
    <div class="card"><div class="ui-g-12">
      <h5>Thông tin cấu hình tài nguyên DISK</h5>
      <select id="advanced_disk_pool_input"><option value="" selected>- Chọn -</option><option value="pool">VSAN</option></select>
      <span class="ui-inputnumber">
        <input id="advanced_disk_input" inputmode="numeric" value="30">
        <input id="advanced_disk_hinput" type="hidden" value="30">
      </span>
      <select id="advanced_disk_type_input">
        <option value="">- Cấu hình storage reservation -</option>
        <optgroup label="SAFE_STORAGE"><option value="safe">IOPS: 4000 ops/s</option></optgroup>
        <optgroup label="NVME_STORAGE"><option value="nvme">IOPS: 40000 ops/s</option></optgroup>
      </select>
    </div></div>
  </form>`
}

afterEach(() => {
  document.body.innerHTML = ''
  window.history.replaceState({}, '', '/')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Service configuration', () => {
  it('accepts only the supported Portal paths, not lookalike domains', () => {
    expect(isPortalServiceUrl(serviceUrl)).toBe(true)
    expect(isPortalCreateUrl(createUrl)).toBe(true)
    expect(isPortalCreateUrl(createPlusUrl)).toBe(true)
    expect(isPortalServiceUrl(createUrl)).toBe(false)
    expect(isPortalCreateUrl('https://portal.longvan.vn.evil.test/computing-manager/manager/computing/computing_create.xhtml')).toBe(false)
    expect(isPortalCreateUrl('http://portal.longvan.vn/computing-manager/manager/computing/computing_create.xhtml')).toBe(false)
  })

  it('reads displayed attributes only, with exact units and storage type', async () => {
    serviceTable()
    expect(extractServiceConfigFromDOM()).toEqual(config)
    expect(JSON.stringify(extractServiceConfigFromDOM())).not.toMatch(/WRONG-HIDDEN|9999|#IP/)
    expect(extractServiceConfigFromDOM()).toMatchObject({
      os: 'Windows Server 2022 Standard (64-bit)', osId: '118498',
      siteProvider: 'HCM', siteProviderId: '106066',
    })
    const set = vi.fn(async () => {})
    vi.stubGlobal('chrome', { scripting: { executeScript: vi.fn(async ({ func }: { func: () => PortalVmConfig | null }) => [{ result: func() }]) }, storage: { session: { set } } })
    expect(await copyServiceConfig(7, serviceUrl)).toEqual(config)
    expect(set).toHaveBeenCalledWith({ [portalVmConfigKey]: config })
    document.querySelectorAll('.ui-cell-editor-output')[9].textContent = '200 MB/s'
    expect(extractServiceConfigFromDOM()).toBeNull()
  })

  it('rejects incomplete and untrusted copied data', () => {
    serviceTable()
    document.querySelector('tr')?.remove()
    expect(extractServiceConfigFromDOM()).toBeNull()
    expect(isPortalVmConfig({ ...config, diskType: 'BACKUP' })).toBe(false)
    expect(isPortalVmConfig({ ...config, cpu: -1 })).toBe(false)
    expect(isPortalVmConfig({ ...config, ownerName: undefined })).toBe(false)
  })

  it('builds a lowercase, accent-free VM name from the owner and service code', () => {
    expect(normalizeOwnerName('Chu Xuân Hà')).toBe('chuxuanha')
    expect(normalizeOwnerName('Đỗ Văn Đức')).toBe('dovanduc')
    expect(buildVmName('Chu Xuân Hà', '20.2985.9322')).toBe('chuxuanha-20.2985.9322')
    expect(buildVmName('  Nguyễn   Thị   An  ', ' 20.2985.9322 ')).toBe('nguyenthian-20.2985.9322')
    expect(buildVmName('', '20.2985.9322')).toBe('')
    expect(buildVmName('Chu Xuân Hà', '')).toBe('')
  })

  it('reads shuffled CPU and NVME PRO storage attributes while ignoring unrelated rows', () => {
    document.body.innerHTML = `<table><tbody id="frm-info-service:componentInfoService:resourceBare_data">
      ${[
        ['Backup', '#BACKUP', '1 Daily'],
        ['HN', '#PROVINCE', '106068'],
        ['CPU', '#CPU', '8 Core'],
        ['IP', '#IP', '1 IP'],
        ['STORAGE', '#NVME_PRO_STORAGE', '300 GB'],
        ['Ubuntu 22.04 (64-bit)', '#OS', '100101'],
        ['RAM', '#RAM', '8 GB'],
        ['Internet', '#INTERNET', '700 Mb/s'],
      ].map(([name, code, value]) => `<tr><td><div class="ui-cell-editor-output">${name}<br><span>${code}</span></div></td><td><div class="ui-cell-editor-output">${value}</div></td></tr>`).join('')}
    </tbody></table>${serviceMeta}`
    expect(extractServiceConfigFromDOM()).toEqual({
      cpu: 8, ramGB: 8, internetMbps: 700, diskGB: 300, diskType: 'NVME_PRO_STORAGE',
      os: 'Ubuntu 22.04 (64-bit)', osId: '100101', siteProvider: 'HN', siteProviderId: '106068',
      ownerName: 'Chu Xuân Hà', serviceCode: '20.2985.9322',
      serviceType: 'Smart Cloud Server', serviceTypeId: 'SMART_CLOUD_SERVER',
    })
  })

  it('rejects ambiguous CPU or multiple storage attributes instead of copying the wrong values', () => {
    serviceTable()
    const table = document.getElementById('frm-info-service:componentInfoService:resourceBare_data')!
    table.insertAdjacentHTML('beforeend', '<tr><td><div class="ui-cell-editor-output">CPU<br><span>#CPU</span></div></td><td><div class="ui-cell-editor-output">4 Core</div></td></tr>')
    expect(extractServiceConfigFromDOM()).toBeNull()
    table.lastElementChild?.remove()
    table.insertAdjacentHTML('beforeend', '<tr><td><div class="ui-cell-editor-output">STORAGE<br><span>#NVME_PRO_STORAGE</span></div></td><td><div class="ui-cell-editor-output">100 GB</div></td></tr>')
    expect(extractServiceConfigFromDOM()).toBeNull()
  })

  it('turns missing Portal host permission into actionable guidance', async () => {
    vi.stubGlobal('chrome', {
      scripting: { executeScript: vi.fn(async () => {
        throw new Error('Cannot access contents of the page. Extension manifest must request permission to access the respective host.')
      }) },
      storage: { session: { set: vi.fn() } },
    })
    await expect(copyServiceConfig(7, serviceUrl)).rejects.toThrow('edge://extensions')
  })
})

describe('Create computing form', () => {
  function mockPrimeFaces(failAt?: string, revertOnceAt?: string) {
    const order: string[] = []
    const events = new Map<string, Set<(...args: unknown[]) => void>>()
    const pf: { widgets: Record<string, unknown> } = { widgets: {} }
    const initialValues = new Map<Element, string>()
    let reverted = false
    function bind() {
      pf.widgets = {}
      initialValues.clear()
      for (const input of document.querySelectorAll<HTMLInputElement>('.ui-inputnumber input[id$="_input"]')) {
        const hidden = document.getElementById(input.id.replace(/_input$/, '_hinput')) as HTMLInputElement
        initialValues.set(input, input.value)
        pf.widgets[input.id] = {
          input: { 0: input },
          autonumeric: { set: (value: string) => { input.value = value; input.setAttribute('value', value) } },
          setValue: (value: string | number) => { input.value = String(value); input.setAttribute('value', String(value)) },
          copyValueToHiddenInput: () => {
            const previous = hidden.value
            hidden.value = input.value
            hidden.setAttribute('value', input.value)
            return previous
          },
          getValue: () => input.value,
        }
      }
      for (const select of document.querySelectorAll<HTMLSelectElement>('select[id$="_input"]')) {
        pf.widgets[select.id] = {
          input: { 0: select },
          selectValue: (value: string) => {
            select.value = value
            for (const option of select.options) {
              if (option.value === value) option.setAttribute('selected', 'selected')
              else option.removeAttribute('selected')
            }
          },
          triggerChange: () => change(select.id.slice(0, -'_input'.length)),
        }
      }
      for (const row of document.querySelectorAll<HTMLElement>('#templateMappingAC_panel tbody tr')) {
        row.addEventListener('click', () => {
          const input = document.getElementById('templateMappingAC_input') as HTMLInputElement
          const hidden = document.getElementById('templateMappingAC_hinput') as HTMLInputElement
          input.value = row.textContent?.replace(/\s+/g, ' ').trim() ?? ''
          hidden.value = row.dataset.itemValue ?? ''
          change('templateMappingAC')
        })
      }
    }
    function emit(event: string, source: string) {
      for (const handler of events.get(event) ?? []) handler({}, {}, { source })
    }
    function change(source: string) {
      order.push(source)
      queueMicrotask(() => {
        if (source === failAt) { emit('pfAjaxError', source); return }
        if (source === revertOnceAt && !reverted) {
          reverted = true
          const input = document.getElementById(`${source}_input`) as HTMLInputElement | null
          const hidden = document.getElementById(`${source}_hinput`) as HTMLInputElement | null
          const oldValue = input ? initialValues.get(input) : undefined
          if (input && oldValue !== undefined) { input.value = oldValue; input.setAttribute('value', oldValue) }
          if (hidden && oldValue !== undefined) { hidden.value = oldValue; hidden.setAttribute('value', oldValue) }
        }
        const form = document.getElementById('frmMain')!
        form.outerHTML = form.outerHTML // PrimeFaces replaces the form after each AJAX response.
        bind()
        emit('pfAjaxUpdated', source)
        emit('pfAjaxComplete', source)
      })
    }
    bind()
    vi.stubGlobal('PrimeFaces', pf)
    vi.stubGlobal('jQuery', (node: Element | Document) => ({
      on: (name: string, handler: (...args: unknown[]) => void) => {
        if (!events.has(name)) events.set(name, new Set())
        events.get(name)!.add(handler)
      },
      off: (name: string, handler: (...args: unknown[]) => void) => { events.get(name)?.delete(handler) },
      trigger: (name: string) => {
        if (name === 'change' && node instanceof HTMLInputElement) {
          const hidden = document.getElementById(node.id.replace(/_input$/, '_hinput')) as HTMLInputElement
          if (hidden.value !== initialValues.get(node)) change(node.id.slice(0, -'_input'.length))
        }
      },
    }))
    return order
  }

  it('fills CPU, RAM, Internet then disk type and size, waiting for every rerender', async () => {
    createForm()
    const order = mockPrimeFaces()
    const submitted = vi.fn((event: Event) => event.preventDefault())
    document.getElementById('frmMain')!.addEventListener('submit', submitted)
    expect(await pasteServiceConfigIntoDOM(config)).toEqual({ applied: ['CPU', 'RAM', 'Internet', 'Disk'] })
    expect(order).toEqual(['cpu', 'ram', 'internet', 'disk_type', 'disk'])
    expect(['cpu', 'ram', 'internet', 'disk'].map((id) => (document.getElementById(`${id}_input`) as HTMLInputElement).value))
      .toEqual(['2', '4', '200', '50'])
    expect((document.getElementById('disk_type_input') as HTMLSelectElement).value).toBe('NVME_STORAGE')
    expect(submitted).not.toHaveBeenCalled()
  })

  it('retries the fresh CPU control when Portal returns its old value after Template AJAX', async () => {
    createForm()
    const template = document.getElementById('template_input') as HTMLSelectElement
    template.innerHTML = [
      '<option value="other-os" selected>Ubuntu 22.04 (64-bit)</option>',
      '<option value="118498">Windows Server 2022 Standard (64-bit)</option>',
    ].join('')
    const order = mockPrimeFaces(undefined, 'cpu')

    const result = await pasteServiceConfigIntoDOM({ ...config, cpu: 8 })

    expect(result).toEqual({ applied: ['Template', 'CPU', 'RAM', 'Internet', 'Disk'] })
    expect(order).toEqual(['template', 'cpu', 'cpu', 'ram', 'internet', 'disk_type', 'disk'])
    expect((document.getElementById('cpu_input') as HTMLInputElement).value).toBe('8')
  })

  it('maps copied NVME PRO storage to the single compatible NVMe option in the create form', async () => {
    createForm()
    const order = mockPrimeFaces()
    const proConfig = { ...config, cpu: 8, ramGB: 8, internetMbps: 700, diskGB: 300, diskType: 'NVME_PRO_STORAGE' }
    expect(await pasteServiceConfigIntoDOM(proConfig)).toEqual({ applied: ['CPU', 'RAM', 'Internet', 'Disk'] })
    expect(order).toEqual(['cpu', 'ram', 'internet', 'disk_type', 'disk'])
    expect((document.getElementById('disk_type_input') as HTMLSelectElement).value).toBe('NVME_STORAGE')
    expect(['cpu', 'ram', 'internet', 'disk'].map((id) => (document.getElementById(`${id}_input`) as HTMLInputElement).value))
      .toEqual(['8', '8', '700', '300'])
  })

  it('fills the advanced form in order and picks the first deployment matching the service type', async () => {
    createPlusForm()
    const order = mockPrimeFaces()

    const result = await pasteServiceConfigIntoDOM(config)

    expect(result).toEqual({ applied: [
      'Hình thức clone: Full', 'Tên', 'Cấu hình triển khai', 'CPU', 'RAM', 'Internet', 'Cấu hình reservation',
      'Disk Pool', 'Disk', 'Disk Reservation',
    ] })
    expect(order).toEqual([
      'advanced_clone', 'templateMappingAC', 'advanced_cpu', 'advanced_ram', 'advanced_bandwidth',
      'advanced_reservation', 'advanced_disk_pool', 'advanced_disk', 'advanced_disk_type',
    ])
    expect((document.getElementById('advanced_clone_input') as HTMLSelectElement).value).toBe('FULL')
    expect((document.getElementById('advanced_name') as HTMLInputElement).value)
      .toBe('chuxuanha-20.2985.9322')
    expect(['advanced_cpu', 'advanced_ram', 'advanced_bandwidth', 'advanced_disk']
      .map((id) => (document.getElementById(`${id}_input`) as HTMLInputElement).value))
      .toEqual(['2', '4', '200', '50'])
    expect((document.getElementById('advanced_disk_type_input') as HTMLSelectElement).value).toBe('nvme')
    expect((document.getElementById('templateMappingAC_hinput') as HTMLInputElement).value).toBe('first-smart')
    expect((document.getElementById('advanced_reservation_input') as HTMLSelectElement).value)
      .toBe('smart-reservation')
    expect((document.getElementById('advanced_disk_pool_input') as HTMLSelectElement).value).toBe('pool')
  })

  it('skips OS and Site comparison when the copied service has neither value', async () => {
    createForm()
    const order = mockPrimeFaces()

    const result = await pasteServiceConfigIntoDOM({
      ...config, os: '', osId: '', siteProvider: '', siteProviderId: '',
    })

    expect(result).toEqual({ applied: ['CPU', 'RAM', 'Internet', 'Disk'] })
    expect(order).toEqual(['cpu', 'ram', 'internet', 'disk_type', 'disk'])
  })

  it('still checks the available attribute when the copied service lacks the other', async () => {
    createForm()
    const site = document.getElementById('site_input') as HTMLSelectElement
    site.innerHTML = '<option value="other-site" selected>HN</option>'
    mockPrimeFaces()

    const result = await pasteServiceConfigIntoDOM({ ...config, os: '', osId: '' })

    expect(result.mismatches).toEqual([
      'Khu vực không khớp: cần "HCM", hiện tại "HN".',
    ])
  })

  it('applies a different OS first, then resources, while only reporting the Site mismatch', async () => {
    createForm()
    const template = document.getElementById('template_input') as HTMLSelectElement
    const site = document.getElementById('site_input') as HTMLSelectElement
    template.innerHTML = [
      '<option value="other-os" selected>Ubuntu 22.04 (64-bit)</option>',
      '<option value="118498">Windows Server 2022 Standard (64-bit)</option>',
    ].join('')
    site.innerHTML = '<option value="other-site" selected>HN</option>'
    const order = mockPrimeFaces()

    const result = await pasteServiceConfigIntoDOM(config)

    expect(result.applied).toEqual(['Template', 'CPU', 'RAM', 'Internet', 'Disk'])
    expect(result.mismatches).toEqual([
      'Khu vực không khớp: cần "HCM", hiện tại "HN".',
    ])
    expect(order).toEqual(['template', 'cpu', 'ram', 'internet', 'disk_type', 'disk'])
    expect((document.getElementById('template_input') as HTMLSelectElement).value).toBe('118498')
    expect((document.getElementById('site_input') as HTMLSelectElement).value).toBe('other-site')
  })

  it('reports an OS mismatch and continues resources when no matching Template option exists', async () => {
    createForm()
    const template = document.getElementById('template_input') as HTMLSelectElement
    template.innerHTML = '<option value="other-os" selected>Ubuntu 22.04 (64-bit)</option>'
    const order = mockPrimeFaces()

    const result = await pasteServiceConfigIntoDOM(config)

    expect(result.applied).toEqual(['CPU', 'RAM', 'Internet', 'Disk'])
    expect(result.mismatches).toEqual([
      'Template không khớp: cần "Windows Server 2022 Standard (64-bit)", hiện tại "Ubuntu 22.04 (64-bit)".',
    ])
    expect(order).toEqual(['cpu', 'ram', 'internet', 'disk_type', 'disk'])
    expect((document.getElementById('template_input') as HTMLSelectElement).value).toBe('other-os')
  })

  it('matches Template names despite architecture spelling, accents, punctuation, and word order', async () => {
    for (const [current, copied] of [
      ['Ubuntu 24.04 (64bit)', 'Ubuntu 24.04 (64 bit)'],
      ['Ubuntu 24.04 (64 bit)', 'Ubuntu 24.04 (64-bit)'],
      ['Ubuntu 24.04 (64-BIT)', 'Ubuntu 24.04 (64bits)'],
      ['Ubuntu 24.04 aaPanel (64-bit)', 'Ubuntu 24.04 (64-bit) - aaPanel'],
      ['Hệ điều hành Đám mây (64-bit)', 'He dieu hanh dam may 64 bit'],
      ['Win Srv 2022 Std AMD64', 'Windows Server 2022 Standard (64-bit)'],
      ['Alma Linux 9.5 x64', 'AlmaLinux OS 9.5 (64 bit)'],
      ['Cent OS Linux 7', 'CentOS 7.0'],
      ['Ubuntu Server 22.04 LTS x86_64', 'Ubuntu 22.04 (64-bit)'],
      ['PF Sense 2.7 AMD64', 'pfSense 2.7 (64-bit)'],
      ['Microsoft Windows Server 2022 Std Evaluation x64', 'Windows Server 2022 Standard (64-bit)'],
      ['Debian GNU/Linux 12 (64)', 'Debian 12 x64'],
      ['Ubuntu 24.04.1 LTS AMD64', 'Ubuntu 24.04 (64-bit)'],
    ]) {
      createForm()
      const template = document.getElementById('template_input') as HTMLSelectElement
      template.innerHTML = `<option value="same-os" selected>${current}</option>`
      const order = mockPrimeFaces()

      const result = await pasteServiceConfigIntoDOM({ ...config, os: copied, osId: 'same-os' })

      expect(result.mismatches).toBeUndefined()
      expect(result.applied).toEqual(['CPU', 'RAM', 'Internet', 'Disk'])
      expect(order).toEqual(['cpu', 'ram', 'internet', 'disk_type', 'disk'])
      expect((document.getElementById('template_input') as HTMLSelectElement).value).toBe('same-os')
    }
  })

  it('selects the best equivalent OS option while rejecting another product variant', async () => {
    createForm()
    const template = document.getElementById('template_input') as HTMLSelectElement
    template.innerHTML = [
      '<option value="current" selected>Ubuntu 22.04 (64-bit)</option>',
      '<option value="docker">Ubuntu 24.04 Docker x64</option>',
      '<option value="aapanel">Ubuntu Server 24.04 aaPanel AMD64</option>',
    ].join('')
    const order = mockPrimeFaces()

    const result = await pasteServiceConfigIntoDOM({
      ...config,
      os: 'Ubuntu 24.04 (64-bit) - aa Panel',
      osId: 'different-service-attribute-id',
    })

    expect(result.mismatches).toBeUndefined()
    expect(result.applied).toEqual(['Template', 'CPU', 'RAM', 'Internet', 'Disk'])
    expect(order[0]).toBe('template')
    expect((document.getElementById('template_input') as HTMLSelectElement).value).toBe('aapanel')
  })

  it('does not confuse different OS versions, architectures, or application variants', async () => {
    for (const [available, copied] of [
      ['Ubuntu 22.04 (64-bit)', 'Ubuntu 24.04 (64-bit)'],
      ['Ubuntu 24.04 (32-bit)', 'Ubuntu 24.04 (64-bit)'],
      ['Ubuntu 24.04 Docker (64-bit)', 'Ubuntu 24.04 aaPanel (64-bit)'],
      ['Windows Server 2022 Datacenter x64', 'Windows Server 2022 Standard (64-bit)'],
      ['Ubuntu 22.04 aaPanel 7 x64', 'Ubuntu 24.04 aaPanel 7 (64-bit)'],
    ]) {
      createForm()
      const template = document.getElementById('template_input') as HTMLSelectElement
      template.innerHTML = `<option value="wrong" selected>${available}</option>`
      mockPrimeFaces()

      const result = await pasteServiceConfigIntoDOM({ ...config, os: copied, osId: 'not-present' })

      expect(result.mismatches, `${available} <> ${copied}: ${JSON.stringify(result)}`).toBeDefined()
      expect(result.mismatches?.[0]).toContain('Template không khớp')
      expect((document.getElementById('template_input') as HTMLSelectElement).value).toBe('wrong')
    }
  })

  it('reports an unsupported disk type before changing any resource value', async () => {
    createForm()
    const order = mockPrimeFaces()
    const result = await pasteServiceConfigIntoDOM({ ...config, diskType: 'ARCHIVE_STORAGE' })
    expect(result.applied).toEqual([])
    expect(result.error).toContain('ARCHIVE_STORAGE không tương thích')
    expect(result.error).toContain('NVMe')
    expect(order).toEqual([])
  })

  it('skips values already matching the saved Portal sample but keeps the required order', async () => {
    createForm()
    for (const [id, value] of [['cpu', '2'], ['ram', '4']]) {
      document.getElementById(`${id}_input`)!.setAttribute('value', value)
    }
    const select = document.getElementById('disk_type_input') as HTMLSelectElement
    select.value = 'NVME_STORAGE'
    select.options[0].removeAttribute('selected')
    select.options[1].setAttribute('selected', 'selected')
    const order = mockPrimeFaces()
    expect(await pasteServiceConfigIntoDOM(config)).toEqual({ applied: ['CPU', 'RAM', 'Internet', 'Disk'] })
    expect(order).toEqual(['internet', 'disk'])
  })

  it('stops after a failed AJAX update rather than entering later fields', async () => {
    createForm()
    const order = mockPrimeFaces('ram')
    const result = await pasteServiceConfigIntoDOM(config)
    expect(result.applied).toEqual(['CPU'])
    expect(result.error).toMatch(/không cập nhật/)
    expect(order).toEqual(['cpu', 'ram'])
  })

  it('requires a valid copied configuration before injecting into the create page', async () => {
    vi.stubGlobal('chrome', { storage: { session: { get: vi.fn(async () => ({ [portalVmConfigKey]: { ...config, diskType: 'OS' } })) } }, scripting: { executeScript: vi.fn() } })
    await expect(pasteServiceConfig(8, createUrl)).rejects.toThrow('Chưa có cấu hình hợp lệ')
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
  })
})
