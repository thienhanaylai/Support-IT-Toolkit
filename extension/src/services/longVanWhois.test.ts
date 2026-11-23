// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extractLongVanWhoisFromDOM, longVanWhoisLookup, longVanWhoisURL } from './longVanWhois'
import { runCheck } from './checks'
import { getCopyText } from './formatRecord'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { WhoisResult } from '../components/WhoisResult'
import { Result } from '../components/Result'

const page = `<div class="domain-info-success"><div class="result-container">
  <div class="result-header"><h3>Thông tin WHOIS tên miền</h3></div>
  <span>vnnic.vn</span><div class="whois-info"><div class="whois-table">
    <div class="table-title"><span class="table-content">Ngày đăng ký:</span><span class="table-content">01/09/2005</span></div>
    <div class="table-title"><span class="table-content">Ngày hết hạn:</span><span class="table-content">01/09/2028</span></div>
    <div class="table-title"><span class="table-content">Chủ sở hữu tên miền:</span><span class="table-content">DO NOT STORE PERSON</span></div>
    <div class="table-title"><span class="table-content">Cờ trạng thái <i></i>:</span><span class="table-content"><div>clientTransferProhibited</div></span></div>
    <div class="table-title"><span class="table-content">Quản lý tại Nhà đăng ký:</span><span class="table-content">VNNIC</span></div>
    <div class="table-title"><span class="table-content">NameServer:</span><span class="table-content"><div>dns1.vnnic.vn</div><div>dns2.vnnic.vn</div></span></div>
    <div class="table-title"><span class="table-content">DNSSEC:</span><span class="table-content">signedDelegation</span></div>
  </div></div></div></div>`

function setup(tabURL = longVanWhoisURL('vnnic.vn')) {
  const removeTab = vi.fn(async () => {})
  const createTab = vi.fn(async () => ({ id: 28 }))
  const getAll = vi.fn(async (): Promise<chrome.windows.Window[]> => [
    { id: 77, type: 'popup', focused: true } as chrome.windows.Window,
    { id: 42, type: 'normal', focused: true } as chrome.windows.Window,
  ])
  const executeScript = vi.fn(async ({ func, args }: { func: (domain: string) => Promise<unknown>; args: string[] }) =>
    [{ result: await func(args[0]) }])
  vi.stubGlobal('chrome', {
    permissions: { contains: async () => true },
    windows: { getAll },
    tabs: {
      create: createTab, remove: removeTab,
      get: vi.fn(async (id: number) => ({ id, status: 'complete', url: tabURL })),
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
      onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    scripting: { executeScript },
    storage: { local: { get: async () => ({ settings: { saveHistory: false } }) } },
  })
  return { createTab, removeTab, executeScript, getAll }
}

beforeEach(() => {
  document.body.innerHTML = page
  vi.stubGlobal('location', new URL(longVanWhoisURL('vnnic.vn')))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Long Vân WHOIS page', () => {
  it('reads only the matching domain and technical fields', async () => {
    expect(await extractLongVanWhoisFromDOM('vnnic.vn')).toEqual({
      domain: 'vnnic.vn', registrar: 'VNNIC', registration: '01/09/2005',
      expiration: '01/09/2028', status: ['clientTransferProhibited'],
      nameServers: ['dns1.vnnic.vn', 'dns2.vnnic.vn'], dnssec: true,
    })
  })

  it('waits for client rendering and does not misread a different domain', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
    const waiting = extractLongVanWhoisFromDOM('vnnic.vn')
    document.body.innerHTML = page
    await expect(waiting).resolves.toMatchObject({ domain: 'vnnic.vn' })
    document.querySelector('.result-container > span')!.textContent = 'another.vn'
    const mismatch = extractLongVanWhoisFromDOM('vnnic.vn')
    await vi.advanceTimersByTimeAsync(18000)
    await expect(mismatch).resolves.toBeNull()
    vi.stubGlobal('location', new URL('https://longvan.net.evil.test/domain/whois?ten_mien=vnnic.vn'))
    await expect(extractLongVanWhoisFromDOM('vnnic.vn')).resolves.toBeNull()
  })

  it('closes its inactive tab, never fetches RDAP and never saves the registrant', async () => {
    const { createTab, removeTab, executeScript } = setup()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('crypto', { randomUUID: () => 'whois-test' })
    const record = await runCheck('whois', 'https://portal.vnnic.vn/path', 443)
    expect(record).toMatchObject({
      tool: 'WHOIS', target: 'vnnic.vn', source: 'Trang WHOIS Long Vân',
      result: { registrar: 'VNNIC', events: { registration: '01/09/2005', expiration: '01/09/2028' } },
    })
    expect(JSON.stringify(record)).not.toContain('DO NOT STORE PERSON')
    expect(getCopyText(record)).toContain('Ngày hết hạn: 01/09/2028')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(createTab).toHaveBeenCalledWith({ windowId: 42, url: longVanWhoisURL('vnnic.vn'), active: false })
    expect(executeScript).toHaveBeenCalledOnce()
    expect(removeTab).toHaveBeenCalledWith(28)
    const markup = renderToStaticMarkup(createElement(Result, { record }))
    expect(markup).toContain('NGÀY HẾT HẠN')
    expect(markup).toContain('dns1.vnnic.vn')
    expect(markup).toContain('whois-dates')
    expect(markup).not.toContain('<pre>')
    expect(markup).not.toContain('DO NOT STORE PERSON')
  })

  it('refuses redirects before reading the page, and closes the tab', async () => {
    const { removeTab, executeScript } = setup('https://longvan.net.evil.test/domain/whois?ten_mien=vnnic.vn')
    await expect(longVanWhoisLookup('vnnic.vn', 3000)).rejects.toThrow('chuyển hướng')
    expect(executeScript).not.toHaveBeenCalled()
    expect(removeTab).toHaveBeenCalledWith(28)
  })

  it('does not open WHOIS in the extension popup window when no normal browser window exists', async () => {
    const { createTab, getAll } = setup()
    getAll.mockResolvedValueOnce([])
    await expect(longVanWhoisLookup('vnnic.vn', 3000)).rejects.toThrow('cửa sổ trình duyệt')
    expect(createTab).not.toHaveBeenCalled()
  })

  it('does not leave an inactive tab when the WHOIS result is unavailable', async () => {
    const { removeTab, executeScript } = setup()
    executeScript.mockResolvedValueOnce([{ result: null }])
    await expect(longVanWhoisLookup('vnnic.vn', 3000)).rejects.toThrow('chưa hiển thị kết quả WHOIS')
    expect(removeTab).toHaveBeenCalledWith(28)
  })

  it('reports missing results instead of assuming availability, then closes the tab', async () => {
    const { removeTab, executeScript } = setup()
    executeScript.mockResolvedValueOnce([{ result: null }])
    await expect(longVanWhoisLookup('vnnic.vn', 3000)).rejects.toThrow('chưa hiển thị kết quả WHOIS')
    expect(removeTab).toHaveBeenCalledWith(28)
  })

  it('shows unavailable fields clearly and escapes text from saved results', () => {
    const markup = renderToStaticMarkup(createElement(WhoisResult, {
      result: { domain: '<script>alert(1)</script>', status: [], nameServers: null },
    }))
    expect(markup).toContain('Chưa có dữ liệu')
    expect(markup).not.toContain('<script>')
    expect(markup).toContain('&lt;script&gt;')
  })

  it('encodes the requested name in the supplied URL', () => {
    expect(longVanWhoisURL('paophim.app')).toBe('https://longvan.net/domain/whois?ten_mien=paophim.app')
    expect(longVanWhoisURL('a&b.vn')).toBe('https://longvan.net/domain/whois?ten_mien=a%26b.vn')
  })
})
