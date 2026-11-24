import { registerJobs } from './jobs'

registerJobs()

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
    url: chrome.runtime.getURL('popup.html'), type: 'popup', width: 680, height: 720,
  }))
})
