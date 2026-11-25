import { registerJobs } from './jobs'
import {
  copyServiceConfig, isPortalCreateUrl, isPortalVmConfig,
  pasteServiceConfig, portalVmConfigKey,
} from '../services/portalVmConfig'
import { portalOriginPattern } from '../services/portalAccess'
import {
  generatePassword, normalizePasswordOptions, passwordOptionsKey, passwordRecentKey,
} from '../services/passwordGenerator'

registerJobs()

const portalScriptId = 'longvan-portal-tools'
const portalMatches = [
  'https://portal.longvan.vn/cloud-service-manager/manager/cloud-service-detail.xhtml*',
  'https://portal.longvan.vn/computing-manager/manager/computing/computing_create.xhtml*',
]

async function syncPortalContentScript(): Promise<void> {
  if (!chrome.permissions?.contains || !chrome.scripting?.getRegisteredContentScripts) return
  const [allowed, registered] = await Promise.all([
    chrome.permissions.contains({ origins: [portalOriginPattern] }),
    chrome.scripting.getRegisteredContentScripts({ ids: [portalScriptId] }),
  ])
  if (allowed && !registered.length) {
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
// Public IP now runs through the Local Agent. Remove the narrow host grant left
// by older versions so Edge no longer retains unnecessary access to ipify.
if (chrome.permissions?.remove) {
  void chrome.permissions.remove({ origins: ['https://api.ipify.org/*'] }).catch(() => {})
}

// Settings contain the MXToolbox key. Portal content scripts do not need direct
// storage access; they communicate through the validated service-worker handlers.
if (chrome.storage?.local?.setAccessLevel) {
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }, () => {
    void chrome.runtime.lastError // Ignore unsupported access levels on older Chromium.
  })
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

chrome.runtime.onMessage.addListener((message: { type?: string; options?: unknown }, sender, respond) => {
  const tabId = sender.tab?.id
  const url = sender.tab?.url
  if (message?.type === 'toolkit:get-vm-config') {
    void chrome.storage.session.get(portalVmConfigKey).then((saved) =>
      respond({ config: isPortalVmConfig(saved[portalVmConfigKey]) ? saved[portalVmConfigKey] : null }),
    (error) => respond({ error: error instanceof Error ? error.message : String(error) }))
    return true
  }
  if (message?.type === 'toolkit:copy-vm-config') {
    if (tabId === undefined || !url) { respond({ error: 'Không xác định được tab Dịch vụ.' }); return false }
    void copyServiceConfig(tabId, url).then((config) => respond({ config }),
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
