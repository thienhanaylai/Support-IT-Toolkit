import { afterEach, expect, it, vi } from 'vitest'
import { runBrowserTool } from './browser-engine'

afterEach(() => vi.unstubAllGlobals())

it('keeps Browser Engine independent from Native Messaging', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '203.0.113.10' })))
  await expect(runBrowserTool('public_ip', { timeoutMs: 3_000 })).resolves.toMatchObject({ ip: '203.0.113.10' })
})
