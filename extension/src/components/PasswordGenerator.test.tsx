// @vitest-environment jsdom
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { passwordRecentKey } from '../services/passwordGenerator'
import { PasswordGenerator } from './PasswordGenerator'

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })

it('copies generated passwords and keeps only the three most recent in session storage', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  const set = vi.fn(async (_value: Record<string, string[]>) => {})
  const writeText = vi.fn(async (_value: string) => {})
  vi.stubGlobal('chrome', { storage: { session: { get: vi.fn(async () => ({})), set } } })
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  const root = createRoot(document.getElementById('root')!)
  await act(async () => root.render(<PasswordGenerator />))

  const generate = () => document.querySelector<HTMLButtonElement>('.password-generate')!
  for (let index = 0; index < 4; index++) {
    await act(async () => generate().click())
  }
  await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(4))
  const lastSaved = set.mock.calls.at(-1)![0]
  expect(lastSaved[passwordRecentKey]).toHaveLength(3)
  expect(document.querySelector('.password-recent')).toBeNull()
  const history = document.querySelector<HTMLButtonElement>('.password-history-toggle')!
  expect(history.textContent).toContain('Lịch sử (3)')
  await act(async () => history.click())
  expect(document.querySelectorAll('.password-recent>div')).toHaveLength(3)
  expect(document.querySelector('.password-result code')?.textContent).not.toMatch(/^•+$/)
  expect([...document.querySelectorAll('.password-recent code')].every((node) => !/^•+$/.test(node.textContent ?? ''))).toBe(true)

  const current = document.querySelector('.password-result code')!.getAttribute('aria-label')
  expect(current).toBe('Mật khẩu vừa tạo')
  const copy = document.querySelector<HTMLButtonElement>('.password-result button[aria-label="Sao chép mật khẩu"]')!
  await act(async () => copy.click())
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce())
  expect(writeText.mock.calls[0][0].length).toBe(16)
  expect(copy.textContent).toContain('Đã chép')
  await act(async () => root.unmount())
})

it('restores at most three recent passwords from the current browser session', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  vi.stubGlobal('chrome', { storage: { session: {
    get: vi.fn(async () => ({ [passwordRecentKey]: ['one', 'two', 'three', 'four'] })),
    set: vi.fn(async () => {}),
  } } })
  const root = createRoot(document.getElementById('root')!)
  await act(async () => root.render(<PasswordGenerator />))
  await vi.waitFor(() => expect(document.querySelector('.password-history-toggle')).not.toBeNull())
  expect(document.querySelector('.password-recent')).toBeNull()
  await act(async () => document.querySelector<HTMLButtonElement>('.password-history-toggle')!.click())
  expect(document.querySelectorAll('.password-recent>div')).toHaveLength(3)
  expect(document.body.textContent).not.toContain('four')
  await act(async () => root.unmount())
})
