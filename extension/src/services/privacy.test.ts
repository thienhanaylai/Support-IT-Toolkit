import { describe, expect, it, vi } from 'vitest'
import { renderReportHTML } from './report'
import { getHistory, maxHistoryRecords, redactSensitive, saveRecord, saveRecords, type CheckRecord } from './storage'

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
    const set = vi.fn(async (_value: Record<string, unknown>) => {})
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

  it('saves notification history in a batch and keeps only the latest 50 records', async () => {
    const existing = Array.from({ length: 49 }, (_, index): CheckRecord => ({
      id: `old-${index}`,
      at: `2026-11-27T00:${String(index).padStart(2, '0')}:00Z`,
      tool: 'Old',
      target: String(index),
      source: 'Test',
      status: 'ok',
      result: {},
    }))
    const set = vi.fn(async (_value: Record<string, unknown>) => {})
    vi.stubGlobal('chrome', { storage: { local: {
      get: vi.fn(async (key: string) => key === 'settings'
        ? { settings: { saveHistory: true } }
        : { history: existing }),
      set,
    } } })
    await saveRecords([
      { ...record, id: 'monitor-1', tool: 'Theo dõi Ticket' },
      { ...record, id: 'monitor-2', tool: 'Computing triển khai lỗi' },
    ])
    const saved = set.mock.calls[0]?.[0] as { history: CheckRecord[] }
    expect(saved.history).toHaveLength(maxHistoryRecords)
    expect(saved.history.slice(0, 2).map((item) => item.id)).toEqual(['monitor-1', 'monitor-2'])
    vi.unstubAllGlobals()
  })
})
