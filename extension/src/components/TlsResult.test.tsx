import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Result } from './Result'
import { TlsResult } from './TlsResult'
import type { CheckRecord } from '../services/storage'

const result = {
  success: true, action: 'tls_check', host: 'example.com', port: 443,
  verified: true, tlsVersion: 'TLS 1.3',
  subject: 'CN=example.com,O=Example', issuer: 'CN=Test CA',
  notBefore: '2026-01-01T00:00:00Z', notAfter: '2027-01-01T00:00:00Z',
  dnsNames: ['example.com', 'www.example.com'],
  chain: [
    { subject: 'CN=example.com', issuer: 'CN=Test CA', notBefore: '2026-01-01T00:00:00Z', notAfter: '2027-01-01T00:00:00Z' },
    { subject: 'CN=Test CA', issuer: 'CN=Root CA', notBefore: '2025-01-01T00:00:00Z', notAfter: '2030-01-01T00:00:00Z' },
  ],
}
const record: CheckRecord = {
  id: 'tls-test', at: '2026-11-23T00:00:00Z', tool: 'SSL / TLS',
  target: 'example.com', source: 'Local Agent', status: 'ok', result,
}

describe('SSL / TLS result', () => {
  it('shows certificate verification, dates, names and a collapsed chain instead of JSON', () => {
    const html = renderToStaticMarkup(createElement(Result, { record }))
    expect(html).toContain('Xác minh thành công')
    expect(html).toContain('TLS 1.3')
    expect(html).toContain('HẾT HẠN VÀO')
    expect(html).toContain('CN=example.com,O=Example')
    expect(html).toContain('www.example.com')
    expect(html).toContain('<details class="tls-chain"><summary>Chuỗi chứng chỉ (2)</summary>')
    expect(html).not.toContain('<pre>')
    expect(html).not.toContain('&quot;verified&quot;')
  })

  it('shows the verification error without trusting certificate text as HTML', () => {
    const html = renderToStaticMarkup(createElement(TlsResult, {
      result: { ...result, verified: false, verificationError: '<script>alert(1)</script>', subject: '<img src=x onerror=alert(1)>' },
    }))
    expect(html).toContain('Không xác minh được')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
  })

  it('does not claim success for missing fields and keeps extra SANs expandable', () => {
    const missing = renderToStaticMarkup(createElement(TlsResult, { result: {} }))
    expect(missing).toContain('Chưa có dữ liệu xác minh')
    expect(missing).not.toContain('Xác minh thành công')
    expect(missing).not.toContain('tls-chain')

    const names = Array.from({ length: 7 }, (_, index) => `host${index}.example.com`)
    const html = renderToStaticMarkup(createElement(TlsResult, { result: { dnsNames: names, notAfter: 'invalid date' } }))
    expect(html).toContain('Xem thêm 1 tên miền')
    expect(html).toContain('host6.example.com')
    expect(html).toContain('invalid date')
  })
})
