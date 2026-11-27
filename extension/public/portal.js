(() => {
  const servicePath = '/cloud-service-manager/manager/cloud-service-detail.xhtml'
  const createPath = '/computing-manager/manager/computing/computing_create.xhtml'
  const createPlusPath = '/computing-manager/manager/computing/computing_create_plus.xhtml'
  const detailPath = '/computing-manager/manager/computing/computing_detail.xhtml'
  if (location.origin !== 'https://portal.longvan.vn') return

  const state = {
    busy: false, text: '', kind: '', config: null,
    passwordBusy: false, passwordText: '', passwordKind: '',
    passwordOptions: null, passwordOptionsExpanded: false, passwordOptionsLoading: false,
    passwordOptionsDraft: null, passwordOptionsSaving: false, passwordOptionsNotice: '',
    passwordValue: '', passwordCopied: false,
    vmName: '', vmNameBusy: false, vmNameText: '', vmNameKind: '',
    vmInfoBusy: false, vmInfoCopied: false, vmInfoText: '', vmInfoKind: '',
    vmComposerOpen: false, vmComposerLoading: false, vmComposerCopying: false,
    vmComposerVmText: '', vmComposerExtraText: '', vmComposerTagGroups: [],
    vmComposerTemplates: [], vmComposerSelectedTemplateId: '',
    vmComposerText: '', vmComposerKind: '', vmComposerTheme: 'light',
    otpBusy: false, otpLoaded: false, otpCodes: [], otpSelectedId: '',
    otpMenuOpen: false, otpText: '', otpKind: '',
  }
  const defaultPasswordOptions = {
    length: 16, specialCount: 3, numbers: true, lowercase: true, uppercase: true, special: true,
    excludeEnabled: false, excludeChars: '',
  }
  let renderQueued = false
  let stopped = false
  let vmInfoToastTimer = 0
  let otpRefreshTimer = 0
  let runtimeMessageHandler = null
  const otpMenuId = 'it-toolkit-otp-menu-popover'

  function element(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text) node.textContent = text
    return node
  }

  function configText(config) {
    const describe = (name, id) => name && id && name !== id ? `${name} (${id})` : name || id || 'Không có'
    const vmName = state.vmName ? ` · Tên VM: ${state.vmName}` : ''
    return `${config.cpu} Core · ${config.ramGB} GB RAM · ${config.internetMbps} Mb/s · ${config.diskGB} GB ${config.diskType.replace('_STORAGE', '')} · OS: ${describe(config.os, config.osId)} · Loại dịch vụ: ${describe(config.serviceType, config.serviceTypeId)} · Site Provider: ${describe(config.siteProvider, config.siteProviderId)}${vmName}`
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
      state.vmName = typeof response?.vmName === 'string' ? response.vmName.trim() : ''
      setStatus(`Đã sao chép: ${configText(response.config)}. Mở trang Tạo computing để dán.`, 'success')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      state.busy = false
      scheduleRender()
    }
  }

  async function copyCurrentVmInfo() {
    if (state.vmInfoBusy) return
    state.vmInfoBusy = true
    state.vmInfoCopied = false
    state.vmInfoText = 'Đang đọc VM...'
    state.vmInfoKind = 'working'
    scheduleRender()
    try {
      const response = await sendMessage({ type: 'toolkit:get-current-vm-info' })
      if (response?.error) throw new Error(response.error)
      if (!response?.text) throw new Error('Không có thông tin VM để sao chép.')
      await navigator.clipboard.writeText(response.text)
      state.vmInfoText = `Đã sao chép ${response.info?.computingName || 'thông tin VM'}`
      state.vmInfoKind = 'success'
      state.vmInfoCopied = true
    } catch (error) {
      state.vmInfoText = error instanceof Error ? error.message : String(error)
      state.vmInfoKind = 'error'
    } finally {
      state.vmInfoBusy = false
      scheduleRender()
    }
  }

  function setPortalToolsEnabled(enabled) {
    document.documentElement.classList.toggle('it-toolkit-portal-disabled', !enabled)
    if (!enabled) {
      state.passwordOptionsExpanded = false
      state.vmComposerOpen = false
      state.otpMenuOpen = false
      document.querySelector('.it-toolkit-vm-composer-overlay')?.remove()
      document.getElementById('it-toolkit-password-options-popover')?.setAttribute('hidden', '')
      const otpMenu = document.getElementById(otpMenuId)
      if (otpMenu) otpMenu.hidden = true
    }
    scheduleRender()
  }

  function closeVmComposer() {
    state.vmComposerOpen = false
    state.vmComposerLoading = false
    state.vmComposerCopying = false
    state.vmComposerText = ''
    state.vmComposerKind = ''
    scheduleRender()
  }

  async function openVmComposer() {
    if (state.vmComposerLoading) return
    state.vmComposerOpen = true
    state.vmComposerLoading = true
    state.vmComposerCopying = false
    state.vmComposerVmText = ''
    state.vmComposerExtraText = ''
    state.vmComposerTagGroups = []
    state.vmComposerTemplates = []
    state.vmComposerSelectedTemplateId = ''
    state.vmComposerText = 'Đang tải thông tin VM, template và Tag Element...'
    state.vmComposerKind = 'working'
    scheduleRender()
    try {
      const [vmResponse, tagResponse, templateResponse] = await Promise.all([
        sendMessage({ type: 'toolkit:get-current-vm-info' }),
        sendMessage({ type: 'toolkit:get-tag-elements' }),
        sendMessage({ type: 'toolkit:get-message-templates' }),
      ])
      if (vmResponse?.error) throw new Error(vmResponse.error)
      if (tagResponse?.error) throw new Error(tagResponse.error)
      if (templateResponse?.error) throw new Error(templateResponse.error)
      if (!vmResponse?.text) throw new Error('Không có thông tin VM để soạn nội dung.')
      state.vmComposerVmText = vmResponse.text
      state.vmComposerTagGroups = Array.isArray(tagResponse?.groups) ? tagResponse.groups : []
      state.vmComposerTemplates = Array.isArray(templateResponse?.templates) ? templateResponse.templates : []
      state.vmComposerTheme = tagResponse?.theme === 'dark' ? 'dark' : 'light'
      state.vmComposerText = ''
      state.vmComposerKind = ''
    } catch (error) {
      state.vmComposerText = error instanceof Error ? error.message : String(error)
      state.vmComposerKind = 'error'
    } finally {
      state.vmComposerLoading = false
      scheduleRender()
    }
  }

  function tagGroupText(group) {
    if (!Array.isArray(group?.members)) return ''
    return group.members.map((member) => {
      const name = typeof member?.name === 'string' ? member.name.trim() : ''
      const elementId = typeof member?.elementId === 'string' ? member.elementId.trim() : ''
      return name && elementId ? `(${name})[${elementId}]` : ''
    }).filter(Boolean).join('\n')
  }

  function addTagGroupToComposer(group) {
    const text = tagGroupText(group)
    if (!text) {
      state.vmComposerText = `Lĩnh vực ${group?.name || ''} chưa có thành viên.`
      state.vmComposerKind = 'error'
      scheduleRender()
      return false
    }
    state.vmComposerExtraText = [state.vmComposerExtraText.trim(), text].filter(Boolean).join('\n\n')
    state.vmComposerText = ''
    state.vmComposerKind = ''
    scheduleRender()
    return true
  }

  function flashAddedButton(button, label) {
    if (button.dataset.addedTimer) window.clearTimeout(Number(button.dataset.addedTimer))
    button.classList.remove('is-added')
    void button.offsetWidth
    button.classList.add('is-added')
    button.textContent = `✓ ${label}`
    button.dataset.addedTimer = String(window.setTimeout(() => {
      button.classList.remove('is-added')
      button.textContent = label
      delete button.dataset.addedTimer
    }, 700))
  }

  function insertSelectedTemplate() {
    const template = state.vmComposerTemplates.find((item) => item.id === state.vmComposerSelectedTemplateId)
    if (!template) {
      state.vmComposerText = 'Hãy chọn template cần chèn.'
      state.vmComposerKind = 'error'
      scheduleRender()
      return
    }
    state.vmComposerExtraText = [state.vmComposerExtraText.trim(), template.content.trim()]
      .filter(Boolean).join('\n\n')
    state.vmComposerText = `Đã chèn template ${template.name}.`
    state.vmComposerKind = 'success'
    scheduleRender()
  }

  async function copyVmComposer() {
    if (state.vmComposerCopying || state.vmComposerLoading) return
    const combined = [state.vmComposerVmText.trim(), state.vmComposerExtraText.trim()].filter(Boolean).join('\n\n')
    if (!combined) {
      state.vmComposerText = 'Chưa có nội dung để sao chép.'
      state.vmComposerKind = 'error'
      scheduleRender()
      return
    }
    state.vmComposerCopying = true
    state.vmComposerText = 'Đang sao chép...'
    state.vmComposerKind = 'working'
    scheduleRender()
    try {
      await navigator.clipboard.writeText(combined)
      state.vmInfoText = 'Đã sao chép toàn bộ nội dung nâng cao.'
      state.vmInfoKind = 'success'
      state.vmInfoCopied = true
      closeVmComposer()
    } catch (error) {
      state.vmComposerText = error instanceof Error ? error.message : 'Không thể sao chép nội dung.'
      state.vmComposerKind = 'error'
    } finally {
      state.vmComposerCopying = false
      scheduleRender()
    }
  }

  function renderVmComposer() {
    let overlay = document.querySelector('.it-toolkit-vm-composer-overlay')
    if (!state.vmComposerOpen) {
      overlay?.remove()
      return
    }
    if (!overlay) {
      overlay = element('div', 'it-toolkit-vm-composer-overlay')
      const dialog = element('div', 'it-toolkit-vm-composer')
      dialog.setAttribute('role', 'dialog')
      dialog.setAttribute('aria-modal', 'true')
      dialog.setAttribute('aria-labelledby', 'it-toolkit-vm-composer-title')
      const header = element('div', 'it-toolkit-vm-composer-header')
      const titleWrap = element('div')
      const title = element('strong', '', 'Copy VM')
      title.id = 'it-toolkit-vm-composer-title'
      titleWrap.append(title)
      const close = element('button', 'it-toolkit-vm-composer-close', '×')
      close.type = 'button'
      close.setAttribute('aria-label', 'Đóng')
      close.addEventListener('click', closeVmComposer)
      header.append(titleWrap, close)

      const vmLabel = element('label', 'it-toolkit-vm-composer-field')
      const vmText = element('textarea', 'it-toolkit-vm-composer-vm')
      vmText.rows = 8
      vmText.setAttribute('aria-label', 'Thông tin VM')
      vmText.addEventListener('input', () => { state.vmComposerVmText = vmText.value })
      vmLabel.append(vmText)

      const extraLabel = element('label', 'it-toolkit-vm-composer-field')
      const extraText = element('textarea', 'it-toolkit-vm-composer-extra')
      extraText.rows = 5
      extraText.placeholder = 'Ghi chú, template hoặc liên hệ...'
      extraText.setAttribute('aria-label', 'Nội dung bổ sung')
      extraText.addEventListener('input', () => { state.vmComposerExtraText = extraText.value })
      extraLabel.append(extraText)

      const templates = element('div', 'it-toolkit-vm-composer-templates')
      const templateControls = element('div', 'it-toolkit-vm-composer-template-controls')
      const templateSelect = element('select', 'it-toolkit-vm-composer-template-select')
      templateSelect.setAttribute('aria-label', 'Chọn template tin nhắn')
      templateSelect.addEventListener('change', () => {
        state.vmComposerSelectedTemplateId = templateSelect.value
        scheduleRender()
      })
      const insertTemplate = element('button', 'it-toolkit-vm-composer-template-insert', 'Chèn')
      insertTemplate.type = 'button'
      insertTemplate.addEventListener('click', insertSelectedTemplate)
      templateControls.append(templateSelect, insertTemplate)
      templates.append(templateControls)

      const tags = element('div', 'it-toolkit-vm-composer-tags')
      tags.append(element('div', 'it-toolkit-vm-composer-tag-buttons'))
      const footer = element('div', 'it-toolkit-vm-composer-footer')
      const status = element('span', 'it-toolkit-vm-composer-status')
      status.setAttribute('role', 'status')
      const actions = element('div', 'it-toolkit-vm-composer-actions')
      const copy = element('button', 'it-toolkit-vm-composer-copy', 'Sao chép')
      copy.type = 'button'
      copy.addEventListener('click', copyVmComposer)
      actions.append(copy)
      footer.append(status, actions)
      dialog.append(header, vmLabel, extraLabel, templates, tags, footer)
      overlay.append(dialog)
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeVmComposer()
      })
      document.body.append(overlay)
    }
    overlay.classList.toggle('is-dark', state.vmComposerTheme === 'dark')
    const vmText = overlay.querySelector('.it-toolkit-vm-composer-vm')
    const extraText = overlay.querySelector('.it-toolkit-vm-composer-extra')
    if (vmText && vmText.value !== state.vmComposerVmText) vmText.value = state.vmComposerVmText
    if (extraText && extraText.value !== state.vmComposerExtraText) extraText.value = state.vmComposerExtraText
    if (vmText) vmText.disabled = state.vmComposerLoading
    if (extraText) extraText.disabled = state.vmComposerLoading
    const templateSelect = overlay.querySelector('.it-toolkit-vm-composer-template-select')
    if (templateSelect) {
      const signature = state.vmComposerTemplates.map((item) => `${item.id}:${item.name}`).join('|')
      if (templateSelect.dataset.signature !== signature) {
        templateSelect.replaceChildren()
        const placeholder = element('option', '', state.vmComposerTemplates.length
          ? '-- Chọn template --' : '-- Chưa có template --')
        placeholder.value = ''
        templateSelect.append(placeholder)
        for (const template of state.vmComposerTemplates) {
          const option = element('option', '', template.name)
          option.value = template.id
          templateSelect.append(option)
        }
        templateSelect.dataset.signature = signature
      }
      templateSelect.value = state.vmComposerSelectedTemplateId
      templateSelect.disabled = state.vmComposerLoading
    }
    const insertTemplate = overlay.querySelector('.it-toolkit-vm-composer-template-insert')
    if (insertTemplate) insertTemplate.disabled = !state.vmComposerSelectedTemplateId
    const buttons = overlay.querySelector('.it-toolkit-vm-composer-tag-buttons')
    if (buttons) {
      const signature = state.vmComposerTagGroups.map((group) =>
        `${group.id}:${group.name}:${tagGroupText(group)}`).join('|')
      if (buttons.dataset.signature !== signature) {
        buttons.replaceChildren()
        for (const group of state.vmComposerTagGroups) {
          const button = element('button', '', group.name)
          button.type = 'button'
          button.disabled = !tagGroupText(group)
          button.addEventListener('click', () => {
            if (addTagGroupToComposer(group)) flashAddedButton(button, group.name)
          })
          buttons.append(button)
        }
        if (!state.vmComposerTagGroups.length) buttons.append(element('small', '', 'Chưa có lĩnh vực Tag Element.'))
        buttons.dataset.signature = signature
      }
    }
    const status = overlay.querySelector('.it-toolkit-vm-composer-status')
    if (status) {
      if (status.textContent !== state.vmComposerText) status.textContent = state.vmComposerText
      status.className = `it-toolkit-vm-composer-status${state.vmComposerKind ? ` is-${state.vmComposerKind}` : ''}`
    }
    const copy = overlay.querySelector('.it-toolkit-vm-composer-copy')
    if (copy) {
      copy.disabled = state.vmComposerLoading || state.vmComposerCopying
      const label = state.vmComposerCopying ? 'Đang sao chép...' : 'Sao chép'
      if (copy.textContent !== label) copy.textContent = label
    }
  }

  function normalizedText(node) {
    return (node?.textContent ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi-VN')
  }

  function isVisible(node) {
    return !node.hidden && node.getAttribute('aria-hidden') !== 'true' &&
      node.style.display !== 'none' && node.style.visibility !== 'hidden'
  }

  function otpLabelIn(dialog) {
    return [...dialog.querySelectorAll('label, strong, span, div, p')].find((node) => {
      const text = normalizedText(node)
      return text.length <= 80 && /^(?:nhập\s+)?mã\s+otp(?:\s|$|[^a-z0-9])/.test(text)
    }) ?? null
  }

  function otpDialog() {
    const dialogs = [...document.querySelectorAll('[role="dialog"], .ui-dialog, .modal, .p-dialog')]
    return dialogs.find((dialog) => {
      if (!isVisible(dialog)) return false
      return /(?:enable2fa|dlg.*2fa|2fa)/i.test(dialog.id || '') || Boolean(otpLabelIn(dialog))
    }) ?? null
  }

  function otpInputIn(dialog, label) {
    const linked = label instanceof HTMLLabelElement && label.htmlFor
      ? document.getElementById(label.htmlFor) : null
    if (linked instanceof HTMLInputElement) return linked
    if (label) {
      let sibling = label.nextElementSibling
      while (sibling) {
        const candidate = sibling instanceof HTMLInputElement ? sibling : sibling.querySelector('input')
        if (candidate instanceof HTMLInputElement) return candidate
        sibling = sibling.nextElementSibling
      }
    }
    const candidates = [...dialog.querySelectorAll('input:not([type="hidden"]):not([disabled])')]
    const marked = candidates.find((input) =>
      /otp|one.?time|2fa|token|auth/i.test(`${input.id} ${input.name} ${input.autocomplete}`))
    if (marked) return marked
    const numeric = candidates.find((input) =>
      input.autocomplete === 'one-time-code' || input.inputMode === 'numeric' ||
      (input.maxLength >= 6 && input.maxLength <= 8))
    if (numeric) return numeric
    return label
      ? candidates.find((input) =>
        Boolean(label.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING)) ?? null
      : candidates[0] ?? null
  }

  function otpControl() {
    const detected = otpDialog()
    if (detected) {
      const label = otpLabelIn(detected)
      const input = otpInputIn(detected, label)
      if (input) return { label, input, dialog: detected }
    }
    // Older computing detail pages may render the dialog without an id/label match.
    if (location.pathname !== detailPath) return null
    const label = [...document.querySelectorAll('label, strong, span, div')]
      .find((node) => normalizedText(node) === 'nhập mã otp')
    if (!label) return null
    const dialog = label.closest('[role="dialog"], .ui-dialog, .modal, .p-dialog') ||
      label.parentElement?.parentElement
    const input = dialog ? otpInputIn(dialog, label) : null
    return input ? { label, input, dialog } : null
  }

  function selectedOtpCode() {
    return state.otpCodes.find((item) => item.id === state.otpSelectedId) ?? state.otpCodes[0] ?? null
  }

  function fillOtpCode(item) {
    const control = otpControl()
    if (!control) throw new Error('Không tìm thấy ô nhập mã OTP.')
    setInputValue(control.input, item.code)
    control.input.focus()
    state.otpSelectedId = item.id
    state.otpMenuOpen = false
    state.otpText = 'Đã điền mã OTP.'
    state.otpKind = 'success'
    scheduleRender()
  }

  function removeOtpTool() {
    for (const root of document.querySelectorAll('.it-toolkit-otp-tools')) root.remove()
    for (const anchor of document.querySelectorAll('.it-toolkit-otp-anchor')) {
      anchor.classList.remove('it-toolkit-otp-anchor')
    }
    document.getElementById(otpMenuId)?.remove()
    window.clearTimeout(otpRefreshTimer)
    state.otpBusy = false
    state.otpLoaded = false
    state.otpCodes = []
    state.otpSelectedId = ''
    state.otpMenuOpen = false
    state.otpText = ''
    state.otpKind = ''
  }

  function positionOtpMenu(menu, anchor) {
    if (menu.hidden) return
    const rect = anchor.getBoundingClientRect()
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight
    const margin = 8
    const width = Math.max(120, Math.min(280, viewportWidth - margin * 2))
    const left = Math.min(
      Math.max(margin, rect.right - width),
      Math.max(margin, viewportWidth - width - margin),
    )
    const spaceBelow = viewportHeight - rect.bottom - margin
    const spaceAbove = rect.top - margin
    const openAbove = spaceBelow < 150 && spaceAbove > spaceBelow
    const available = Math.max(80, (openAbove ? spaceAbove : spaceBelow) - 6)
    const maxHeight = Math.min(280, available)
    const styles = {
      width: `${Math.round(width)}px`,
      left: `${Math.round(left)}px`,
      maxHeight: `${Math.round(maxHeight)}px`,
      top: openAbove ? 'auto' : `${Math.round(rect.bottom + 6)}px`,
      bottom: openAbove ? `${Math.round(viewportHeight - rect.top + 6)}px` : 'auto',
    }
    for (const [name, value] of Object.entries(styles)) {
      if (menu.style[name] !== value) menu.style[name] = value
    }
  }

  async function loadAuthenticatorCodes(openMenu = false) {
    if (!otpControl()) return null
    if (state.otpBusy) return selectedOtpCode()
    state.otpBusy = true
    state.otpText = ''
    state.otpKind = 'working'
    scheduleRender()
    try {
      const response = await sendMessage({ type: 'toolkit:get-authenticator-codes' })
      if (response?.error) throw new Error(response.error)
      const codes = Array.isArray(response?.codes)
        ? response.codes.filter((item) => item && typeof item.code === 'string' && /^\d{6,8}$/.test(item.code))
        : []
      if (!codes.length) throw new Error('Chưa có mã Authenticator. Hãy thêm mã trong extension.')
      const longVan = codes.filter((item) =>
        /long\s*van|longvan/i.test(`${item.issuer ?? ''} ${item.label ?? ''}`))
      const selected = codes.find((item) => item.id === state.otpSelectedId) ||
        (longVan.length === 1 ? longVan[0] : codes[0])
      state.otpCodes = codes
      state.otpSelectedId = selected.id
      state.otpLoaded = true
      state.otpMenuOpen = openMenu
      state.otpText = ''
      state.otpKind = ''
      window.clearTimeout(otpRefreshTimer)
      const remaining = Math.max(1, Math.min(...codes.map((item) =>
        Number.isFinite(item.remaining) ? Math.max(1, item.remaining) : 30)))
      otpRefreshTimer = window.setTimeout(() => {
        state.otpLoaded = false
        if (otpControl()) void loadAuthenticatorCodes(state.otpMenuOpen)
      }, remaining * 1000 + 150)
      return selected
    } catch (error) {
      state.otpLoaded = true
      state.otpText = error instanceof Error ? error.message : String(error)
      state.otpKind = 'error'
      return null
    } finally {
      state.otpBusy = false
      scheduleRender()
    }
  }

  async function pasteAuthenticatorCode() {
    const selected = await loadAuthenticatorCodes(false)
    if (selected) fillOtpCode(selected)
  }

  async function toggleAuthenticatorCodes() {
    if (state.otpBusy) return
    if (state.otpMenuOpen) {
      state.otpMenuOpen = false
      scheduleRender()
      return
    }
    await loadAuthenticatorCodes(true)
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
    const order = location.pathname === createPlusPath
      ? 'Template → Cấu hình triển khai → CPU → RAM → Internet → Reservation → Disk'
      : 'Template (nếu cần) → CPU → RAM → Internet → Disk'
    setStatus(`Đang điền ${order}. Vui lòng không thao tác trên form...`, 'working')
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
      const completed = Array.isArray(response?.applied) && response.applied.length
        ? response.applied.join(' → ') : 'cấu hình'
      setStatus(`Đã điền ${completed}. Hãy kiểm tra lại trước khi tạo VM.`, 'success')
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

  function computingNameControl() {
    const form = document.getElementById('frmMain')
    const label = [...(form?.querySelectorAll('label') ?? [])].find((node) =>
      (node.textContent ?? '').replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi-VN') === 'tên')
    const container = label?.closest('.ui-g-12, [class*="p-col"]') || label?.parentElement
    const input = [...(container?.querySelectorAll('input[type="text"]:not([disabled])') ?? [])]
      .find((node) => node.id && !node.readOnly)
    return input && container ? { input, container } : null
  }

  function setInputValue(input, value, dispatchChange = true) {
    const prototype = input.ownerDocument.defaultView?.HTMLInputElement?.prototype
    const setter = prototype && Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    if (setter) setter.call(input, value)
    else input.value = value
    const EventClass = input.ownerDocument.defaultView?.Event ?? Event
    input.dispatchEvent(new EventClass('input', { bubbles: true }))
    if (dispatchChange) input.dispatchEvent(new EventClass('change', { bubbles: true }))
  }

  async function pasteVmName() {
    if (state.vmNameBusy) return
    state.vmNameBusy = true
    state.vmNameText = 'Đang lấy tên VM...'
    state.vmNameKind = 'working'
    scheduleRender()
    try {
      const response = await sendMessage({ type: 'toolkit:get-vm-config' })
      if (response?.error) throw new Error(response.error)
      state.config = response?.config ?? null
      state.vmName = typeof response?.vmName === 'string' ? response.vmName.trim() : ''
      const vmName = state.vmName
      if (!vmName) throw new Error('Chưa có tên VM. Hãy bấm Sao chép thông số ở trang Dịch vụ trước.')
      const control = computingNameControl()
      if (!control) throw new Error('Không tìm thấy ô Tên của computing.')
      setInputValue(control.input, vmName, false)
      state.vmNameText = `Đã điền: ${vmName}`
      state.vmNameKind = 'success'
    } catch (error) {
      state.vmNameText = error instanceof Error ? error.message : String(error)
      state.vmNameKind = 'error'
    } finally {
      state.vmNameBusy = false
      scheduleRender()
    }
  }

  async function pasteAdvancedVmInfo() {
    if (state.busy || state.vmNameBusy) return
    setStatus('Đang điền tên VM và cấu hình đã sao chép...', 'working')
    await pasteVmName()
    if (state.vmNameKind === 'error') {
      setStatus(state.vmNameText, 'error')
      return
    }
    await pasteConfig()
  }

  function renderVmNameTool() {
    const control = computingNameControl()
    if (!control) return
    let root = control.container.querySelector(':scope > .it-toolkit-vm-name-tools')
    if (!root) {
      root = element('div', 'it-toolkit-vm-name-tools')
      const button = element('button', 'it-toolkit-vm-name-button', 'Dán tên VM')
      button.type = 'button'
      button.title = 'Điền tên chủ sở hữu (không dấu, chữ thường) và mã dịch vụ vào ô Tên'
      button.addEventListener('click', pasteVmName)
      root.append(button, element('span', 'it-toolkit-vm-name-status'))
      control.input.after(root)
    }
    const button = root.querySelector('.it-toolkit-vm-name-button')
    const status = root.querySelector('.it-toolkit-vm-name-status')
    if (button) button.disabled = state.vmNameBusy
    if (status) {
      if (status.textContent !== state.vmNameText) status.textContent = state.vmNameText
      status.classList.remove('is-success', 'is-error', 'is-working')
      if (state.vmNameKind) status.classList.add(`is-${state.vmNameKind}`)
      status.hidden = !state.vmNameText
    }
  }

  function normalizePasswordOptions(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...defaultPasswordOptions }
    return {
      length: Number.isSafeInteger(value.length) && value.length >= 4 && value.length <= 128
        ? value.length : defaultPasswordOptions.length,
      specialCount: Number.isSafeInteger(value.specialCount) && value.specialCount >= 1 && value.specialCount <= 128
        ? value.specialCount : defaultPasswordOptions.specialCount,
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
    if (event.key !== 'Escape') return
    closePasswordOptions()
    if (state.vmComposerOpen) closeVmComposer()
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
      setInputValue(control.input, response.password)
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

    const specialCountLabel = element('label', 'it-toolkit-password-length it-toolkit-password-special-count')
    specialCountLabel.append(document.createTextNode('Số ký tự đặc biệt '))
    const specialCountInput = element('input')
    specialCountInput.type = 'number'
    specialCountInput.min = '1'
    specialCountInput.max = '128'
    specialCountInput.dataset.option = 'specialCount'
    specialCountInput.addEventListener('change', () => updatePasswordOptionsDraft({
      ...(state.passwordOptionsDraft || state.passwordOptions || defaultPasswordOptions),
      specialCount: Number(specialCountInput.value),
    }))
    specialCountLabel.append(specialCountInput)

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
    panel.append(panelHeader, checks, lengthLabel, specialCountLabel, excludeRow, footer)
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
      const specialCount = panel.querySelector('[data-option="specialCount"]')
      if (specialCount && specialCount.value !== String(options.specialCount)) specialCount.value = String(options.specialCount)
      const specialCountLabel = panel.querySelector('.it-toolkit-password-special-count')
      if (specialCountLabel) specialCountLabel.hidden = !options.special
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
    if (location.pathname === createPlusPath) {
      const form = document.getElementById('frmMain')
      const heading = [...(form?.querySelectorAll('h5') ?? [])].find((node) =>
        (node.textContent ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi-VN') === 'thông tin cơ bản')
      if (!heading) return
      let header = heading.parentElement?.classList.contains('it-toolkit-plus-header')
        ? heading.parentElement : null
      if (!header) {
        const host = heading.parentElement
        if (!host) return
        header = element('div', 'it-toolkit-plus-header')
        heading.before(header)
        header.append(heading)
      }
      heading.classList.add('it-toolkit-plus-heading')
      let root = header.querySelector(':scope > .it-toolkit-plus-tools')
      if (!root) {
        root = element('div', 'it-toolkit-portal-tools it-toolkit-plus-tools')
        const button = element('button', 'it-toolkit-portal-button', 'Dán thông tin VM')
        button.type = 'button'
        button.addEventListener('click', pasteAdvancedVmInfo)
        root.append(button, element('div', 'it-toolkit-portal-status'))
        header.append(root)
      }
      applyStatus(root)
      const button = root.querySelector('.it-toolkit-portal-button')
      if (button) button.disabled = state.busy || state.vmNameBusy
      return
    }
    renderVmNameTool()
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

  function renderDetail() {
    const heading = [...document.querySelectorAll('#frmMain .card .mb-1')]
      .find((node) => node.querySelector('span')?.textContent?.trim() === 'Thông tin')
    if (!heading) return
    let root = heading.querySelector(':scope > .it-toolkit-vm-info-copy')
    if (!root) {
      root = element('div', 'it-toolkit-vm-info-copy')
      heading.append(root)
    }
    if (!root.querySelector('.it-toolkit-vm-info-copy-quick')) {
      root.replaceChildren()
      const quick = element('button', 'it-toolkit-vm-info-copy-button it-toolkit-vm-info-copy-quick', 'Copy nhanh')
      quick.type = 'button'
      quick.title = 'Sao chép ngay toàn bộ thông tin VM'
      quick.addEventListener('click', copyCurrentVmInfo)
      const advanced = element('button', 'it-toolkit-vm-info-copy-button it-toolkit-vm-info-copy-advanced', 'Copy nâng cao')
      advanced.type = 'button'
      advanced.title = 'Chỉnh sửa, thêm nội dung và Tag Element trước khi sao chép'
      advanced.addEventListener('click', openVmComposer)
      root.append(quick, advanced)
    }
    let status = document.getElementById('it-toolkit-vm-info-toast')
    if (!status) {
      status = element('div', 'it-toolkit-vm-info-copy-status')
      status.id = 'it-toolkit-vm-info-toast'
      status.setAttribute('role', 'status')
      status.setAttribute('aria-live', 'polite')
      document.body.append(status)
    }
    const quick = root.querySelector('.it-toolkit-vm-info-copy-quick')
    if (quick) {
      quick.disabled = state.vmInfoBusy
      quick.classList.toggle('is-copied', state.vmInfoCopied)
      quick.classList.toggle('is-error', state.vmInfoKind === 'error')
      const label = state.vmInfoBusy ? 'Đang lấy...' : state.vmInfoCopied ? '✓ Đã sao chép' : 'Copy nhanh'
      if (quick.textContent !== label) quick.textContent = label
    }
    const advanced = root.querySelector('.it-toolkit-vm-info-copy-advanced')
    if (advanced) {
      advanced.disabled = state.vmComposerLoading
      advanced.classList.toggle('is-open', state.vmComposerOpen)
      const label = state.vmComposerLoading ? 'Đang mở...' : 'Copy nâng cao'
      if (advanced.textContent !== label) advanced.textContent = label
    }
    if (status) {
      if (status.textContent !== state.vmInfoText) status.textContent = state.vmInfoText
      status.classList.remove('is-success', 'is-error', 'is-working')
      if (state.vmInfoKind) status.classList.add(`is-${state.vmInfoKind}`)
      status.hidden = !state.vmInfoText
      if (state.vmInfoText && state.vmInfoKind !== 'working') {
        window.clearTimeout(vmInfoToastTimer)
        vmInfoToastTimer = window.setTimeout(() => {
          state.vmInfoText = ''
          scheduleRender()
        }, 2600)
      }
    }
  }

  function renderOtpTool() {
    const control = otpControl()
    if (!control) {
      if (document.querySelector('.it-toolkit-otp-tools, .it-toolkit-otp-anchor') ||
          document.getElementById(otpMenuId) || state.otpCodes.length || state.otpLoaded) {
        removeOtpTool()
      }
      return
    }
    let anchor = control.dialog?.querySelector('.it-toolkit-otp-anchor')
    if (!anchor) {
      const candidates = [...(control.dialog?.querySelectorAll('label, strong, span, div, p') ?? [])]
      anchor = candidates.find((node) => {
        const text = normalizedText(node)
        return text.length <= 100 && /nhập mã xác thực/.test(text)
      }) || control.label || control.dialog?.querySelector('.ui-dialog-content') || control.dialog
      if (!anchor) return
      anchor.classList.add('it-toolkit-otp-anchor')
    }
    let root = anchor.querySelector(':scope > .it-toolkit-otp-tools')
    if (!root) {
      root = element('div', 'it-toolkit-otp-tools')
      const button = element('button', 'it-toolkit-otp-button', 'Đang tải mã...')
      button.type = 'button'
      button.title = 'Điền mã OTP đang hiển thị'
      button.addEventListener('click', pasteAuthenticatorCode)
      const picker = element('button', 'it-toolkit-otp-picker', '▾')
      picker.type = 'button'
      picker.title = 'Chọn mã Authenticator khác'
      picker.setAttribute('aria-label', 'Chọn mã Authenticator khác')
      picker.setAttribute('aria-controls', otpMenuId)
      picker.addEventListener('click', toggleAuthenticatorCodes)
      root.append(button, picker, element('span', 'it-toolkit-otp-status'))
      anchor.append(root)
    }
    if (!state.otpLoaded && !state.otpBusy) void loadAuthenticatorCodes(false)
    const selected = selectedOtpCode()
    const button = root.querySelector('.it-toolkit-otp-button')
    if (button) {
      button.disabled = state.otpBusy
      const account = selected ? selected.issuer || selected.label || 'Authenticator' : ''
      const label = selected ? `${account}: ${selected.code}` :
        state.otpBusy ? 'Đang tải mã...' : 'Chọn mã OTP'
      if (button.textContent !== label) button.textContent = label
      button.classList.toggle('is-success', state.otpKind === 'success')
    }
    const picker = root.querySelector('.it-toolkit-otp-picker')
    if (picker) {
      picker.disabled = state.otpBusy
      picker.setAttribute('aria-expanded', String(state.otpMenuOpen))
    }
    let menu = document.getElementById(otpMenuId)
    if (!menu) {
      menu = element('div', 'it-toolkit-otp-menu')
      menu.id = otpMenuId
      menu.setAttribute('role', 'listbox')
      document.body.append(menu)
    }
    if (menu) {
      menu.hidden = !state.otpMenuOpen
      const signature = `${state.otpSelectedId}|${state.otpCodes.map((item) => `${item.id}:${item.code}`).join('|')}`
      if (menu.dataset.signature !== signature) {
        menu.dataset.signature = signature
        menu.replaceChildren(...state.otpCodes.map((item) => {
          const itemButton = element('button', 'it-toolkit-otp-account')
          itemButton.type = 'button'
          itemButton.append(
            element('strong', '', `${item.issuer || 'Authenticator'}: ${item.code}`),
            element('small', '', item.label || ''),
          )
          itemButton.classList.toggle('is-selected', item.id === state.otpSelectedId)
          itemButton.addEventListener('click', () => fillOtpCode(item))
          return itemButton
        }))
      }
      positionOtpMenu(menu, root)
    }
    const status = root.querySelector('.it-toolkit-otp-status')
    if (status) {
      if (status.textContent !== state.otpText) status.textContent = state.otpText
      status.classList.toggle('is-error', state.otpKind === 'error')
      status.hidden = !state.otpText || state.otpKind === 'success'
    }
  }

  function render() {
    renderQueued = false
    if (stopped) return
    if (location.pathname === servicePath) renderService()
    if (location.pathname === createPath || location.pathname === createPlusPath) renderCreate()
    if (location.pathname === detailPath) {
      renderDetail()
    }
    renderVmComposer()
    renderOtpTool()
  }

  function scheduleRender() {
    if (stopped || renderQueued) return
    renderQueued = true
    queueMicrotask(render)
  }

  if (globalThis.chrome?.runtime?.onMessage?.addListener) {
    runtimeMessageHandler = (message) => {
      if (message?.type === 'toolkit:portal-tools-enabled') {
        setPortalToolsEnabled(message.enabled !== false)
        return
      }
      if (message?.type === 'toolkit:vm-config-updated' &&
          (location.pathname === createPath || location.pathname === createPlusPath)) {
        state.config = message.config ?? null
        state.vmName = typeof message.vmName === 'string' ? message.vmName.trim() : ''
        const summary = state.config ? configText(state.config) : 'chưa có cấu hình'
        setStatus(`Đã nhận cấu hình mới: ${summary}.`, 'success')
      }
    }
    globalThis.chrome.runtime.onMessage.addListener(runtimeMessageHandler)
  }
  sendMessage({ type: 'toolkit:get-portal-tools-enabled' }).then((response) => {
    if (typeof response?.enabled === 'boolean') setPortalToolsEnabled(response.enabled)
  }).catch(() => {})

  if (location.pathname === createPath || location.pathname === createPlusPath) {
    sendMessage({ type: 'toolkit:get-vm-config' }).then((response) => {
      if (response?.config) state.config = response.config
      else if (response?.error) setStatus(response.error, 'error')
      state.vmName = typeof response?.vmName === 'string' ? response.vmName.trim() : ''
      scheduleRender()
    }).catch((error) => setStatus(error instanceof Error ? error.message : String(error), 'error'))
    void loadPasswordOptions()
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        sendMessage({ type: 'toolkit:get-vm-config' }).then((response) => {
          state.config = response?.config ?? null
          state.vmName = typeof response?.vmName === 'string' ? response.vmName.trim() : ''
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
    if (runtimeMessageHandler && globalThis.chrome?.runtime?.onMessage?.removeListener) {
      globalThis.chrome.runtime.onMessage.removeListener(runtimeMessageHandler)
    }
    window.clearTimeout(vmInfoToastTimer)
    window.clearTimeout(otpRefreshTimer)
    removeOtpTool()
    document.querySelector('.it-toolkit-vm-composer-overlay')?.remove()
    document.getElementById('it-toolkit-vm-info-toast')?.remove()
    document.getElementById('it-toolkit-password-options-popover')?.remove()
  }, { once: true })
  scheduleRender()
})()
