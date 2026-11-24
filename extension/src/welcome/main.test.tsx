// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { agentZipURL } from '../services/agentDownload'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); document.body.innerHTML = '' })

it('offers one-time Portal access and shows only the complete Agent ZIP', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  let allowed = false
  const request = vi.fn(async () => { allowed = true; return true })
  vi.stubGlobal('chrome', {
    runtime: { id: 'abcdefghijklmnopabcdefghijklmnop' },
    permissions: { contains: vi.fn(async () => allowed), request },
  })
  await import('./main')
  await vi.waitFor(() => expect(document.querySelector('#extension-id')).not.toBeNull())
  const grant = await vi.waitFor(() => {
    const button = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((item) => item.textContent === 'Cấp quyền Portal')
    expect(button).not.toBeNull()
    expect(button?.disabled).toBe(false)
    return button!
  })
  grant.click()
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith({ origins: ['https://portal.longvan.vn/*'] }))
  await vi.waitFor(() => expect(document.body.textContent).toContain('Đã cấp quyền Portal'))
  expect((document.querySelector('#extension-id') as HTMLInputElement).value).toBe(chrome.runtime.id)
  expect(document.querySelector(`a[href="${agentZipURL}"]`)).not.toBeNull()
  expect(document.querySelectorAll('a[href*="github.com/thienhanaylai/Support-IT-Toolkit/releases/download"]')).toHaveLength(1)
  expect(document.body.textContent).toContain('giải nén toàn bộ ZIP')
  expect(document.body.textContent).toContain('Không di chuyển hoặc chạy riêng file này')
  expect(document.body.textContent).toContain('cần Local Agent')
})
