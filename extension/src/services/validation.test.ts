import { describe, expect, it } from 'vitest'
import { parseInput, safeMaxHops, safePingCount, safePort, safeTimeout, validTarget } from './validation'
import { escapeHTML } from './report'
import { formatRecord, getCopyText, publicIP } from './formatRecord'
import { commonPorts, parseScanPorts } from './scanPorts'

describe('target validation', () => {
  it('accepts domains and IPv4/IPv6', () => {
    for (const host of ['example.com', '192.168.1.1', '::1', '[2001:db8::1]']) expect(validTarget(host)).toBe(true)
  })
  it('rejects shell flags and URL delimiters in native targets', () => {
    for (const host of ['-n', 'x.com;whoami', 'x.com/path', 'a b', 'x.com?foo', '']) expect(validTarget(host)).toBe(false)
  })
  it('parses website URLs and bare hosts', () => {
    expect(parseInput('https://example.com/path').host).toBe('example.com')
    expect(parseInput('example.com').url).toBe('https://example.com/')
  })
  it('constrains ports and timeouts', () => {
    expect(safePort(443)).toBe(443)
    expect(() => safePort(65536)).toThrow()
    expect(safeTimeout(50000)).toBe(10000)
  })
  it('validates Ping count and Traceroute maximum hops', () => {
    expect(safePingCount(1)).toBe(1)
    expect(safePingCount(5)).toBe(5)
    expect(safeMaxHops(1)).toBe(1)
    expect(safeMaxHops(30)).toBe(30)
    for (const value of [0, -1, 1.5, 6, NaN]) expect(() => safePingCount(value)).toThrow()
    for (const value of [0, -1, 2.5, 31, NaN]) expect(() => safeMaxHops(value)).toThrow()
  })
  it('escapes HTML report content', () => {
    expect(escapeHTML('<script>"x"</script>')).not.toContain('<script>')
  })
  it('formats saved results for copying with source and output', () => {
    const record = {
      id: '1', at: '2026-11-23T00:00:00.000Z', tool: 'Ping', target: 'example.com',
      source: 'Local Agent', status: 'ok' as const, result: { raw: 'Reply from example.com\r\nTime = 5 ms' },
    }
    const formatted = formatRecord(record)
    expect(JSON.parse(formatted)).toMatchObject({ target: 'example.com', source: 'Local Agent', result: { raw: 'Reply from example.com\r\nTime = 5 ms' } })
    expect(getCopyText(record)).toBe('Reply from example.com\r\nTime = 5 ms')
    expect(JSON.parse(getCopyText({ ...record, result: { status: 200 } })).result).toEqual({ status: 200 })
  })
  it('accepts bounded TCP port lists and ranges', () => {
    expect(commonPorts).toHaveLength(20)
    expect(parseScanPorts('443,22,8000-8002,443')).toEqual([22, 443, 8000, 8001, 8002])
    for (const input of ['', '0', '65536', '1-100', '1,2;3', '32-30']) {
      expect(() => parseScanPorts(input)).toThrow()
    }
  })
  it('copies a port scan as readable text', () => {
    const text = getCopyText({
      id: '2', at: '2026-11-23T00:00:00.000Z', tool: 'Quét Port', target: 'example.com',
      source: 'Local Agent', status: 'ok',
      result: { resolvedIp: '192.0.2.1', openCount: 1, ports: [{ port: 443, service: 'HTTPS', state: 'open', durationMs: 4 }] },
    })
    expect(text).toContain('443\tHTTPS\topen\t4')
    expect(text).not.toContain('"port":')
  })
  it('copies only a valid public IP, never the JSON wrapper or extra fields', () => {
    const record = {
      id: 'ip', at: '2026-11-23T00:00:00Z', tool: 'IP Public', target: 'Đường truyền hiện tại',
      source: 'ipify', status: 'ok' as const,
      result: { ip: '118.69.52.166', extra: 'DO-NOT-COPY' },
    }
    expect(getCopyText(record)).toBe('118.69.52.166')
    expect(getCopyText({ ...record, result: { ip: '2001:db8::1' } })).toBe('2001:db8::1')
    expect(getCopyText({ ...record, result: { ip: '118.69.52.166;other' } })).toBe('')
    expect(publicIP({ ip: '999.69.52.166' })).toBeNull()
    expect(getCopyText({ ...record, result: {} })).toBe('')
  })
})
