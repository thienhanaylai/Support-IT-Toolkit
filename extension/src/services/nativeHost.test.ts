import { afterEach, describe, expect, it, vi } from 'vitest'
import { nativeRequest } from './nativeHost'

function nativePort() {
  const messages = new Set<(message: Record<string, unknown>) => void>()
  const disconnects = new Set<() => void>()
  return {
    onMessage: { addListener: (fn: (message: Record<string, unknown>) => void) => messages.add(fn),
      removeListener: (fn: (message: Record<string, unknown>) => void) => messages.delete(fn) },
    onDisconnect: { addListener: (fn: () => void) => disconnects.add(fn),
      removeListener: (fn: () => void) => disconnects.delete(fn) },
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    emit: (message: Record<string, unknown>) => { for (const fn of messages) fn(message) },
    drop: () => { for (const fn of disconnects) fn() },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('Native Messaging streaming', () => {
  it('receives multiple progress messages before the final response and closes the port', async () => {
    const port = nativePort()
    vi.stubGlobal('chrome', { runtime: { connectNative: () => port } })
    const progress = vi.fn()
    const pending = nativeRequest('port_scan', { target: '127.0.0.1', ports: [80, 443] }, progress)
    expect(port.postMessage).toHaveBeenCalledWith({ action: 'port_scan', target: '127.0.0.1', ports: [80, 443], stream: true })
    port.emit({ type: 'progress', text: 'Cổng 80: closed', completed: 1, total: 2 })
    port.emit({ type: 'progress', text: 'Cổng 443: open', completed: 2, total: 2 })
    expect(progress).toHaveBeenCalledTimes(2)
    expect(progress).toHaveBeenLastCalledWith({ text: 'Cổng 443: open', completed: 2, total: 2 })
    port.emit({ success: true, ports: [{ port: 443, state: 'open' }] })
    expect(await pending).toMatchObject({ success: true, ports: [{ port: 443, state: 'open' }] })
    expect(port.disconnect).toHaveBeenCalledOnce()
    port.drop()
    expect(progress).toHaveBeenCalledTimes(2)
  })

  it('reports an interrupted connection rather than treating progress as success', async () => {
    const port = nativePort()
    vi.stubGlobal('chrome', { runtime: { connectNative: () => port, lastError: { message: 'Host crashed' } } })
    const pending = nativeRequest('ping', { target: '127.0.0.1' }, vi.fn())
    port.emit({ type: 'progress', text: 'Reply from 127.0.0.1' })
    port.drop()
    await expect(pending).rejects.toThrow('Host crashed')
  })

  it('still accepts a single final response from an older installed Agent', async () => {
    const port = nativePort()
    vi.stubGlobal('chrome', { runtime: { connectNative: () => port } })
    const progress = vi.fn()
    const pending = nativeRequest('ping', { target: '127.0.0.1' }, progress)
    port.emit({ success: true, raw: 'Reply from 127.0.0.1' })
    expect(await pending).toMatchObject({ success: true, raw: 'Reply from 127.0.0.1' })
    expect(progress).not.toHaveBeenCalled()
  })
})
