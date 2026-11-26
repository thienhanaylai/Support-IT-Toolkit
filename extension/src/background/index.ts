import { registerJobs } from './jobs'
import {
  buildVmName, copyServiceConfig, isPortalCreateUrl, isPortalVmConfig,
  pasteServiceConfig, portalVmConfigKey,
} from '../services/portalVmConfig'
import { isPortalPageUrl, portalOriginPattern } from '../services/portalAccess'
import {
  generatePassword, normalizePasswordOptions, passwordOptionsKey, passwordRecentKey,
} from '../services/passwordGenerator'
import { formatVMInfo, getVMInfoFromTab, isPortalVMUrl } from '../services/vmInfo'
import {
  authenticatorRemainingSeconds, generateAuthenticatorCode, loadAuthenticatorEntries,
} from '../services/authenticator'
import {
  authenticatorQRPickerKey, importAuthenticatorFromScreenshot,
  showAuthenticatorQRRegionPicker, type AuthenticatorQRRegion,
} from '../services/authenticatorQR'
import { loadTagElementGroups } from '../services/tagElements'

registerJobs()

const portalScriptId = 'longvan-portal-tools'
const portalMatches = [portalOriginPattern]

async function syncPortalContentScript(): Promise<void> {
  if (!chrome.permissions?.contains || !chrome.scripting?.getRegisteredContentScripts) return
  const [allowed, registered] = await Promise.all([
    chrome.permissions.contains({ origins: [portalOriginPattern] }),
    chrome.scripting.getRegisteredContentScripts({ ids: [portalScriptId] }),
  ])
  const currentMatches = registered[0]?.matches ?? []
  const registrationOutdated = registered.length > 0 &&
    (currentMatches.length !== portalMatches.length || portalMatches.some((match) => !currentMatches.includes(match)))
  if (allowed && (!registered.length || registrationOutdated)) {
    if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: [portalScriptId] })
    await chrome.scripting.registerContentScripts([{
      id: portalScriptId, matches: portalMatches, js: ['portal.js'], css: ['portal.css'], runAt: 'document_idle',
    }])
  } else if (!allowed && registered.length) {
    await chrome.scripting.unregisterContentScripts({ ids: [portalScriptId] })
  }
}

void syncPortalContentScript().catch(() => {})
chrome.permissions?.onAdded?.addListener(() => { void syncPortalContentScript().catch(() => {}) })
chrome.permissions?.onRemoved?.addListener(() => { void syncPortalContentScript().catch(() => {}) })
// Public IP uses ifconfig.me in the Browser Engine. Remove the old ipify grant.
if (chrome.permissions?.remove) {
  void chrome.permissions.remove({ origins: ['https://api.ipify.org/*'] }).catch(() => {})
}

// Portal content scripts do not need direct storage access; they communicate
// through the validated service-worker handlers.
if (chrome.storage?.local?.setAccessLevel) {
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }, () => {
    void chrome.runtime.lastError // Ignore unsupported access levels on older Chromium.
  })
}

// MXToolbox and WHOIS were retired with their API-key settings. Remove any
// credentials left behind by older versions so they are not kept indefinitely.
if (chrome.storage?.local?.get && chrome.storage.local.set) {
  void chrome.storage.local.get('settings').then((data) => {
    const settings = data.settings as Record<string, unknown> | undefined
    if (!settings || (!('mxtoolboxApiKey' in settings) && !('bknsApiKey' in settings))) return
    const clean = { ...settings }
    delete clean.mxtoolboxApiKey
    delete clean.bknsApiKey
    return chrome.storage.local.set({ settings: clean })
  }).catch(() => {})
}

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({ id: 'check-selection', title: 'Kiểm tra bằng IT Support Toolkit', contexts: ['selection'] })
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error)
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') }).catch(console.error)
  }
})

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== 'check-selection' || !info.selectionText) return
  const selected = info.selectionText.trim().slice(0, 2048)
  chrome.storage.session.set({ selectedTarget: selected }).then(() => chrome.windows.create({
    url: chrome.runtime.getURL('popup.html'), type: 'popup', width: 578, height: 720,
  }))
})

type QRPickerSession = {
  token: string
  tabId: number
  windowId: number
  expiresAt: number
}

function validQRPickerSession(value: unknown): value is QRPickerSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const picker = value as Partial<QRPickerSession>
  return typeof picker.token === 'string' && Number.isInteger(picker.tabId) &&
    Number.isInteger(picker.windowId) && typeof picker.expiresAt === 'number'
}

function captureVisibleTab(windowId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataURL) => {
      const error = chrome.runtime.lastError
      if (error) reject(new Error(error.message))
      else if (!dataURL) reject(new Error('Không nhận được ảnh chụp tab.'))
      else resolve(dataURL)
    })
  })
}

async function startAuthenticatorQRPicker(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || tab.windowId === undefined) throw new Error('Không tìm thấy tab đang mở để chọn mã QR.')
  const token = crypto.randomUUID()
  const picker: QRPickerSession = {
    token, tabId: tab.id, windowId: tab.windowId, expiresAt: Date.now() + 5 * 60 * 1000,
  }
  await chrome.storage.session.set({ [authenticatorQRPickerKey]: picker })
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: showAuthenticatorQRRegionPicker,
      args: [token],
    })
  } catch {
    await chrome.storage.session.remove(authenticatorQRPickerKey)
    throw new Error('Không thể mở bộ chọn vùng trên tab này. Hãy dùng một trang web thông thường hoặc Import ảnh QR.')
  }
}

async function completeAuthenticatorQRPicker(
  token: unknown,
  region: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<string> {
  const saved = await chrome.storage.session.get(authenticatorQRPickerKey)
  const picker = saved[authenticatorQRPickerKey]
  if (!validQRPickerSession(picker) || typeof token !== 'string' || picker.token !== token ||
    picker.tabId !== sender.tab?.id || picker.expiresAt < Date.now()) {
    throw new Error('Phiên chọn vùng QR đã hết hạn. Hãy mở extension và thử lại.')
  }
  await chrome.storage.session.remove(authenticatorQRPickerKey)
  const [active] = await chrome.tabs.query({ active: true, windowId: picker.windowId })
  if (active?.id !== picker.tabId) throw new Error('Tab chọn mã QR không còn được hiển thị.')
  const dataURL = await captureVisibleTab(picker.windowId)
  return importAuthenticatorFromScreenshot(dataURL, region as AuthenticatorQRRegion)
}

async function cancelAuthenticatorQRPicker(token: unknown, sender: chrome.runtime.MessageSender): Promise<void> {
  const saved = await chrome.storage.session.get(authenticatorQRPickerKey)
  const picker = saved[authenticatorQRPickerKey]
  if (validQRPickerSession(picker) && picker.token === token && picker.tabId === sender.tab?.id) {
    await chrome.storage.session.remove(authenticatorQRPickerKey)
  }
}

chrome.runtime.onMessage.addListener((message: {
  type?: string
  options?: unknown
  tabId?: unknown
  token?: unknown
  region?: unknown
}, sender, respond) => {
  const tabId = sender.tab?.id
  const url = sender.tab?.url
  if (message?.type === 'toolkit:start-auth-qr-region') {
    void startAuthenticatorQRPicker().then(
      () => respond({ started: true }),
      (error) => respond({ error: error instanceof Error ? error.message : String(error) }),
    )
    return true
  }
  if (message?.type === 'toolkit:complete-auth-qr-region') {
    void completeAuthenticatorQRPicker(message.token, message.region, sender).then(
      (result) => respond({ success: true, message: result }),
      (error) => respond({ success: false, error: error instanceof Error ? error.message : String(error) }),
    )
    return true
  }
  if (message?.type === 'toolkit:cancel-auth-qr-region') {
    void cancelAuthenticatorQRPicker(message.token, sender).then(
      () => respond({ cancelled: true }),
      () => respond({ cancelled: true }),
    )
    return true
  }
  if (message?.type === 'toolkit:get-vm-config') {
    void chrome.storage.session.get(portalVmConfigKey).then((saved) => {
      const config = isPortalVmConfig(saved[portalVmConfigKey]) ? saved[portalVmConfigKey] : null
      respond({ config, vmName: config ? buildVmName(config.ownerName, config.serviceCode) : '' })
    }, (error) => respond({ error: error instanceof Error ? error.message : String(error) }))
    return true
  }
  if (message?.type === 'toolkit:get-current-vm-info') {
    const requestedTabId = sender.tab?.id ?? (Number.isInteger(message.tabId) ? message.tabId as number : undefined)
    if (requestedTabId === undefined) {
      respond({ error: 'Không tìm thấy tab chi tiết computing đang mở.' })
      return false
    }
    void getVMInfoFromTab(requestedTabId).then((info) =>
      respond({ info, text: formatVMInfo(info as unknown as Record<string, unknown>) }),
      (error) => respond({ error: error instanceof Error ? error.message : String(error) }))
    return true
  }
  if (message?.type === 'toolkit:get-authenticator-codes') {
    if (!url || !isPortalPageUrl(url)) {
      respond({ error: 'Chỉ có thể điền OTP trên trang Portal Long Vân.' })
      return false
    }
    void loadAuthenticatorEntries().then((entries) => respond({
      codes: entries.map((entry) => ({
        id: entry.id,
        issuer: entry.issuer,
        label: entry.label,
        code: generateAuthenticatorCode(entry),
        remaining: authenticatorRemainingSeconds(entry),
      })),
    }), (error) => respond({ error: error instanceof Error ? error.message : String(error) }))
    return true
  }
  if (message?.type === 'toolkit:get-tag-elements') {
    if (!url || !isPortalPageUrl(url)) {
      respond({ error: 'Chỉ có thể dùng Tag Element trên trang Portal Long Vân.' })
      return false
    }
    void loadTagElementGroups().then(
      (groups) => respond({ groups }),
      (error) => respond({ error: error instanceof Error ? error.message : String(error) }),
    )
    return true
  }
  if (message?.type === 'toolkit:copy-vm-config') {
    if (tabId === undefined || !url) { respond({ error: 'Không xác định được tab Dịch vụ.' }); return false }
    void copyServiceConfig(tabId, url).then((config) =>
      respond({ config, vmName: buildVmName(config.ownerName, config.serviceCode) }),
      (error) => respond({ error: error instanceof Error ? error.message : String(error) }))
    return true
  }
  if (message?.type === 'toolkit:paste-vm-config') {
    if (tabId === undefined || !url) { respond({ error: 'Không xác định được tab Tạo computing.' }); return false }
    void pasteServiceConfig(tabId, url).then((result) => respond(result),
      (error) => respond({ applied: [], error: error instanceof Error ? error.message : String(error) }))
    return true
  }
  if (message?.type === 'toolkit:generate-password') {
    if (!url || !isPortalCreateUrl(url)) {
      respond({ error: 'Chỉ có thể tạo nhanh mật khẩu tại trang Tạo computing.' })
      return false
    }
    void Promise.all([
      message.options === undefined
        ? chrome.storage.local.get(passwordOptionsKey)
        : Promise.resolve({ [passwordOptionsKey]: message.options }),
      chrome.storage.session.get(passwordRecentKey),
    ]).then(async ([savedOptions, savedRecent]) => {
      const options = normalizePasswordOptions(savedOptions[passwordOptionsKey])
      const password = generatePassword(options)
      const current = Array.isArray(savedRecent[passwordRecentKey])
        ? savedRecent[passwordRecentKey].filter((item: unknown): item is string => typeof item === 'string') : []
      await Promise.all([
        chrome.storage.local.set({ [passwordOptionsKey]: options }),
        chrome.storage.session.set({
          [passwordRecentKey]: [password, ...current.filter((item) => item !== password)].slice(0, 3),
        }),
      ])
      respond({ password, options })
    }).catch((error) => respond({ error: error instanceof Error ? error.message : String(error) }))
    return true
  }
  if (message?.type === 'toolkit:get-password-options') {
    if (!url || !isPortalCreateUrl(url)) {
      respond({ error: 'Chỉ có thể đọc tùy chọn mật khẩu tại trang Tạo computing.' })
      return false
    }
    void chrome.storage.local.get(passwordOptionsKey).then((saved) => {
      respond({ options: normalizePasswordOptions(saved[passwordOptionsKey]) })
    }).catch((error) => respond({ error: error instanceof Error ? error.message : String(error) }))
    return true
  }
  if (message?.type === 'toolkit:set-password-options') {
    if (!url || !isPortalCreateUrl(url)) {
      respond({ error: 'Chỉ có thể lưu tùy chọn mật khẩu tại trang Tạo computing.' })
      return false
    }
    const options = normalizePasswordOptions(message.options)
    void chrome.storage.local.set({ [passwordOptionsKey]: options })
      .then(() => respond({ options }))
      .catch((error) => respond({ error: error instanceof Error ? error.message : String(error) }))
    return true
  }
  return false
})
