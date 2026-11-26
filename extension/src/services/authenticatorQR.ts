import jsQR from 'jsqr'
import {
  loadAuthenticatorEntries, parseAuthenticatorURI, saveAuthenticatorEntries,
} from './authenticator'

export type AuthenticatorQRRegion = {
  x: number
  y: number
  width: number
  height: number
  viewportWidth: number
  viewportHeight: number
}

export const authenticatorQRPickerKey = 'authenticatorQRPicker'

function validRegion(value: unknown): value is AuthenticatorQRRegion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const region = value as Partial<AuthenticatorQRRegion>
  return [region.x, region.y, region.width, region.height, region.viewportWidth, region.viewportHeight]
    .every((item) => Number.isFinite(item)) &&
    region.x! >= 0 && region.y! >= 0 && region.width! >= 20 && region.height! >= 20 &&
    region.viewportWidth! > 0 && region.viewportHeight! > 0 &&
    region.x! + region.width! <= region.viewportWidth! + 1 &&
    region.y! + region.height! <= region.viewportHeight! + 1
}

export async function importAuthenticatorFromScreenshot(
  dataURL: string,
  region: AuthenticatorQRRegion,
): Promise<string> {
  if (!dataURL.startsWith('data:image/') || !validRegion(region)) {
    throw new Error('Vùng quét QR không hợp lệ.')
  }
  const bitmap = await createImageBitmap(await (await fetch(dataURL)).blob())
  try {
    const ratioX = bitmap.width / region.viewportWidth
    const ratioY = bitmap.height / region.viewportHeight
    const paddingX = 12 * ratioX
    const paddingY = 12 * ratioY
    const sourceX = Math.max(0, Math.floor(region.x * ratioX - paddingX))
    const sourceY = Math.max(0, Math.floor(region.y * ratioY - paddingY))
    const sourceRight = Math.min(bitmap.width, Math.ceil((region.x + region.width) * ratioX + paddingX))
    const sourceBottom = Math.min(bitmap.height, Math.ceil((region.y + region.height) * ratioY + paddingY))
    const width = Math.max(1, sourceRight - sourceX)
    const height = Math.max(1, sourceBottom - sourceY)
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Không thể đọc vùng ảnh QR.')
    context.drawImage(bitmap, sourceX, sourceY, width, height, 0, 0, width, height)
    const image = context.getImageData(0, 0, width, height)
    const decoded = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })
    if (!decoded?.data) {
      throw new Error('Không tìm thấy mã QR trong vùng đã chọn. Hãy chọn sát mã QR và giữ đủ bốn góc.')
    }
    const entry = parseAuthenticatorURI(decoded.data)
    const entries = await loadAuthenticatorEntries()
    if (entries.some((saved) => saved.secret === entry.secret &&
      saved.issuer === entry.issuer && saved.label === entry.label)) {
      throw new Error('Tài khoản Authenticator này đã tồn tại.')
    }
    if (entries.length >= 100) throw new Error('Kho Authenticator chỉ lưu tối đa 100 tài khoản.')
    await saveAuthenticatorEntries([...entries, entry])
    return `Đã thêm ${entry.issuer || entry.label}.`
  } finally {
    bitmap.close()
  }
}

// This function is serialized by chrome.scripting.executeScript. Keep it self-contained.
export function showAuthenticatorQRRegionPicker(token: string): void {
  type PickerGlobal = typeof globalThis & { __itSupportQRPickerCleanup?: () => void }
  const pickerGlobal = globalThis as PickerGlobal
  pickerGlobal.__itSupportQRPickerCleanup?.()

  const root = document.createElement('div')
  root.id = 'it-support-qr-region-picker'
  Object.assign(root.style, {
    position: 'fixed', inset: '0', zIndex: '2147483647', cursor: 'crosshair',
    background: 'rgba(3, 12, 14, .48)', userSelect: 'none',
  })
  const selection = document.createElement('div')
  Object.assign(selection.style, {
    display: 'none', position: 'fixed', zIndex: '2147483647', border: '3px solid #35e6ad',
    borderRadius: '6px', background: 'transparent',
    boxShadow: '0 0 0 9999px rgba(3, 12, 14, .55)', pointerEvents: 'none',
  })
  const instruction = document.createElement('div')
  instruction.textContent = 'Kéo chuột khoanh vùng toàn bộ mã QR · Nhấn Esc để hủy'
  Object.assign(instruction.style, {
    position: 'fixed', top: '18px', left: '50%', zIndex: '2147483647',
    transform: 'translateX(-50%)', maxWidth: 'calc(100vw - 32px)', padding: '10px 15px',
    border: '1px solid #55e8b8', borderRadius: '8px', background: '#102522',
    color: '#eafff7', boxShadow: '0 8px 28px rgba(0,0,0,.4)',
    font: '700 13px/1.4 Segoe UI, sans-serif', textAlign: 'center', pointerEvents: 'none',
  })
  root.append(selection, instruction)
  document.documentElement.append(root)

  let selecting = false
  let finished = false
  let startX = 0
  let startY = 0

  const showToast = (message: string, success: boolean) => {
    document.getElementById('it-support-qr-result')?.remove()
    const toast = document.createElement('div')
    toast.id = 'it-support-qr-result'
    toast.textContent = message
    Object.assign(toast.style, {
      position: 'fixed', top: '18px', left: '50%', zIndex: '2147483647',
      transform: 'translateX(-50%)', maxWidth: 'calc(100vw - 32px)', padding: '11px 16px',
      border: `1px solid ${success ? '#55e8b8' : '#ff9e91'}`, borderRadius: '8px',
      background: success ? '#123b31' : '#4a211d', color: success ? '#dffff3' : '#ffe7e3',
      boxShadow: '0 8px 28px rgba(0,0,0,.4)', font: '700 13px/1.4 Segoe UI, sans-serif',
      textAlign: 'center',
    })
    document.documentElement.append(toast)
    window.setTimeout(() => toast.remove(), success ? 2600 : 4500)
  }
  const cleanup = (cancelled: boolean) => {
    window.removeEventListener('mousemove', onMouseMove, true)
    window.removeEventListener('mouseup', onMouseUp, true)
    window.removeEventListener('keydown', onKeyDown, true)
    root.remove()
    if (pickerGlobal.__itSupportQRPickerCleanup === cancelFromReplacement) {
      delete pickerGlobal.__itSupportQRPickerCleanup
    }
    if (cancelled) {
      void chrome.runtime.sendMessage({ type: 'toolkit:cancel-auth-qr-region', token }).catch(() => {})
    }
  }
  const cancelFromReplacement = () => {
    if (finished) return
    finished = true
    cleanup(true)
  }
  const updateSelection = (clientX: number, clientY: number) => {
    const x = Math.max(0, Math.min(startX, clientX))
    const y = Math.max(0, Math.min(startY, clientY))
    const right = Math.min(window.innerWidth, Math.max(startX, clientX))
    const bottom = Math.min(window.innerHeight, Math.max(startY, clientY))
    Object.assign(selection.style, {
      display: 'block', left: `${x}px`, top: `${y}px`,
      width: `${Math.max(0, right - x)}px`, height: `${Math.max(0, bottom - y)}px`,
    })
  }
  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || finished) return
    event.preventDefault()
    event.stopPropagation()
    selecting = true
    startX = Math.max(0, Math.min(window.innerWidth, event.clientX))
    startY = Math.max(0, Math.min(window.innerHeight, event.clientY))
    root.style.background = 'transparent'
    updateSelection(startX, startY)
  }
  const onMouseMove = (event: MouseEvent) => {
    if (!selecting || finished) return
    event.preventDefault()
    event.stopPropagation()
    updateSelection(event.clientX, event.clientY)
  }
  const onMouseUp = (event: MouseEvent) => {
    if (!selecting || event.button !== 0 || finished) return
    event.preventDefault()
    event.stopPropagation()
    selecting = false
    const x = Math.max(0, Math.min(startX, event.clientX))
    const y = Math.max(0, Math.min(startY, event.clientY))
    const right = Math.min(window.innerWidth, Math.max(startX, event.clientX))
    const bottom = Math.min(window.innerHeight, Math.max(startY, event.clientY))
    const width = right - x
    const height = bottom - y
    if (width < 20 || height < 20) {
      selection.style.display = 'none'
      root.style.background = 'rgba(3, 12, 14, .48)'
      instruction.textContent = 'Vùng quá nhỏ. Hãy kéo khung bao quanh toàn bộ mã QR · Esc để hủy'
      return
    }
    finished = true
    cleanup(false)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      void chrome.runtime.sendMessage({
        type: 'toolkit:complete-auth-qr-region',
        token,
        region: {
          x, y, width, height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        },
      }).then((response: { success?: boolean; message?: string; error?: string } | undefined) => {
        showToast(response?.message || response?.error || 'Không thể quét vùng QR.', response?.success === true)
      }).catch(() => showToast('Không thể gửi vùng QR tới extension.', false))
    }))
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || finished) return
    event.preventDefault()
    event.stopPropagation()
    finished = true
    cleanup(true)
  }

  root.addEventListener('mousedown', onMouseDown, true)
  window.addEventListener('mousemove', onMouseMove, true)
  window.addEventListener('mouseup', onMouseUp, true)
  window.addEventListener('keydown', onKeyDown, true)
  pickerGlobal.__itSupportQRPickerCleanup = cancelFromReplacement
}
