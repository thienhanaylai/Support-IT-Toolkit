// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import jsQR from 'jsqr'
import { importAuthenticatorFromScreenshot, showAuthenticatorQRRegionPicker } from './authenticatorQR'

vi.mock('jsqr', () => ({ default: vi.fn() }))

afterEach(() => {
  document.getElementById('it-support-qr-region-picker')?.remove()
  document.getElementById('it-support-qr-result')?.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.mocked(jsQR).mockReset()
})

it('crops the selected browser region, decodes its QR and stores the TOTP encrypted', async () => {
  const storage: Record<string, unknown> = {}
  const bitmap = { width: 1000, height: 500, close: vi.fn() }
  const drawImage = vi.fn()
  const context = {
    drawImage,
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(448 * 248 * 4), width: 448, height: 248,
    })),
  }
  const canvasCreated = vi.fn()
  class TestOffscreenCanvas {
    constructor(width: number, height: number) { canvasCreated(width, height) }
    getContext() { return context }
  }
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => key in storage ? { [key]: storage[key] } : {}),
        set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(storage, values) }),
      },
    },
  })
  vi.stubGlobal('fetch', vi.fn(async () => ({
    blob: async () => new Blob(['screenshot'], { type: 'image/png' }),
  })))
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
  vi.stubGlobal('OffscreenCanvas', TestOffscreenCanvas)
  vi.mocked(jsQR).mockReturnValue({
    data: 'otpauth://totp/Screen:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Screen',
  } as ReturnType<typeof jsQR>)

  const message = await importAuthenticatorFromScreenshot('data:image/png;base64,dGVzdA==', {
    x: 100, y: 50, width: 200, height: 100, viewportWidth: 500, viewportHeight: 250,
  })

  expect(canvasCreated).toHaveBeenCalledWith(448, 248)
  expect(drawImage).toHaveBeenCalledWith(bitmap, 176, 76, 448, 248, 0, 0, 448, 248)
  expect(jsQR).toHaveBeenCalledOnce()
  expect(message).toBe('Đã thêm Screen.')
  expect(bitmap.close).toHaveBeenCalledOnce()
  expect(storage).toHaveProperty('authenticatorVault')
  expect(JSON.stringify(storage)).not.toContain('JBSWY3DPEHPK3PXP')
})

it('lets the user drag a QR rectangle on the active tab and sends its viewport coordinates', async () => {
  const sendMessage = vi.fn(async (message: { type?: string }) =>
    message.type === 'toolkit:complete-auth-qr-region'
      ? { success: true, message: 'Đã thêm Screen.' }
      : { cancelled: true })
  vi.stubGlobal('chrome', { runtime: { sendMessage } })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })

  showAuthenticatorQRRegionPicker('region-token')
  const picker = document.getElementById('it-support-qr-region-picker')!
  expect(picker).not.toBeNull()
  picker.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true, cancelable: true, button: 0, clientX: 100, clientY: 120,
  }))
  window.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true, cancelable: true, button: 0, clientX: 320, clientY: 360,
  }))
  window.dispatchEvent(new MouseEvent('mouseup', {
    bubbles: true, cancelable: true, button: 0, clientX: 320, clientY: 360,
  }))

  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({
    type: 'toolkit:complete-auth-qr-region',
    token: 'region-token',
    region: {
      x: 100, y: 120, width: 220, height: 240,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
    },
  }))
  expect(document.getElementById('it-support-qr-region-picker')).toBeNull()
  await vi.waitFor(() => expect(document.getElementById('it-support-qr-result')?.textContent)
    .toBe('Đã thêm Screen.'))
})
