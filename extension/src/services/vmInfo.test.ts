// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extractVMInfoFromDOM, formatVMInfo, getVMInfoFromTab, isPortalVMUrl } from './vmInfo'
import { domainOnly, formatMXToolbox, mxToolboxLookup, registrationDomain } from './domainLookup'
import { getCopyText } from './formatRecord'
import { nativeRequest } from './nativeHost'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { Result } from '../components/Result'
import { renderReportHTML } from './report'
import { runCheck, toolRequiresAgent } from './checks'

const sample = `
<form id="frmMain"><div class="card">
  <div class="mb-1"><span>Thông tin</span></div>
  <div class="ui-g-12"> Tên computing: <span class="ui-inplace">
    <span class="ui-inplace-display"><span class="FontBold">COMPUTING-A</span></span>
    <span class="ui-inplace-content" style="display:none"><input value="WRONG-HIDDEN-VALUE"></span>
  </span></div>
  <div class="ui-g-12"> Nhóm ảo hóa: <span class="ui-inplace">
    <span class="ui-inplace-display"><span class="FontBold"></span></span>
    <span class="ui-inplace-content" style="display:none"><span>Linux Container</span></span>
  </span></div>
  <div class="ui-g-12"> Nhóm: <span class="ui-inplace"><span class="ui-inplace-display"><span class="FontBold">Dịch vụ</span></span></span></div>
  <div class="ui-g-12">Tên VM: <span class="FontBold">vm-a</span></div>
  <div class="ui-g-12">VMID: <span class="FontBold">663312104</span></div>
  <div class="ui-g-12">VMP: <a>10.2.50.11 (PROXMOX-HCM)</a></div>
  <div class="ui-g-12">Host: <a>fpt-prox02-pve14</a></div>
  <div class="ui-g-12">ResourcePool: <a>PROX02-SC</a></div>
  <div class="ui-g-12">Password: <span class="FontBold">SECRET-DO-NOT-COPY</span></div>
</div></form>`

beforeEach(() => { document.body.innerHTML = sample })
afterEach(() => { vi.unstubAllGlobals() })

describe('Portal computing page', () => {
  it('extracts only displayed VM fields, not hidden editors or credentials', () => {
    const info = extractVMInfoFromDOM()
    expect(info).toMatchObject({
      computingName: 'COMPUTING-A', virtualizationGroup: '', group: 'Dịch vụ',
      vmName: 'vm-a', vmid: '663312104', vmp: '10.2.50.11 (PROXMOX-HCM)',
      host: 'fpt-prox02-pve14', resourcePool: 'PROX02-SC',
    })
    expect(formatVMInfo(info!)).toContain('Nhóm ảo hóa: \nNhóm: Dịch vụ')
    expect(formatVMInfo(info!)).not.toContain('SECRET-DO-NOT-COPY')
    expect(getCopyText({ id: 'vm', at: '', tool: 'Thông tin VM', target: 'COMPUTING-A', source: 'Portal', status: 'ok', result: { ...info! } })).toContain('VMID: 663312104')
    const result = renderToStaticMarkup(createElement(Result, {
      record: { id: 'vm', at: '', tool: 'Thông tin VM', target: 'COMPUTING-A', source: 'Portal', status: 'ok', result: { ...info! } },
      onCopyCurrentVM: async () => {},
    }))
    expect(result).toContain('Sao chép kết quả này')
    expect(result).toContain('Lấy mới &amp; sao chép')
  })
  it('rejects unrelated pages and lookalike hosts', () => {
    expect(isPortalVMUrl('https://portal.longvan.vn/computing-manager/manager/computing/computing_detail.xhtml?id=1')).toBe(true)
    expect(isPortalVMUrl('https://portal.longvan.vn.evil.test/computing-manager/manager/computing/computing_detail.xhtml')).toBe(false)
    expect(isPortalVMUrl('http://portal.longvan.vn/computing-manager/manager/computing/computing_detail.xhtml')).toBe(false)
    document.body.innerHTML = '<div class="card"><span>Thông tin</span></div>'
    expect(extractVMInfoFromDOM()).toBeNull()
  })
  it('reads the originally selected Portal tab even if browser focus changes after closing the popup', async () => {
    const url = 'https://portal.longvan.vn/computing-manager/manager/computing/computing_detail.xhtml?id=1'
    const query = vi.fn()
    const get = vi.fn(async () => ({ id: 17, url }))
    const executeScript = vi.fn(async () => [{ result: { ...extractVMInfoFromDOM(), linkVm: url } }])
    vi.stubGlobal('chrome', { tabs: { query, get }, scripting: { executeScript } })
    expect((await getVMInfoFromTab(17)).vmid).toBe('663312104')
    expect(get).toHaveBeenCalledWith(17)
    expect(query).not.toHaveBeenCalled()
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 17 } }))
  })
})

describe('external domain lookups', () => {
  it('requires a domain and a key for MXToolbox except its public demo', async () => {
    expect(domainOnly('https://example.com/path')).toBe('example.com')
    expect(() => domainOnly('192.0.2.1')).toThrow()
    await expect(mxToolboxLookup('example.org', 'mx', '', 3000)).rejects.toThrow('API key')
  })
  it('queries the registered domain, not a .com/.net host', () => {
    expect(registrationDomain('https://www.example.com/path')).toBe('example.com')
    expect(registrationDomain('portal.longvan.net')).toBe('longvan.net')
    expect(registrationDomain('portal.longvan.vn')).toBe('longvan.vn')
    expect(registrationDomain('portal.example.com.vn')).toBe('example.com.vn')
    expect(registrationDomain('www.example.co.uk')).toBe('example.co.uk')
    expect(registrationDomain('longvan.vn')).toBe('longvan.vn')
  })
  it('uses the official MXToolbox demo endpoint for DNS example.com', async () => {
    vi.stubGlobal('chrome', { permissions: { contains: async () => true } })
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({
      ReportingNameServer: 'ns.example.com', TimeToComplete: 746,
      Information: [{ Type: 'NS', 'Domain Name': 'ns.example.com', 'IP Address': '192.0.2.1', TTL: '24 hrs', Status: '[GREEN]', Asn: 'PRIVATE' }],
      Passed: [{ Name: 'DNS Record Published', Info: 'Found' }], Failed: [],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await mxToolboxLookup('example.com', 'dns', '', 3000)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://mxtoolbox.com/api/v1/lookup/dns/example.com')
    expect(result.records).toEqual(['Type: NS · Domain Name: ns.example.com · IP Address: 192.0.2.1 · TTL: 24 hrs'])
    expect(result).toMatchObject({ domain: 'example.com', command: 'dns', reportingNameServer: 'ns.example.com', timeToCompleteMs: '746' })
    expect(result).not.toHaveProperty('passed')
    const copy = getCopyText({ id: 'mx', at: '', tool: 'MXToolbox', target: 'example.com', source: 'MXToolbox', status: 'ok', result })
    expect(copy).toContain('DNS server: ns.example.com\nThời gian: 746 ms')
    expect(copy).not.toMatch(/GREEN|PRIVATE|CẢNH BÁO|DNS Record Published/)
    expect(formatMXToolbox({ ...result, records: [{ Type: 'NS', 'Domain Name': 'ns.example.com', Status: '[GREEN]' }], warnings: ['noisy'] })).not.toContain('GREEN')
  })
  it('explains that an installed older Agent does not support port scans', async () => {
    vi.stubGlobal('chrome', { runtime: { sendNativeMessage: async () => ({ success: false, error: 'action không được hỗ trợ' }) } })
    await expect(nativeRequest('port_scan', { target: '127.0.0.1', ports: [443] })).rejects.toThrow('Local Agent đã cũ')
  })
  it('shows only command output for Ping, not its JSON metadata', () => {
    const html = renderToStaticMarkup(createElement(Result, { record: {
      id: 'ping-1', at: '2026-11-23T00:00:00Z', tool: 'Ping', target: 'example.com',
      source: 'Máy người dùng · Local Agent', status: 'ok',
      result: { action: 'ping', received: 4, raw: 'Reply from example.com' },
    } }))
    expect(html).toContain('Reply from example.com')
    expect(html).not.toContain('\"received\"')
    expect(html).not.toContain('Máy người dùng')
  })
  it('hides LAN JSON while keeping ipconfig output', () => {
    const record = {
      id: 'lan-1', at: '2026-11-23T00:00:00Z', tool: 'Mạng LAN',
      target: 'Máy này', source: 'Máy người dùng · Local Agent', status: 'ok' as const,
      result: {
        action: 'local_interfaces',
        adapters: [{ name: 'Wi-Fi', mac: '00:11:22:33:44:55', ipAddresses: ['192.168.1.10/24'] }],
        ipconfig: 'Windows IP Configuration\nIPv4 Address: 192.168.1.10',
      },
    }
    const html = renderToStaticMarkup(createElement(Result, { record }))
    expect(html).toContain('Windows IP Configuration')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('cuộn để xem thêm')
    expect(html).toContain('Máy người dùng')
    expect(html).not.toContain('&quot;adapters&quot;')
    expect(html).not.toContain('Adapter: Wi-Fi')
    expect(getCopyText(record)).toBe(record.result.ipconfig)
  })
  it('shows a readable LAN adapter list if ipconfig is unavailable', () => {
    const record = {
      id: 'lan-2', at: '2026-11-23T00:00:00Z', tool: 'Mạng LAN',
      target: 'Máy này', source: 'Local Agent', status: 'ok' as const,
      result: { action: 'local_interfaces', adapters: [{ name: 'Wi-Fi', ipAddresses: ['192.168.1.10/24'], mac: '00:11:22:33:44:55' }] },
    }
    const html = renderToStaticMarkup(createElement(Result, { record }))
    expect(html).toContain('Adapter: Wi-Fi')
    expect(html).not.toContain('&quot;adapters&quot;')
    expect(getCopyText(record)).toContain('IP: 192.168.1.10/24')
  })
  it('exports collapsed, accessible HTML details and escapes saved data', () => {
    const html = renderReportHTML([{
      id: 'report-1', at: '2026-11-23T00:00:00Z', tool: 'Ping',
      target: '<img src=x onerror=alert(1)>', source: '<script>bad()</script>',
      status: 'ok', result: { raw: '<script>private</script>' },
    }])
    const page = new DOMParser().parseFromString(html, 'text/html')
    const entry = page.querySelector('details')
    expect(entry?.open).toBe(false)
    expect(entry?.querySelector('summary')?.textContent).toContain('Ping')
    expect(entry?.querySelector('pre')?.textContent).toContain('<script>private</script>')
    expect(page.querySelector('script, img')).toBeNull()
    expect(html).toContain('&lt;script&gt;private&lt;/script&gt;')
  })
  it('does not report success when the public-IP service returns an invalid address', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: async () => ({ settings: { saveHistory: false } }) } },
      runtime: {},
    })
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => 'not-an-ip' }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(runCheck('public_ip', '', 443)).rejects.toThrow('địa chỉ IP hợp lệ')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('runs Public IP in the Browser Engine when the Native Host is unavailable', async () => {
    const sendNativeMessage = vi.fn(async () => { throw new Error('Specified native messaging host not found.') })
    vi.stubGlobal('chrome', {
      storage: { local: { get: async () => ({ settings: { saveHistory: false } }) } },
      runtime: { sendNativeMessage },
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '203.0.113.9' })))
    vi.stubGlobal('crypto', { randomUUID: () => 'browser-ip' })
    const record = await runCheck('public_ip', '', 443)
    expect(record.result).toMatchObject({ success: true, action: 'public_ip', ip: '203.0.113.9' })
    expect(record.source).toBe('Trình duyệt · Fetch ifconfig.me')
    expect(sendNativeMessage).not.toHaveBeenCalled()
    expect(toolRequiresAgent('public_ip')).toBe(false)
    expect(toolRequiresAgent('ping')).toBe(true)
  })
  it('sends the chosen Ping count and Traceroute hop limit to the Local Agent', async () => {
    const messages: Record<string, unknown>[] = []
    vi.stubGlobal('chrome', {
      storage: { local: { get: async () => ({ settings: { saveHistory: false } }) } },
      runtime: { sendNativeMessage: async (_host: string, message: Record<string, unknown>) => {
        messages.push(message)
        return { success: true, raw: 'Command output' }
      } },
    })
    vi.stubGlobal('crypto', { randomUUID: () => 'test-id' })
    await runCheck('ping', 'example.com', 443, undefined, 'dns', 2, 20)
    await runCheck('traceroute', 'example.com', 443, undefined, 'dns', 4, 8)
    expect(messages).toMatchObject([
      { action: 'ping', target: 'example.com', count: 2 },
      { action: 'traceroute', target: 'example.com', maxHops: 8 },
    ])
    await expect(runCheck('ping', 'example.com', 443, undefined, 'dns', 6)).rejects.toThrow('1 đến 5')
    await expect(runCheck('traceroute', 'example.com', 443, undefined, 'dns', 4, 31)).rejects.toThrow('1 đến 30')
    expect(messages).toHaveLength(2)
  })
  it('runs DNS Check through the selected resolver and formats the records', async () => {
    const messages: Record<string, unknown>[] = []
    vi.stubGlobal('chrome', {
      storage: { local: { get: async () => ({ settings: { saveHistory: false } }) } },
      runtime: { sendNativeMessage: async (_host: string, message: Record<string, unknown>) => {
        messages.push(message)
        return {
          success: true, name: 'example.com', recordType: 'A',
          resolver: '1.1.1.1:53', durationMs: 12, records: ['93.184.216.34'],
        }
      } },
    })
    vi.stubGlobal('crypto', { randomUUID: () => 'dns-id' })
    const record = await runCheck(
      'dns_lookup', 'example.com', 443, undefined, 'dns', 4, 20,
      undefined, undefined, 'A', '1.1.1.1',
    )
    expect(messages).toMatchObject([{
      action: 'dns_lookup', name: 'example.com', recordType: 'A', resolver: '1.1.1.1',
    }])
    expect(record.tool).toBe('DNS Check')
    expect(getCopyText(record)).toContain('DNS server: 1.1.1.1:53')
    expect(getCopyText(record)).toContain('93.184.216.34')
    expect(renderToStaticMarkup(createElement(Result, { record }))).toContain('93.184.216.34')
  })
  it('detects an older Agent that silently ignores the custom DNS server', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: async () => ({ settings: { saveHistory: false } }) } },
      runtime: { sendNativeMessage: async () => ({
        success: true, name: 'example.com', recordType: 'A',
        resolver: 'DNS của hệ điều hành', records: ['93.184.216.34'],
      }) },
    })
    await expect(runCheck(
      'dns_lookup', 'example.com', 443, undefined, 'dns', 4, 20,
      undefined, undefined, 'A', '1.1.1.1',
    )).rejects.toThrow('Local Agent đã cũ, chưa hỗ trợ DNS server tùy chọn')
  })
})
