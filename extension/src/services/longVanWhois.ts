import { grantHost } from './hostAccess'

export function longVanWhoisURL(domain: string): string {
  return `https://longvan.net/domain/whois?ten_mien=${encodeURIComponent(domain)}`
}

export type LongVanWhois = {
  domain: string
  registrar: string | null
  registration: string | null
  expiration: string | null
  status: string[]
  nameServers: string[]
  dnssec: boolean | null
}

// Self-contained: injected only into the temporary Long Vân tab. The initial
// HTML has no WHOIS data; wait for the site's own UI to render its result.
export async function extractLongVanWhoisFromDOM(expectedDomain: string): Promise<LongVanWhois | null> {
  if (location.origin !== 'https://longvan.net' || location.pathname !== '/domain/whois' ||
      new URLSearchParams(location.search).get('ten_mien')?.toLowerCase() !== expectedDomain) return null

  function extract(): LongVanWhois | null {
    const panel = document.querySelector('.domain-info-success .result-container')
    if (panel?.querySelector('.result-header h3')?.textContent?.trim() !== 'Thông tin WHOIS tên miền') return null
    const domain = panel.querySelector(':scope > span')?.textContent?.trim().toLowerCase() ?? ''
    if (domain !== expectedDomain) return null
    const rows = [...panel.querySelectorAll('.whois-table .table-title')]
    const row = (label: string): Element | undefined => rows.find((item) =>
      item.querySelector(':scope > .table-content:first-child')?.textContent?.replace(/\s+/g, ' ').trim().replace(/:$/, '').trim() === label)
        ?.querySelector(':scope > .table-content:nth-child(2)') ?? undefined
    const value = (label: string): string | null => {
      const text = row(label)?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 200)
      return text || null
    }
    const list = (label: string): string[] => {
      const cell = row(label)
      return [...(cell?.querySelectorAll(':scope > div') ?? [])]
        .map((item) => item.textContent?.trim().slice(0, 200) ?? '').filter(Boolean).slice(0, 30)
    }
    const registration = value('Ngày đăng ký')
    const expiration = value('Ngày hết hạn')
    const registrar = value('Quản lý tại Nhà đăng ký')
    if (!registrar && !registration && !expiration) return null
    const dnssec = value('DNSSEC')
    return {
      domain, registrar, registration, expiration,
      status: list('Cờ trạng thái'),
      nameServers: list('NameServer'),
      dnssec: dnssec === 'signedDelegation' ? true : dnssec === 'unsigned' ? false : null,
    }
  }

  const existing = extract()
  if (existing) return existing
  return new Promise((resolve) => {
    let done = false
    const finish = (result: LongVanWhois | null) => {
      if (done) return
      done = true
      observer.disconnect()
      clearTimeout(timer)
      resolve(result)
    }
    const observer = new MutationObserver(() => {
      const result = extract()
      if (result) finish(result)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
    const timer = setTimeout(() => finish(null), 18000)
    const appeared = extract()
    if (appeared) finish(appeared)
  })
}

async function waitForTab(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false
    const finish = (error?: Error) => {
      if (done) return
      done = true
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(updated)
      chrome.tabs.onRemoved.removeListener(removed)
      if (error) reject(error)
      else resolve()
    }
    const updated = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === 'complete') finish()
    }
    const removed = (id: number) => {
      if (id === tabId) finish(new Error('Tab Long Vân đã bị đóng trước khi trả kết quả.'))
    }
    const timer = setTimeout(() => finish(new Error('Trang Long Vân tải quá lâu. Hãy thử lại sau.')), timeoutMs)
    chrome.tabs.onUpdated.addListener(updated)
    chrome.tabs.onRemoved.addListener(removed)
    void chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === 'complete') finish()
    }).catch(() => finish(new Error('Không mở được trang Long Vân.')))
  })
}

export async function longVanWhoisLookup(domain: string, timeoutMs: number, onProgress?: (text: string) => void): Promise<Record<string, unknown>> {
  const url = longVanWhoisURL(domain)
  onProgress?.('Đang xin quyền truy cập Long Vân...')
  await grantHost(url)
  onProgress?.('Đang mở tab nền WHOIS Long Vân...')
  let tabId: number | undefined
  try {
    const windows = (await chrome.windows.getAll({ windowTypes: ['normal'] }))
      .filter((window) => window.type === 'normal')
    const windowId = (windows.find((window) => window.focused) ?? windows[0])?.id
    if (windowId === undefined) throw new Error('Cần mở một cửa sổ trình duyệt để tra cứu WHOIS.')
    const tab = await chrome.tabs.create({ windowId, url, active: false })
    tabId = tab.id
    if (tabId === undefined) throw new Error('Không mở được trang WHOIS Long Vân.')
    await waitForTab(tabId, Math.max(12000, timeoutMs))
    const current = await chrome.tabs.get(tabId)
    if (current.url !== url) {
      throw new Error('Trang WHOIS Long Vân đã chuyển hướng; không đọc dữ liệu từ trang khác.')
    }
    onProgress?.('Đang đợi trang hiển thị kết quả WHOIS...')
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId }, func: extractLongVanWhoisFromDOM, args: [domain],
    })
    const result = injection?.result
    if (!result || result.domain !== domain) {
      throw new Error('Long Vân chưa hiển thị kết quả WHOIS đúng tên miền. Trang có thể yêu cầu xác minh hoặc dịch vụ tạm thời không sẵn sàng.')
    }
    return {
      domain, registrar: result.registrar,
      events: { registration: result.registration, expiration: result.expiration },
      status: result.status, nameServers: result.nameServers, dnssec: result.dnssec,
      source: 'Trang WHOIS Long Vân (dữ liệu hiển thị)',
    }
  } finally {
    if (tabId !== undefined) {
      await chrome.tabs.remove(tabId).catch(() => { /* tab may already be closed */ })
    }
  }
}
