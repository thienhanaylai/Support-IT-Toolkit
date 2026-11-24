(() => {
  const servicePath = '/cloud-service-manager/manager/cloud-service-detail.xhtml'
  const createPath = '/computing-manager/manager/computing/computing_create.xhtml'
  if (location.origin !== 'https://portal.longvan.vn' ||
      (location.pathname !== servicePath && location.pathname !== createPath)) return

  const state = { busy: false, text: '', kind: '', config: null }
  let renderQueued = false
  let stopped = false

  function element(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text) node.textContent = text
    return node
  }

  function configText(config) {
    const describe = (name, id) => name && id && name !== id ? `${name} (${id})` : name || id || 'Không có'
    return `${config.cpu} Core · ${config.ramGB} GB RAM · ${config.internetMbps} Mb/s · ${config.diskGB} GB ${config.diskType.replace('_STORAGE', '')} · OS: ${describe(config.os, config.osId)} · Site Provider: ${describe(config.siteProvider, config.siteProviderId)}`
  }

  function setStatus(text, kind = '') {
    state.text = text
    state.kind = kind
    scheduleRender()
  }

  function messageError(error) {
    const text = error instanceof Error ? error.message : String(error)
    return /extension context invalidated|cannot read properties of undefined \(reading ['"]sendMessage['"]\)|runtime\.sendMessage.*undefined/i.test(text)
      ? new Error('Extension vừa được tải lại hoặc cập nhật. Hãy refresh trang Portal rồi thử lại.')
      : error instanceof Error ? error : new Error(text)
  }

  // sendMessage can throw synchronously when this page still has an old content
  // script after the extension is reloaded. Convert both sync and async failures
  // into a rejected Promise so callers always handle them without an uncaught error.
  function sendMessage(message) {
    try {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        throw new Error("Cannot read properties of undefined (reading 'sendMessage')")
      }
      return Promise.resolve(globalThis.chrome.runtime.sendMessage(message)).catch((error) => {
        throw messageError(error)
      })
    } catch (error) {
      return Promise.reject(messageError(error))
    }
  }

  async function copyConfig() {
    if (state.busy) return
    state.busy = true
    setStatus('Đang đọc CORE, RAM, Internet và STORAGE...', 'working')
    try {
      const response = await sendMessage({ type: 'toolkit:copy-vm-config' })
      if (response?.error) throw new Error(response.error)
      state.config = response.config
      setStatus(`Đã sao chép: ${configText(response.config)}. Mở trang Tạo computing để dán.`, 'success')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      state.busy = false
      scheduleRender()
    }
  }

  async function pasteConfig() {
    if (state.busy) return
    state.busy = true
    setStatus('Đang điền CPU → RAM → Internet → Disk. Vui lòng không thao tác trên form...', 'working')
    try {
      const response = await sendMessage({ type: 'toolkit:paste-vm-config' })
      if (response?.error) {
        const completed = Array.isArray(response.applied) && response.applied.length
          ? `Đã điền ${response.applied.join(' → ')}. ` : ''
        throw new Error(`${completed}Dừng: ${response.error}`)
      }
      setStatus('Đã điền CPU → RAM → Internet → Disk. Hãy kiểm tra lại trước khi tạo VM.', 'success')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      state.busy = false
      scheduleRender()
    }
  }

  function applyStatus(root, suppliedStatus) {
    const status = suppliedStatus || root.querySelector('.it-toolkit-portal-status')
    const button = root.querySelector('.it-toolkit-portal-button')
    if (status) {
      if (status.textContent !== state.text) status.textContent = state.text
      status.classList.remove('is-success', 'is-error', 'is-working')
      if (state.kind) status.classList.add(`is-${state.kind}`)
      status.hidden = !state.text
    }
    if (button) button.disabled = state.busy
  }

  function renderService() {
    const table = document.getElementById('frm-info-service:componentInfoService:resourceBare_data')
    const panel = table?.closest('.ui-panel')
    const actions = panel?.querySelector('.ui-panel-titlebar .ui-panel-actions')
    if (!actions) return
    let root = actions.querySelector('.it-toolkit-portal-tools')
    if (!root) {
      root = element('div', 'it-toolkit-portal-tools')
      const button = element('button', 'it-toolkit-portal-button', 'Sao chép thông số')
      button.type = 'button'
      button.addEventListener('click', copyConfig)
      root.append(button)
      actions.prepend(root)
    }
    let status = panel.querySelector(':scope > .it-toolkit-service-status')
    if (!status) {
      status = element('div', 'it-toolkit-portal-status it-toolkit-service-status')
      panel.querySelector(':scope > .ui-panel-titlebar')?.after(status)
    }
    applyStatus(root, status)
  }

  function resourceFieldset() {
    return [...document.querySelectorAll('#frmMain fieldset')]
      .find((field) => field.querySelector('legend')?.textContent?.trim() === 'Tài nguyên')
  }

  function renderCreate() {
    const fieldset = resourceFieldset()
    const content = fieldset?.querySelector('.ui-fieldset-content')
    if (!fieldset || !content) return
    let root = content.querySelector(':scope > .it-toolkit-portal-tools')
    if (!root) {
      root = element('div', 'it-toolkit-portal-tools it-toolkit-create-tools')
      const summary = element('div', 'it-toolkit-config-summary',
        state.config ? `Cấu hình đã sao chép: ${configText(state.config)}` : 'Chưa có cấu hình. Hãy sao chép tại Nhóm thuộc tính của trang Dịch vụ.')
      const button = element('button', 'it-toolkit-portal-button', 'Dán cấu hình đã sao chép')
      button.type = 'button'
      button.addEventListener('click', pasteConfig)
      root.append(summary, button, element('div', 'it-toolkit-portal-status'))
      content.prepend(root)
    }
    const summary = root.querySelector('.it-toolkit-config-summary')
    const summaryText = state.config
      ? `Cấu hình đã sao chép: ${configText(state.config)}`
      : 'Chưa có cấu hình. Hãy sao chép tại Nhóm thuộc tính của trang Dịch vụ.'
    if (summary && summary.textContent !== summaryText) summary.textContent = summaryText
    applyStatus(root)
  }

  function render() {
    renderQueued = false
    if (stopped) return
    if (location.pathname === servicePath) renderService()
    if (location.pathname === createPath) renderCreate()
  }

  function scheduleRender() {
    if (stopped || renderQueued) return
    renderQueued = true
    queueMicrotask(render)
  }

  if (location.pathname === createPath) {
    sendMessage({ type: 'toolkit:get-vm-config' }).then((response) => {
      if (response?.config) state.config = response.config
      else if (response?.error) setStatus(response.error, 'error')
      scheduleRender()
    }).catch((error) => setStatus(error instanceof Error ? error.message : String(error), 'error'))
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        sendMessage({ type: 'toolkit:get-vm-config' }).then((response) => {
          state.config = response?.config ?? null
          scheduleRender()
        }).catch((error) => setStatus(error instanceof Error ? error.message : String(error), 'error'))
      }
    })
  }

  const observer = new MutationObserver(scheduleRender)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  window.addEventListener('pagehide', () => { stopped = true; observer.disconnect() }, { once: true })
  scheduleRender()
})()
