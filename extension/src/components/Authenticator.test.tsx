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
  document.querySelector<HTMLButtonElement>('.auth-card .auth-order[title="Đưa xuống"]')!.click()
  await vi.waitFor(() => expect(document.querySelector('.auth-card-title')?.textContent).toContain('LONGVAN-ADMIN'))
  expect(document.body.textContent).toContain('Đã cập nhật thứ tự Authenticator')
  document.querySelector<HTMLElement>('.auth-card')!.click()
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^\d{6}$/)))
  expect(JSON.stringify(storage)).not.toContain('JBSWY3DPEHPK3PXP')
})
