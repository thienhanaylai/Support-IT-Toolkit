chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'check-selection', title: 'Kiểm tra bằng IT Support Toolkit', contexts: ['selection'] })
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error)
})

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== 'check-selection' || !info.selectionText) return
  const selected = info.selectionText.trim().slice(0, 2048)
  chrome.storage.session.set({ selectedTarget: selected }).then(() => chrome.windows.create({
    url: chrome.runtime.getURL('popup.html'), type: 'popup', width: 480, height: 680,
  }))
})
