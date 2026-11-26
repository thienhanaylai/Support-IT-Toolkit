import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDoH, getCopyText } from '../formatRecord'
import {
  buildDNSQuery, dohQuery, dohResolvers, parseDNSMessage, resolveDoH, reverseDNSName,
} from './dns-lookup'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
function encode(value: string): number[] {
  return [...new TextEncoder().encode(value)]
}

function responseBytes(answers: { type: number; rdata: number[] }[], rcode = 0): Uint8Array {
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

describe('DNS over HTTPS', () => {
  it('builds a wire-format query for the selected record type', () => {
    const query = buildDNSQuery('example.com', 'AAAA')
    expect([...query.slice(12, 25)]).toEqual([7, ...encode('example'), 3, ...encode('com'), 0])
    expect([query[25], query[26]]).toEqual([0, 28])
    expect([query[27], query[28]]).toEqual([0, 1])
  })

  it('maps domains and IP addresses to the right query name', () => {
    expect(dohQuery('example.com', 'AUTO')).toEqual({ display: 'example.com', name: 'example.com', type: 'A' })
    expect(dohQuery('8.8.8.8', 'AUTO')).toEqual({
      display: '8.8.8.8', name: '8.8.8.8.in-addr.arpa', type: 'PTR',
    })
    expect(() => dohQuery('bad name', 'A')).toThrow('Tên miền không hợp lệ')
    expect(() => dohQuery('', 'A')).toThrow('Nhập domain')
  })

  it('reverses IPv4 and IPv6 addresses for PTR queries', () => {
    expect(reverseDNSName('8.8.4.4')).toBe('4.4.8.8.in-addr.arpa')
    const ipv6 = reverseDNSName('2001:db8::1')
    expect(ipv6.startsWith('1.0.0.0.')).toBe(true)
    expect(ipv6.endsWith('8.b.d.0.1.0.0.2.ip6.arpa')).toBe(true)
  })

  it('parses A, MX and TXT answers with TTL and status', () => {
    const parsed = parseDNSMessage(responseBytes([
      { type: 1, rdata: [93, 184, 216, 34] },
      { type: 15, rdata: [0, 10, 0xc0, 0x0c] },
      { type: 16, rdata: [5, ...encode('hello')] },
    ]))
    expect(parsed).toMatchObject({ status: 'NOERROR', rcode: 0, truncated: false })
    expect(parsed.answers).toMatchObject([
      { typeName: 'A', ttl: 60, data: '93.184.216.34' },
      { typeName: 'MX', ttl: 60, data: '10 example.com' },
      { typeName: 'TXT', ttl: 60, data: '"hello"' },
    ])
  })

  it('parses every additional record type exposed by the DoH form', () => {
    const uint32 = (value: number) => [
      (value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff,
    ]
    const parsed = parseDNSMessage(responseBytes([
      { type: 28, rdata: [0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] },
      { type: 5, rdata: [0xc0, 0x0c] },
      { type: 2, rdata: [0xc0, 0x0c] },
      { type: 12, rdata: [0xc0, 0x0c] },
      {
        type: 6,
        rdata: [0xc0, 0x0c, 0xc0, 0x0c, ...uint32(1), ...uint32(2), ...uint32(3), ...uint32(4), ...uint32(5)],
      },
      { type: 257, rdata: [0, 5, ...encode('issue'), ...encode('letsencrypt.org')] },
      { type: 33, rdata: [0, 10, 0, 20, 1, 187, 0xc0, 0x0c] },
    ]))
    expect(parsed.answers.map(({ typeName, data }) => ({ typeName, data }))).toEqual([
      { typeName: 'AAAA', data: '2001:db8::1' },
      { typeName: 'CNAME', data: 'example.com' },
      { typeName: 'NS', data: 'example.com' },
      { typeName: 'PTR', data: 'example.com' },
      { typeName: 'SOA', data: 'example.com example.com 1 2 3 4 5' },
      { typeName: 'CAA', data: '0 issue "letsencrypt.org"' },
      { typeName: 'SRV', data: '10 20 443 example.com' },
    ])
  })

  it('keeps NXDOMAIN and SERVFAIL as DNS statuses rather than transport errors', () => {
    expect(parseDNSMessage(responseBytes([], 3)).status).toBe('NXDOMAIN')
    expect(parseDNSMessage(responseBytes([], 2)).status).toBe('SERVFAIL')
  })

  it('posts the query to the selected RFC 8484 endpoint and returns records', async () => {
    const bytes = responseBytes([{ type: 1, rdata: [93, 184, 216, 34] }])
    const fetchMock = vi.fn(async () => ({
      ok: true, status: 200,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const progress = vi.fn()
    const result = await resolveDoH('example.com', 'A', 'cloudflare', 3_000, progress)
    expect(fetchMock).toHaveBeenCalledWith(dohResolvers.cloudflare.endpoint, expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      headers: expect.objectContaining({
        'Content-Type': 'application/dns-message',
        Accept: 'application/dns-message',
      }),
    }))
    expect(result).toMatchObject({
      success: true, action: 'doh_lookup', name: 'example.com', queryName: 'example.com',
      recordType: 'A', records: ['A 93.184.216.34'], status: 'NOERROR', rcode: 0,
      answerCount: 1, resolver: dohResolvers.cloudflare.label,
    })
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('NOERROR') }))
  })

  it('rejects HTTP failures from the resolver', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 })))
    await expect(resolveDoH('example.com', 'A', 'google', 3_000)).rejects.toThrow('HTTP 502')
  })

  it('aborts after the configured timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    const pending = resolveDoH('example.com', 'A', 'quad9', 500)
    const rejection = expect(pending).rejects.toThrow('DNS over HTTPS hết thời gian chờ')
    await vi.advanceTimersByTimeAsync(500)
    await rejection
  })

  it('formats DoH results as text for the existing result pane and copy action', () => {
    const result = {
      success: true, action: 'doh_lookup', name: 'example.com', queryName: 'example.com',
      recordType: 'A', records: ['A 93.184.216.34'], status: 'NOERROR', rcode: 0,
      durationMs: 12, resolver: dohResolvers.cloudflare.label,
    }
    const text = formatDoH(result)
    expect(text).toContain('Tên/IP: example.com')
    expect(text).toContain('Resolver: Cloudflare DoH')
    expect(text).toContain('Trạng thái: NOERROR')
    expect(text).toContain('• A 93.184.216.34')
    expect(getCopyText({
      id: 'doh', at: '', tool: 'DNS over HTTPS', target: 'example.com',
      source: 'DNS over HTTPS', status: 'ok', result,
    })).toBe(text)
  })
})
