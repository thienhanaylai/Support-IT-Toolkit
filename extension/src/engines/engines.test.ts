import { afterEach, expect, it, vi } from 'vitest'
import { runBrowserTool } from './browser-engine'
import { runNativeTool } from './native-engine'

afterEach(() => vi.unstubAllGlobals())

it('keeps Browser Engine independent from Native Messaging', async () => {
  const sendNativeMessage = vi.fn()
  vi.stubGlobal('chrome', { runtime: { sendNativeMessage } })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '203.0.113.10' })))
  await expect(runBrowserTool('public_ip', { timeoutMs: 3_000 })).resolves.toMatchObject({ ip: '203.0.113.10' })
  expect(sendNativeMessage).not.toHaveBeenCalled()
})

it('keeps the existing Native Messaging request contract behind Native Engine', async () => {
  const sendNativeMessage = vi.fn(async () => ({ success: true, target: 'example.com', open: true }))
  vi.stubGlobal('chrome', { runtime: { sendNativeMessage } })
  await expect(runNativeTool('tcp_check', { target: 'example.com', port: 443 }))
    .resolves.toMatchObject({ success: true, open: true })
  expect(sendNativeMessage).toHaveBeenCalledWith('com.itsupport.toolkit', {
    action: 'tcp_check', target: 'example.com', port: 443,
  })
})
