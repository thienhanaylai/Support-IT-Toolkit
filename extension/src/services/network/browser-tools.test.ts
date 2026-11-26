import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Result } from '../../components/Result'
import { runCheck } from '../checks'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function stubChrome() {
  vi.stubGlobal('chrome', {
    storage: {
      local: { get: async () => ({ settings: { saveHistory: false } }), set: async () => {} },
    },
  })
  vi.stubGlobal('crypto', { randomUUID: () => 'browser-tool' })
}

function encode(value: string): number[] {
  return [...new TextEncoder().encode(value)]
}

function dnsResponse(rcode = 0, answers: { type: number; rdata: number[] }[] = [{ type: 1, rdata: [93, 184, 216, 34] }]): Uint8Array {
  const bytes = [
    0x12, 0x34, 0x81, 0x80 | rcode, 0, 1, 0, answers.length, 0, 0, 0, 0,
    7, ...encode('example'), 3, ...encode('com'), 0, 0, 1, 0, 1,
  ]
  for (const answer of answers) {
    bytes.push(
      0xc0, 0x0c, answer.type >> 8, answer.type & 0xff, 0, 1, 0, 0, 0, 60,
      answer.rdata.length >> 8, answer.rdata.length & 0xff, ...answer.rdata,
    )
  }
  return new Uint8Array(bytes)
}

describe('browser network tools without an Agent', () => {
  it('runs HTTP Ping through Fetch and renders the terminal result', async () => {
    stubChrome()
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, ok: true, body: { cancel: async () => {} } })))
    const record = await runCheck(
      'http_ping', 'https://example.com/', 2, undefined, undefined, 'HEAD', 'AUTO', 'cloudflare',
    )
    expect(record).toMatchObject({
      tool: 'HTTP Ping', target: 'https://example.com/',
      source: 'Trình duyệt · Fetch HTTP', status: 'ok',
    })
    expect(record.result).toMatchObject({
      success: true, action: 'http_ping', sent: 2, received: 2, okCount: 2, loss: 0,
    })
    const html = renderToStaticMarkup(createElement(Result, { record }))
    expect(html).toContain('KẾT QUẢ HTTP PING')
    expect(html).toContain('[1] HTTP 200')
  })

  it('runs DoH through Fetch and renders the formatted records', async () => {
    stubChrome()
    const bytes = dnsResponse()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    })))
    const record = await runCheck(
      'doh_lookup', 'example.com', 4, undefined, undefined, 'HEAD', 'A', 'cloudflare',
    )
    expect(record).toMatchObject({
      tool: 'DNS over HTTPS', target: 'example.com', status: 'ok',
      source: 'DNS over HTTPS · Cloudflare DoH (cloudflare-dns.com)',
    })
    expect(record.result).toMatchObject({
      success: true, action: 'doh_lookup', records: ['A 93.184.216.34'], status: 'NOERROR',
    })
    const html = renderToStaticMarkup(createElement(Result, { record }))
    expect(html).toContain('Trạng thái: NOERROR')
    expect(html).toContain('93.184.216.34')
  })

  it('marks NXDOMAIN as a warning without calling the Native Host', async () => {
    stubChrome()
    const bytes = dnsResponse(3, [])
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    })))
    const record = await runCheck(
      'doh_lookup', 'example.com', 4, undefined, undefined, 'HEAD', 'AUTO', 'google',
    )
    expect(record.status).toBe('warn')
    expect(record.result).toMatchObject({ status: 'NXDOMAIN', records: [] })
    expect(record.source).toContain('Google DoH')
  })
})
