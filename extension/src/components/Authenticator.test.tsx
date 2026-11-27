// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import jsQR from 'jsqr'
import { Authenticator } from './Authenticator'

vi.mock('jsqr', () => ({ default: vi.fn(() => null) }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.mocked(jsQR).mockReset()
  vi.mocked(jsQR).mockReturnValue(null)
  document.body.innerHTML = ''
})

it('adds an otpauth account, renders its current code and copies it when clicked', async () => {
  const storage: Record<string, unknown> = {}
  const writeText = vi.fn(async () => {})
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => key in storage ? { [key]: storage[key] } : {}),
        set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(storage, values) }),
      },
    },
  })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  document.body.innerHTML = '<div id="root"></div>'
  createRoot(document.getElementById('root')!).render(<Authenticator />)

  await vi.waitFor(() => expect([...document.querySelectorAll<HTMLButtonElement>('.auth-actions button')]
    .find((item) => item.textContent?.includes('Thêm'))).toBeDefined())
  const add = [...document.querySelectorAll<HTMLButtonElement>('.auth-actions button')]
    .find((item) => item.textContent?.includes('Thêm'))!
  expect(document.querySelector<HTMLInputElement>('.auth-file-input')?.accept)
    .toContain('.txt')
  expect(document.querySelector('.auth-actions')?.textContent).toContain('Import')
  add.click()
  const textarea = await vi.waitFor(() => {
    const input = document.querySelector<HTMLTextAreaElement>('#auth-uri')
    expect(input).not.toBeNull()
    return input!
  })
  const uri = [
    'otpauth://totp/LongVan:0917580860?secret=JBSWY3DPEHPK3PXP&issuer=LONGVAN-PT',
    'otpauth://totp/LongVan:admin?secret=KRUGS4ZANFZSAYJA&issuer=LONGVAN-ADMIN',
  ].join('\n')
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  setter.call(textarea, uri)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  textarea.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

  await vi.waitFor(() => {
    const value = document.querySelector<HTMLElement>('.auth-code-value')
    expect(value?.textContent).toMatch(/\d{6}/)
  })
  expect(document.querySelector('.auth-copy')).toBeNull()
  expect(document.querySelector('.auth-card-title')?.textContent).toContain('LONGVAN-PT')
  expect(document.querySelector('.auth-card-title')?.textContent).toContain('0917580860')
  expect(document.querySelector('.auth-card-title .auth-code-value')).not.toBeNull()
  expect(document.querySelector('.auth-heading')?.textContent).not.toContain('Mã TOTP được lưu mã hóa trên thiết bị')
  expect(document.querySelectorAll('.auth-card')).toHaveLength(2)
  expect(document.body.textContent).toContain('LONGVAN-ADMIN')
  expect(document.body.textContent).toContain('Đã thêm 2 Authenticator')
  expect(document.querySelector('.auth-toast[role="status"]')).not.toBeNull()
  expect(document.querySelector('.auth-message')).toBeNull()
  expect(document.querySelector('.auth-order')).toBeNull()
  const cards = [...document.querySelectorAll<HTMLElement>('.auth-card')]
  const list = document.querySelector<HTMLElement>('.auth-list')!
  Object.defineProperties(list, {
    scrollHeight: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 300 },
    getBoundingClientRect: {
      configurable: true,
      value: () => ({ top: 0, height: 300, bottom: 300, left: 0, right: 500, width: 500, x: 0, y: 0, toJSON: () => ({}) }),
    },
  })
  const handle = cards[0].querySelector<HTMLButtonElement>('.auth-drag-handle')!
  expect(handle.querySelector('svg')?.getAttribute('width')).toBe('23')
  Object.defineProperty(cards[0], 'getBoundingClientRect', {
    value: () => ({ top: 0, height: 70, bottom: 70, left: 0, right: 500, width: 500, x: 0, y: 0, toJSON: () => ({}) }),
  })
  Object.defineProperty(cards[1], 'getBoundingClientRect', {
    value: () => ({ top: 80, height: 100, bottom: 180, left: 0, right: 500, width: 500, x: 0, y: 80, toJSON: () => ({}) }),
  })
  const setPointerCapture = vi.fn()
  const releasePointerCapture = vi.fn()
  Object.defineProperties(handle, {
    setPointerCapture: { configurable: true, value: setPointerCapture },
    hasPointerCapture: { configurable: true, value: () => true },
    releasePointerCapture: { configurable: true, value: releasePointerCapture },
  })
  const pointerDown = new MouseEvent('pointerdown', {
    bubbles: true, cancelable: true, button: 0, clientX: 20, clientY: 30,
  })
  Object.defineProperty(pointerDown, 'pointerId', { value: 1 })
  handle.dispatchEvent(pointerDown)
  expect(cards[0].querySelector('.auth-card-title')?.firstElementChild).toBe(handle)
  expect(handle.draggable).toBe(false)
  expect(setPointerCapture).toHaveBeenCalledWith(1)
  expect(document.documentElement.classList.contains('auth-is-reordering')).toBe(true)
  expect(document.querySelector('.auth-drag-preview')).not.toBeNull()
  const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80 })
  document.dispatchEvent(wheel)
  expect(wheel.defaultPrevented).toBe(true)
  expect(list.scrollTop).toBe(80)
  const edgeMove = new MouseEvent('pointermove', {
    bubbles: true, cancelable: true, clientX: 20, clientY: 295,
  })
  Object.defineProperty(edgeMove, 'pointerId', { value: 1 })
  document.dispatchEvent(edgeMove)
  await vi.waitFor(() => expect(list.scrollTop).toBeGreaterThan(80))
  const targetMove = new MouseEvent('pointermove', {
    bubbles: true, cancelable: true, clientX: 20, clientY: 140,
  })
  Object.defineProperty(targetMove, 'pointerId', { value: 1 })
  document.dispatchEvent(targetMove)
  await vi.waitFor(() => expect(cards[1].classList.contains('is-drop-after')).toBe(true))
  const pointerUp = new MouseEvent('pointerup', {
    bubbles: true, cancelable: true, button: 0, clientX: 20, clientY: 140,
  })
  Object.defineProperty(pointerUp, 'pointerId', { value: 1 })
  document.dispatchEvent(pointerUp)
  await vi.waitFor(() => expect(document.querySelector('.auth-card-title')?.textContent).toContain('LONGVAN-ADMIN'))
  expect(document.body.textContent).toContain('Đã cập nhật thứ tự Authenticator')
  expect(releasePointerCapture).toHaveBeenCalledWith(1)
  expect(document.documentElement.classList.contains('auth-is-reordering')).toBe(false)
  expect(document.querySelector('.auth-drag-preview')).toBeNull()
  const editableCard = cards[0]
  const editButton = editableCard.querySelector<HTMLButtonElement>('.auth-edit')!
  const deleteButton = editableCard.querySelector<HTMLButtonElement>('.auth-delete')!
  expect(editButton.nextElementSibling).toBe(deleteButton)
  expect(editButton.getAttribute('aria-label')).toContain('LONGVAN-PT')
  editButton.click()
  const editForm = await vi.waitFor(() => {
    const form = editableCard.querySelector<HTMLFormElement>('.auth-edit-form')
    expect(form).not.toBeNull()
    return form!
  })
  const [issuerInput, labelInput] = [...editForm.querySelectorAll<HTMLInputElement>('input')]
  expect(issuerInput.value).toBe('LONGVAN-PT')
  expect(labelInput.value).toBe('0917580860')
  const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  inputSetter.call(issuerInput, 'LONGVAN-CLOUD')
  issuerInput.dispatchEvent(new Event('input', { bubbles: true }))
  inputSetter.call(labelInput, 'customer@example.com')
  labelInput.dispatchEvent(new Event('input', { bubbles: true }))
  editForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await vi.waitFor(() => expect(editableCard.textContent).toContain('LONGVAN-CLOUD'))
  expect(editableCard.textContent).toContain('customer@example.com')
  expect(editableCard.querySelector('.auth-edit-form')).toBeNull()
  expect(document.body.textContent).toContain('Đã cập nhật thông tin Authenticator')
  document.querySelector<HTMLElement>('.auth-card')!.click()
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^\d{6}$/)))
  expect(JSON.stringify(storage)).not.toContain('JBSWY3DPEHPK3PXP')
})

it('opens a QR region picker on the active tab without using a camera', async () => {
  const storage: Record<string, unknown> = {}
  const sendMessage = vi.fn(async () => ({ started: true }))
  const getUserMedia = vi.fn()
  const close = vi.spyOn(window, 'close').mockImplementation(() => {})
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('chrome', {
    runtime: { sendMessage },
    storage: {
      local: {
        get: vi.fn(async (key: string) => key in storage ? { [key]: storage[key] } : {}),
        set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(storage, values) }),
      },
    },
  })
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true, value: { getUserMedia },
  })

  document.body.innerHTML = '<main class="popup"><div id="root"></div></main>'
  createRoot(document.getElementById('root')!).render(<Authenticator />)
  const scan = await vi.waitFor(() => {
    const button = [...document.querySelectorAll<HTMLButtonElement>('.auth-actions button')]
      .find((item) => item.textContent?.includes('Chọn vùng QR'))
    expect(button).toBeDefined()
    return button!
  })
  scan.click()

  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'toolkit:start-auth-qr-region' }))
  expect(close).toHaveBeenCalledOnce()
  expect(jsQR).not.toHaveBeenCalled()
  expect(getUserMedia).not.toHaveBeenCalled()
  expect(document.querySelector('.auth-camera-backdrop')).toBeNull()
})
