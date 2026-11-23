export type VMInfo = {
  linkVm: string
  computingName: string
  virtualizationGroup: string
  group: string
  vmName: string
  vmid: string
  vmp: string
  host: string
  resourcePool: string
}

export function isPortalVMUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return !url.username && !url.password && url.origin === 'https://portal.longvan.vn' &&
      url.pathname === '/computing-manager/manager/computing/computing_detail.xhtml'
  } catch {
    return false
  }
}

// Executed in the active tab by chrome.scripting.executeScript. Must be self-contained.
export function extractVMInfoFromDOM(): VMInfo | null {
  const heading = [...document.querySelectorAll('#frmMain .card .mb-1')]
    .find((node) => node.querySelector('span')?.textContent?.trim() === 'Thông tin')
  const card = heading?.closest('.card')
  if (!card) return null

  const rows = [...card.querySelectorAll('.ui-g-12')]
  function valueFor(label: string): string {
    const row = rows.find((node) => {
      const text = [...node.childNodes]
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => child.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim()
      return text === `${label}:`
    })
    if (!row) return ''
    // JSF duplicates values in hidden editing controls; read display mode only.
    const display = row.querySelector(':scope > .ui-inplace .ui-inplace-display')
    const element = display ? display.querySelector('.FontBold') : row.querySelector(':scope > span.FontBold, :scope > a')
    return (element?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)
  }

  const info: VMInfo = {
    linkVm: location.href,
    computingName: valueFor('Tên computing'),
    virtualizationGroup: valueFor('Nhóm ảo hóa'),
    group: valueFor('Nhóm'),
    vmName: valueFor('Tên VM'),
    vmid: valueFor('VMID'),
    vmp: valueFor('VMP'),
    host: valueFor('Host'),
    resourcePool: valueFor('ResourcePool'),
  }
  return info.computingName && info.vmid ? info : null
}

export async function getVMInfoFromTab(): Promise<VMInfo> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url || !isPortalVMUrl(tab.url)) {
    throw new Error('Hãy mở tab chi tiết computing trên portal.longvan.vn rồi nhấn Lấy thông tin VM')
  }
  try {
    const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractVMInfoFromDOM })
    const info = injection?.result
    if (!info || !isPortalVMUrl(info.linkVm)) {
      throw new Error('Không tìm thấy thông tin VM trên tab này. Kiểm tra trang đã tải xong và bạn đã đăng nhập.')
    }
    return info
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Không tìm thấy')) throw error
    throw new Error('Không đọc được tab Portal. Kiểm tra quyền truy cập trang và thử lại.')
  }
}

export function formatVMInfo(data: Record<string, unknown>): string {
  const value = (field: keyof VMInfo) => typeof data[field] === 'string' ? data[field] : ''
  return [
    `Link VM: ${value('linkVm')}`,
    '',
    `Tên computing: ${value('computingName')}`,
    `Nhóm ảo hóa: ${value('virtualizationGroup')}`,
    `Nhóm: ${value('group')}`,
    `Tên VM: ${value('vmName')}`,
    `VMID: ${value('vmid')}`,
    `VMP: ${value('vmp')}`,
    `Host: ${value('host')}`,
    `ResourcePool: ${value('resourcePool')}`,
  ].join('\n')
}
