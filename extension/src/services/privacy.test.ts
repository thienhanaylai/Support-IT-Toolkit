import { describe, expect, it, vi } from 'vitest'
import { renderReportHTML } from './report'
import { getHistory, redactSensitive, saveRecord, type CheckRecord } from './storage'

const record: CheckRecord = {
  id: 'privacy', at: '2026-11-24T00:00:00Z', tool: 'Test', target: 'example.com',
  source: 'Test', status: 'ok',
  result: {
    apiKey: 'key-must-not-leak',
    nested: { Authorization: 'auth-must-not-leak', password: 'password-must-not-leak', safe: 'visible' },
    list: [{ access_token: 'token-must-not-leak', address: '10.0.0.1' }],
  },
}

describe('sensitive field redaction', () => {
  it('recursively redacts credential fields while preserving diagnostic data', () => {
    const text = JSON.stringify(redactSensitive(record.result))
    expect(text).not.toMatch(/key-must|auth-must|password-must|token-must/)
    expect(text).toContain('visible')
    expect(text).toContain('10.0.0.1')
  })

  it('redacts credentials before saving history and when reading legacy history', async () => {
    const set = vi.fn(async () => {})
    vi.stubGlobal('chrome', { storage: { local: {
      get: vi.fn(async (key: string) => key === 'settings'
        ? { settings: { saveHistory: true } }
        : { history: [record] }),
      set,
    } } })
    await saveRecord(record)
    expect(JSON.stringify(set.mock.calls)).not.toMatch(/key-must|auth-must|password-must|token-must/)
    expect(JSON.stringify(await getHistory())).not.toMatch(/key-must|auth-must|password-must|token-must/)
    vi.unstubAllGlobals()
  })

  it('redacts credentials from exported HTML reports', () => {
    const html = renderReportHTML([record])
    expect(html).not.toMatch(/key-must|auth-must|password-must|token-must/)
    expect(html).toContain('visible')
  })
})
