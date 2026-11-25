// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { Authenticator } from './Authenticator'

afterEach(() => {
  vi.unstubAllGlobals()
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
  expect(document.querySelectorAll('.auth-card')).toHaveLength(2)
  expect(document.body.textContent).toContain('LONGVAN-ADMIN')
  expect(document.body.textContent).toContain('Đã thêm 2 Authenticator')
  expect(document.querySelector('.auth-toast[role="status"]')).not.toBeNull()
  expect(document.querySelector('.auth-message')).toBeNull()
  expect(document.querySelector('.auth-order')).toBeNull()
  const cards = [...document.querySelectorAll<HTMLElement>('.auth-card')]
  const handle = cards[0].querySelector<HTMLButtonElement>('.auth-drag-handle')!
  const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), setDragImage: vi.fn() }
  const dragStart = new Event('dragstart', { bubbles: true, cancelable: true })
  Object.defineProperty(dragStart, 'dataTransfer', { value: dataTransfer })
  handle.dispatchEvent(dragStart)
  expect(cards[0].querySelector('.auth-card-title')?.firstElementChild).toBe(handle)
  expect(dataTransfer.setDragImage).toHaveBeenCalledWith(cards[0], 18, 18)
  Object.defineProperty(cards[1], 'getBoundingClientRect', {
    value: () => ({ top: 0, height: 100, bottom: 100, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) }),
  })
  const dragOver = new Event('dragover', { bubbles: true, cancelable: true })
  Object.defineProperties(dragOver, { dataTransfer: { value: dataTransfer }, clientY: { value: 75 } })
  cards[1].dispatchEvent(dragOver)
  await vi.waitFor(() => expect(cards[1].classList.contains('is-drop-after')).toBe(true))
  const drop = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer })
  cards[1].dispatchEvent(drop)
  await vi.waitFor(() => expect(document.querySelector('.auth-card-title')?.textContent).toContain('LONGVAN-ADMIN'))
  expect(document.body.textContent).toContain('Đã cập nhật thứ tự Authenticator')
  document.querySelector<HTMLElement>('.auth-card')!.click()
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^\d{6}$/)))
  expect(JSON.stringify(storage)).not.toContain('JBSWY3DPEHPK3PXP')
})
