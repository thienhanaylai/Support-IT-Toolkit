import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CheckRequest } from '../services/work'

const { runCheck } = vi.hoisted(() => ({ runCheck: vi.fn() }))
vi.mock('../services/checks', () => ({ runCheck }))

const request: CheckRequest = {
  tool: 'ping', input: 'example.com', port: 443, scanPorts: [80], mxCommand: 'dns',
  pingCount: 4, maxHops: 20,
}

let receive: (message: unknown, sender: unknown, respond: (value: unknown) => void) => boolean
let stored: Record<string, unknown>

function send(message: unknown): Promise<{ job?: { status: string; progress: { text: string }[]; record?: unknown }; error?: string }> {
  return new Promise((resolve) => {
    receive(message, {}, (value) => resolve(value as Awaited<ReturnType<typeof send>>))
  })
}

beforeEach(() => {
  stored = {}
  vi.stubGlobal('crypto', { randomUUID: () => 'job-1' })
  vi.stubGlobal('chrome', {
    runtime: { onMessage: { addListener: (listener: typeof receive) => { receive = listener } } },
    storage: { session: {
      get: vi.fn(async () => ({ ...stored })),
      set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(stored, items) }),
    } },
  })
  runCheck.mockReset()
})
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

describe('checks survive closing the popup', () => {
  it('keeps progress and final results in session storage while the popup is closed', async () => {
    let finish!: (record: unknown) => void
    runCheck.mockImplementation((_tool: unknown, _input: unknown, _port: unknown, _ports: unknown,
      _command: unknown, _count: unknown, _hops: unknown, progress: (value: { text: string }) => void) => {
      progress({ text: 'Đang quét 1/2' })
      return new Promise((resolve) => { finish = resolve })
    })
    const { registerJobs } = await import('./jobs')
    registerJobs()
    expect((await send({ type: 'toolkit:start-job', request })).job?.status).toBe('running')
    await vi.waitFor(() => expect((stored.currentCheck as { progress: unknown[] }).progress).toHaveLength(1))
    expect((await send({ type: 'toolkit:get-job' })).job?.progress[0]?.text).toBe('Đang quét 1/2')
    const record = { id: 'check-1', tool: 'Ping', result: { success: true } }
    finish(record)
    await vi.waitFor(() => expect((stored.currentCheck as { status: string }).status).toBe('done'))
    expect((await send({ type: 'toolkit:get-job' })).job?.record).toEqual(record)
  })

  it('rejects a second job instead of overwriting the running check', async () => {
    runCheck.mockImplementation(() => new Promise(() => {}))
    const { registerJobs } = await import('./jobs')
    registerJobs()
    await send({ type: 'toolkit:start-job', request })
    expect((await send({ type: 'toolkit:start-job', request })).error).toContain('Đang có kiểm tra')
  })

  it('marks a lost service-worker task as interrupted rather than leaving an endless spinner', async () => {
    stored.currentCheck = { id: 'old-job', tool: 'ping', status: 'running', progress: [{ text: '1/2' }] }
    const { registerJobs } = await import('./jobs')
    registerJobs()
    const response = await send({ type: 'toolkit:get-job' })
    expect(response.job?.status).toBe('interrupted')
    expect(response.job?.progress).toEqual([{ text: '1/2' }])
  })

  it('saves errors so they are still visible after reopening the popup', async () => {
    runCheck.mockRejectedValue(new Error('Agent bị ngắt'))
    const { registerJobs } = await import('./jobs')
    registerJobs()
    await send({ type: 'toolkit:start-job', request })
    await vi.waitFor(() => expect((stored.currentCheck as { status: string }).status).toBe('error'))
    expect((stored.currentCheck as { error: string }).error).toBe('Agent bị ngắt')
  })
})
