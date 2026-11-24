import { registerJobs } from './jobs'
import { copyServiceConfig, isPortalVmConfig, pasteServiceConfig, portalVmConfigKey } from '../services/portalVmConfig'
import { portalOriginPattern } from '../services/portalAccess'

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

chrome.runtime.onMessage.addListener((message: { type?: string }, sender, respond) => {
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
  return false
})
