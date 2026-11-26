import { afterEach, expect, it, vi } from 'vitest'
import {
  hasPortalAccess, isPortalPageUrl, portalOriginPattern, removePortalAccess, requestPortalAccess,
} from './portalAccess'

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

it('allows OTP lookup on any Portal page but not lookalike origins', () => {
  expect(isPortalPageUrl('https://portal.longvan.vn/cloud-service-manager/manager/web-hosting-service-detail.xhtml?id=1')).toBe(true)
  expect(isPortalPageUrl('https://portal.longvan.vn/computing-manager/manager/computing/computing_detail.xhtml?id=1')).toBe(true)
  expect(isPortalPageUrl('https://portal.longvan.vn.evil.test/cloud-service-manager/manager/web-hosting-service-detail.xhtml')).toBe(false)
  expect(isPortalPageUrl('http://portal.longvan.vn/cloud-service-manager/manager/web-hosting-service-detail.xhtml')).toBe(false)
  expect(isPortalPageUrl('not a url')).toBe(false)
})
