// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); document.body.innerHTML = '' })

it('offers one-time Portal access without Agent installation instructions', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  let allowed = false
  const request = vi.fn(async () => { allowed = true; return true })
  vi.stubGlobal('chrome', {
    runtime: { id: 'abcdefghijklmnopabcdefghijklmnop' },
    permissions: { contains: vi.fn(async () => allowed), request },
  })
  await import('./main')
  await vi.waitFor(() => expect(document.body.textContent).toContain('Bản Browser-only'))
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
  expect(document.querySelector('#extension-id')).toBeNull()
  expect(document.querySelectorAll('a[href*="Agent"]')).toHaveLength(0)
  expect(document.body.textContent).toContain('không cần Local Agent')
  expect(document.body.textContent).toContain('Không có chương trình native')
})
