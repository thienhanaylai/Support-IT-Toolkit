export async function grantHost(url: string): Promise<void> {
  const origin = new URL(url).origin + '/*'
  if (!await chrome.permissions.contains({ origins: [origin] }) &&
      !await chrome.permissions.request({ origins: [origin] })) {
    throw new Error('Cần cấp quyền truy cập host để thực hiện kiểm tra này')
  }
}
