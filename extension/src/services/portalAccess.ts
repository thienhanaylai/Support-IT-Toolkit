export const portalOriginPattern = 'https://portal.longvan.vn/*'

export function isPortalPageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return !url.username && !url.password && url.origin === 'https://portal.longvan.vn'
  } catch {
    return false
  }
}

export async function hasPortalAccess(): Promise<boolean> {
  return chrome.permissions.contains({ origins: [portalOriginPattern] })
}

export async function requestPortalAccess(): Promise<boolean> {
  return chrome.permissions.request({ origins: [portalOriginPattern] })
}

export async function removePortalAccess(): Promise<boolean> {
  return chrome.permissions.remove({ origins: [portalOriginPattern] })
}
