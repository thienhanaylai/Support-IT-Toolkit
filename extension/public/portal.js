(() => {
  const servicePath = '/cloud-service-manager/manager/cloud-service-detail.xhtml'
  const createPath = '/computing-manager/manager/computing/computing_create.xhtml'
  if (location.origin !== 'https://portal.longvan.vn' ||
      (location.pathname !== servicePath && location.pathname !== createPath)) return

  const state = {
    busy: false, text: '', kind: '', config: null,
    passwordBusy: false, passwordText: '', passwordKind: '',
    passwordOptions: null, passwordOptionsExpanded: false, passwordOptionsLoading: false,
    passwordOptionsDraft: null, passwordOptionsSaving: false, passwordOptionsNotice: '',
    passwordValue: '', passwordCopied: false,
  }
  const defaultPasswordOptions = {
    length: 16, numbers: true, lowercase: true, uppercase: true, special: true,
    excludeEnabled: false, excludeChars: '',
  }
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

  function setPasswordStatus(text, kind = '') {
    state.passwordText = text
    state.passwordKind = kind
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

  function markContextMismatches(messages) {
    for (const node of document.querySelectorAll('.it-toolkit-context-mismatch')) {
      node.classList.remove('it-toolkit-context-mismatch')
    }
    if (!Array.isArray(messages) || !messages.length) return
    const form = document.getElementById('frmMain')
    for (const labelText of ['Template', 'Khu vực']) {
      if (!messages.some((message) => typeof message === 'string' && message.startsWith(labelText))) continue
      const normalized = labelText.toLocaleLowerCase('vi-VN')
      const label = [...(form?.querySelectorAll('label') ?? [])].find((node) =>
        (node.textContent ?? '').replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi-VN') === normalized)
      const field = label?.closest('.ui-g-12, [class*="p-col"]') || label?.parentElement
      field?.classList.add('it-toolkit-context-mismatch')
    }
  }

  async function pasteConfig() {
    if (state.busy) return
    state.busy = true
    setStatus('Đang điền CPU → RAM → Internet → Disk. Vui lòng không thao tác trên form...', 'working')
    try {
      const response = await sendMessage({ type: 'toolkit:paste-vm-config' })
      markContextMismatches(response?.mismatches)
      if (response?.error) {
        const completed = Array.isArray(response.applied) && response.applied.length
          ? `Đã điền ${response.applied.join(' → ')}. ` : ''
        const comparison = Array.isArray(response.mismatches) && response.mismatches.length
          ? ` Kiểm tra OS/Site: ${response.mismatches.join(' ')}` : ''
        throw new Error(`${completed}Dừng: ${response.error}${comparison}`)
      }
      if (Array.isArray(response?.mismatches) && response.mismatches.length) {
        const completed = Array.isArray(response.applied) && response.applied.length
          ? `Đã điền ${response.applied.join(' → ')}. ` : ''
        setStatus(`${completed}OS/Site không khớp: ${response.mismatches.join(' ')}`, 'error')
        return
      }
      setStatus('Đã điền CPU → RAM → Internet → Disk. Hãy kiểm tra lại trước khi tạo VM.', 'success')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      state.busy = false
      scheduleRender()
    }
  }

  function passwordControl() {
    const form = document.getElementById('frmMain')
    const label = [...(form?.querySelectorAll('label') ?? [])].find((node) =>
      (node.textContent ?? '').replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase() === 'password')
    if (!label) return null
    const container = label.closest('.ui-g-12, [class*="p-col"]') || label.parentElement
    const linked = label.htmlFor ? document.getElementById(label.htmlFor) : null
    const linkedPassword = linked instanceof HTMLInputElement && !linked.disabled &&
      (linked.type === 'password' || linked.type === 'text')
    const input = linkedPassword
      ? linked
      : container?.querySelector('input[type="password"]:not([disabled]), input[type="text"]:not([disabled])')
    return input && container ? { input, container } : null
  }

  function normalizePasswordOptions(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...defaultPasswordOptions }
    return {
      length: Number.isSafeInteger(value.length) && value.length >= 4 && value.length <= 128
        ? value.length : defaultPasswordOptions.length,
      numbers: typeof value.numbers === 'boolean' ? value.numbers : defaultPasswordOptions.numbers,
      lowercase: typeof value.lowercase === 'boolean' ? value.lowercase : defaultPasswordOptions.lowercase,
      uppercase: typeof value.uppercase === 'boolean' ? value.uppercase : defaultPasswordOptions.uppercase,
      special: typeof value.special === 'boolean' ? value.special : defaultPasswordOptions.special,
      excludeEnabled: typeof value.excludeEnabled === 'boolean'
        ? value.excludeEnabled : defaultPasswordOptions.excludeEnabled,
      excludeChars: typeof value.excludeChars === 'string' ? value.excludeChars.slice(0, 256) : '',
    }
  }

  async function loadPasswordOptions() {
    if (state.passwordOptionsLoading) return
    state.passwordOptionsLoading = true
    try {
      const response = await sendMessage({ type: 'toolkit:get-password-options' })
      if (response?.error) throw new Error(response.error)
      state.passwordOptions = normalizePasswordOptions(response?.options)
      state.passwordOptionsDraft = { ...state.passwordOptions }
      state.passwordOptionsNotice = ''
    } catch (error) {
      setPasswordStatus(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      state.passwordOptionsLoading = false
      scheduleRender()
    }
  }

  function updatePasswordOptionsDraft(options) {
    state.passwordOptionsDraft = normalizePasswordOptions(options)
    state.passwordOptionsNotice = ''
    scheduleRender()
  }

  async function savePasswordOptions() {
    if (state.passwordOptionsSaving) return
    state.passwordOptionsSaving = true
    state.passwordOptionsNotice = ''
    scheduleRender()
    const options = normalizePasswordOptions(
      state.passwordOptionsDraft || state.passwordOptions || defaultPasswordOptions,
    )
    try {
      const response = await sendMessage({
        type: 'toolkit:set-password-options',
        options,
      })
      if (response?.error) throw new Error(response.error)
      state.passwordOptions = normalizePasswordOptions(response?.options)
      state.passwordOptionsDraft = { ...state.passwordOptions }
      state.passwordOptionsNotice = ''
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      state.passwordOptionsNotice = `Không thể lưu: ${message}`
    } finally {
      state.passwordOptionsSaving = false
      scheduleRender()
    }
  }

  function closePasswordOptions() {
    if (!state.passwordOptionsExpanded) return
    state.passwordOptionsExpanded = false
    scheduleRender()
  }

  function handlePasswordOptionsOutside(event) {
    if (!state.passwordOptionsExpanded) return
    const root = document.querySelector('.it-toolkit-password-tools')
    const panel = document.getElementById('it-toolkit-password-options-popover')
    if (event.target instanceof Node && !root?.contains(event.target) && !panel?.contains(event.target)) {
      closePasswordOptions()
    }
  }

  function handlePasswordOptionsKey(event) {
    if (event.key === 'Escape') closePasswordOptions()
  }

  async function copyGeneratedPassword() {
    if (!state.passwordValue) return
    try {
      await navigator.clipboard.writeText(state.passwordValue)
      state.passwordCopied = true
      scheduleRender()
    } catch {
      setPasswordStatus(`Không thể sao chép. Pass: ${state.passwordValue}`, 'error')
    }
  }

  async function generateQuickPassword() {
    if (state.passwordBusy) return
    state.passwordBusy = true
    state.passwordValue = ''
    state.passwordCopied = false
    setPasswordStatus('Đang tạo mật khẩu...', 'working')
    try {
      const response = await sendMessage({ type: 'toolkit:generate-password' })
      if (response?.error) throw new Error(response.error)
      if (typeof response?.password !== 'string' || !response.password) {
        throw new Error('Extension không trả về mật khẩu hợp lệ.')
      }
      state.passwordOptions = normalizePasswordOptions(response.options)
      const control = passwordControl()
      if (!control) throw new Error('Không còn tìm thấy ô Password trên form.')
      const prototype = control.input.ownerDocument.defaultView?.HTMLInputElement?.prototype
      const setter = prototype && Object.getOwnPropertyDescriptor(prototype, 'value')?.set
      if (setter) setter.call(control.input, response.password)
      else control.input.value = response.password
      const EventClass = control.input.ownerDocument.defaultView?.Event ?? Event
      control.input.dispatchEvent(new EventClass('input', { bubbles: true }))
      control.input.dispatchEvent(new EventClass('change', { bubbles: true }))
      state.passwordValue = response.password
      setPasswordStatus(`Đã tạo pass: ${response.password}`, 'success')
    } catch (error) {
      setPasswordStatus(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      state.passwordBusy = false
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

  function createPasswordOptionsPanel() {
    const existing = document.getElementById('it-toolkit-password-options-popover')
    if (existing) return existing
    const panel = element('div', 'it-toolkit-password-options')
    panel.id = 'it-toolkit-password-options-popover'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-label', 'Tùy chọn tạo mật khẩu')
    const panelHeader = element('div', 'it-toolkit-password-options-header')
    panelHeader.append(element('strong', '', 'Tùy chọn tạo mật khẩu'))
    const closeButton = element('button', 'it-toolkit-password-options-close', '×')
    closeButton.type = 'button'
    closeButton.title = 'Đóng tùy chọn'
    closeButton.setAttribute('aria-label', 'Đóng tùy chọn mật khẩu')
    closeButton.addEventListener('click', closePasswordOptions)
    panelHeader.append(closeButton)
    const checks = element('div', 'it-toolkit-password-checks')
    for (const [key, text] of [
      ['numbers', 'Số'],
      ['lowercase', 'Chữ thường'],
      ['uppercase', 'Chữ hoa'],
      ['special', 'Ký tự đặc biệt'],
    ]) {
      const label = element('label')
      const input = element('input')
      input.type = 'checkbox'
      input.dataset.option = key
      input.addEventListener('change', () => updatePasswordOptionsDraft({
        ...(state.passwordOptionsDraft || state.passwordOptions || defaultPasswordOptions),
        [key]: input.checked,
      }))
      label.append(input, document.createTextNode(` ${text}`))
      checks.append(label)
    }

    const lengthLabel = element('label', 'it-toolkit-password-length')
    lengthLabel.append(document.createTextNode('Độ dài '))
    const lengthInput = element('input')
    lengthInput.type = 'number'
    lengthInput.min = '4'
    lengthInput.max = '128'
    lengthInput.dataset.option = 'length'
    lengthInput.addEventListener('change', () => updatePasswordOptionsDraft({
      ...(state.passwordOptionsDraft || state.passwordOptions || defaultPasswordOptions),
      length: Number(lengthInput.value),
    }))
    lengthLabel.append(lengthInput)

    const excludeRow = element('div', 'it-toolkit-password-exclude')
    const excludeLabel = element('label')
    const excludeEnabled = element('input')
    excludeEnabled.type = 'checkbox'
    excludeEnabled.dataset.option = 'excludeEnabled'
    excludeEnabled.addEventListener('change', () => updatePasswordOptionsDraft({
      ...(state.passwordOptionsDraft || state.passwordOptions || defaultPasswordOptions),
      excludeEnabled: excludeEnabled.checked,
    }))
    excludeLabel.append(excludeEnabled, document.createTextNode(' Loại trừ ký tự'))
    const excludeChars = element('input')
    excludeChars.type = 'text'
    excludeChars.maxLength = 256
    excludeChars.placeholder = 'Ví dụ: 0O1Il'
    excludeChars.setAttribute('aria-label', 'Ký tự loại trừ')
    excludeChars.dataset.option = 'excludeChars'
    excludeChars.addEventListener('input', () => updatePasswordOptionsDraft({
      ...(state.passwordOptionsDraft || state.passwordOptions || defaultPasswordOptions),
      excludeChars: excludeChars.value,
    }))
    excludeRow.append(excludeLabel, excludeChars)
    const footer = element('div', 'it-toolkit-password-options-footer')
    footer.append(element('span', 'it-toolkit-password-options-notice'))
    const saveButton = element('button', 'it-toolkit-password-options-save', 'Lưu')
    saveButton.type = 'button'
    saveButton.addEventListener('click', savePasswordOptions)
    footer.append(saveButton)
    panel.append(panelHeader, checks, lengthLabel, excludeRow, footer)
    document.body.append(panel)
    return panel
  }

  function positionPasswordOptions(panel, anchor) {
    const margin = 14
    const gap = 8
    const rect = anchor.getBoundingClientRect()
    const width = Math.min(390, Math.max(0, window.innerWidth - margin * 2))
    let left = rect.right - width
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
    const top = rect.top - panel.offsetHeight - gap
    panel.style.width = `${width}px`
    panel.style.left = `${left}px`
    panel.style.top = `${Math.max(margin, top)}px`
  }

  function renderPasswordTool() {
    const control = passwordControl()
    if (!control) return
    let root = control.container.parentElement?.querySelector(':scope > .it-toolkit-password-tools')
    if (!root) {
      root = element('div', 'it-toolkit-password-tools')
      const gridClasses = [...control.container.classList].filter((name) =>
        /^(?:ui-g-\d+|ui-md-\d+|p-col(?:-\d+)?|p-md-\d+)$/.test(name))
      root.classList.add(...gridClasses)
      const actions = element('div', 'it-toolkit-password-actions')
      const button = element('button', 'it-toolkit-portal-button it-toolkit-password-button', 'Tạo mật khẩu')
      button.type = 'button'
      button.title = 'Dùng các tùy chọn tạo mật khẩu đã lưu trong extension'
      button.addEventListener('click', generateQuickPassword)
      const optionsButton = element('button', 'it-toolkit-password-options-button', 'Tùy chọn')
      optionsButton.type = 'button'
      optionsButton.setAttribute('aria-controls', 'it-toolkit-password-options-popover')
      optionsButton.addEventListener('click', () => {
        if (state.passwordOptionsExpanded) closePasswordOptions()
        else {
          state.passwordOptionsExpanded = true
          void loadPasswordOptions()
          scheduleRender()
        }
      })
      actions.append(button, optionsButton)
      const status = element('div', 'it-toolkit-portal-status it-toolkit-password-status')
      status.append(element('span', 'it-toolkit-password-status-text'))
      const copyButton = element('button', 'it-toolkit-password-copy', 'Copy')
      copyButton.type = 'button'
      copyButton.title = 'Sao chép mật khẩu'
      copyButton.setAttribute('aria-label', 'Sao chép mật khẩu vừa tạo')
      copyButton.addEventListener('click', copyGeneratedPassword)
      status.append(copyButton)
      root.append(actions, status)
      control.container.after(root)
    }
    const panel = createPasswordOptionsPanel()
    const button = root.querySelector('.it-toolkit-password-button')
    const optionsButton = root.querySelector('.it-toolkit-password-options-button')
    const status = root.querySelector('.it-toolkit-password-status')
    if (button) {
      button.disabled = state.passwordBusy
      const label = state.passwordBusy ? 'Đang tạo...' : 'Tạo mật khẩu'
      if (button.textContent !== label) button.textContent = label
    }
    if (optionsButton) {
      optionsButton.disabled = state.passwordOptionsLoading
      if (optionsButton.textContent !== 'Tùy chọn') optionsButton.textContent = 'Tùy chọn'
      optionsButton.classList.toggle('is-open', state.passwordOptionsExpanded)
      optionsButton.setAttribute('aria-expanded', String(state.passwordOptionsExpanded))
    }
    if (panel) {
      panel.hidden = !state.passwordOptionsExpanded
      const options = state.passwordOptionsDraft || state.passwordOptions || defaultPasswordOptions
      for (const key of ['numbers', 'lowercase', 'uppercase', 'special', 'excludeEnabled']) {
        const input = panel.querySelector(`[data-option="${key}"]`)
        if (input) input.checked = options[key]
      }
      const length = panel.querySelector('[data-option="length"]')
      if (length && length.value !== String(options.length)) length.value = String(options.length)
      const excludeChars = panel.querySelector('[data-option="excludeChars"]')
      if (excludeChars) {
        if (excludeChars.value !== options.excludeChars) excludeChars.value = options.excludeChars
        excludeChars.hidden = !options.excludeEnabled
      }
      const saveButton = panel.querySelector('.it-toolkit-password-options-save')
      if (saveButton) saveButton.disabled = state.passwordOptionsSaving || state.passwordOptionsLoading
      const notice = panel.querySelector('.it-toolkit-password-options-notice')
      if (notice && notice.textContent !== state.passwordOptionsNotice) {
        notice.textContent = state.passwordOptionsNotice
      }
      if (state.passwordOptionsExpanded && optionsButton) positionPasswordOptions(panel, optionsButton)
    }
    if (status) {
      const statusText = status.querySelector('.it-toolkit-password-status-text')
      if (statusText && statusText.textContent !== state.passwordText) statusText.textContent = state.passwordText
      const copyButton = status.querySelector('.it-toolkit-password-copy')
      if (copyButton) {
        const copyLabel = state.passwordCopied ? 'Đã chép' : 'Copy'
        if (copyButton.textContent !== copyLabel) copyButton.textContent = copyLabel
        copyButton.hidden = !state.passwordValue
      }
      status.classList.remove('is-success', 'is-error', 'is-working')
      if (state.passwordKind) status.classList.add(`is-${state.passwordKind}`)
      status.hidden = !state.passwordText
    }
  }

  function renderCreate() {
    renderPasswordTool()
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
    void loadPasswordOptions()
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
  document.addEventListener('pointerdown', handlePasswordOptionsOutside, true)
  document.addEventListener('keydown', handlePasswordOptionsKey)
  document.addEventListener('scroll', scheduleRender, true)
  window.addEventListener('resize', scheduleRender)
  window.addEventListener('pagehide', () => {
    stopped = true
    observer.disconnect()
    document.removeEventListener('pointerdown', handlePasswordOptionsOutside, true)
    document.removeEventListener('keydown', handlePasswordOptionsKey)
    document.removeEventListener('scroll', scheduleRender, true)
    window.removeEventListener('resize', scheduleRender)
    document.getElementById('it-toolkit-password-options-popover')?.remove()
  }, { once: true })
  scheduleRender()
})()
