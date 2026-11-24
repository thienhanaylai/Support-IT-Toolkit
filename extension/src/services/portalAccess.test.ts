import { afterEach, expect, it, vi } from 'vitest'
import { hasPortalAccess, portalOriginPattern, removePortalAccess, requestPortalAccess } from './portalAccess'

afterEach(() => vi.unstubAllGlobals())

it('uses only the Long Vân Portal origin for optional access', async () => {
  const contains = vi.fn(async () => true)
  const request = vi.fn(async () => true)
  const remove = vi.fn(async () => true)
  vi.stubGlobal('chrome', { permissions: { contains, request, remove } })
  expect(await hasPortalAccess()).toBe(true)
  expect(await requestPortalAccess()).toBe(true)
  expect(await removePortalAccess()).toBe(true)
  const expected = { origins: [portalOriginPattern] }
  expect(contains).toHaveBeenCalledWith(expected)
  expect(request).toHaveBeenCalledWith(expected)
  expect(remove).toHaveBeenCalledWith(expected)
})
