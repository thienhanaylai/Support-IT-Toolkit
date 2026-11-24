export const portalOriginPattern = 'https://portal.longvan.vn/*'

export async function hasPortalAccess(): Promise<boolean> {
  return chrome.permissions.contains({ origins: [portalOriginPattern] })
}

export async function requestPortalAccess(): Promise<boolean> {
  return chrome.permissions.request({ origins: [portalOriginPattern] })
}

export async function removePortalAccess(): Promise<boolean> {
  return chrome.permissions.remove({ origins: [portalOriginPattern] })
}
