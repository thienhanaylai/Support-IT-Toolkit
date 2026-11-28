import { isPortalPageUrl } from '../services/portalAccess'
import { saveRecords, type CheckRecord } from '../services/storage'
import {
  applyPortalMonitorSnapshot, computingErrorMonitorUrl, defaultPortalMonitorState,
  isActionableTicket, isPortalMonitorNotificationEnabled, isPortalMonitorSourceEnabled, isPortalMonitorUrl,
  normalizePortalMonitorSettings,
  normalizePortalMonitorState, portalMonitorAlarm, portalMonitorSettingsKey, portalMonitorSourceAlarm,
  portalMonitorStateKey, ticketMonitorUrl, validPortalMonitorSnapshot,
  type PortalMonitorSettings, type PortalMonitorSource, type PortalMonitorState,
} from '../services/portalMonitor'

let snapshotQueue: Promise<void> = Promise.resolve()
let migrationPromise: Promise<void> = Promise.resolve()
const portalMonitorDataVersionKey = 'portalMonitorDataVersion'
const portalMonitorDataVersion = 5

async function loadMonitorData(): Promise<{ settings: PortalMonitorSettings; state: PortalMonitorState }> {
  await migrationPromise
  const saved = await chrome.storage.local.get([portalMonitorSettingsKey, portalMonitorStateKey])
  return {
    settings: normalizePortalMonitorSettings(saved[portalMonitorSettingsKey]),
    state: normalizePortalMonitorState(saved[portalMonitorStateKey] ?? defaultPortalMonitorState),
  }
}

async function updateBadge(unread: number): Promise<void> {
  if (!chrome.action?.setBadgeText) return
  await chrome.action.setBadgeBackgroundColor({ color: '#d93025' }).catch(() => {})
  await chrome.action.setBadgeText({ text: unread > 0 ? (unread > 99 ? '99+' : String(unread)) : '' }).catch(() => {})
}

async function saveMonitorState(state: PortalMonitorState): Promise<void> {
  await chrome.storage.local.set({ [portalMonitorStateKey]: state })
  await updateBadge(state.unread)
}

async function migratePortalMonitorData(): Promise<void> {
  const saved = await chrome.storage.local.get([
    portalMonitorDataVersionKey,
    portalMonitorSettingsKey,
    portalMonitorStateKey,
  ])
  const previousVersion = Number(saved[portalMonitorDataVersionKey]) || 0
  if (previousVersion >= portalMonitorDataVersion) return
  const state = normalizePortalMonitorState(saved[portalMonitorStateKey] ?? defaultPortalMonitorState)
  let next = state
  if (previousVersion < 2) {
    const lastCheckedAt = { ...state.lastCheckedAt }
    delete lastCheckedAt.computingError
    next = {
      ...state,
      initialized: { ...state.initialized, computingError: false },
      seen: { ...state.seen, computingError: [] },
      notified: { ...state.notified, computingError: [] },
      unread: Math.max(0, state.unread - state.unreadBySource.computingError),
      unreadBySource: { ...state.unreadBySource, computingError: 0 },
      totals: { ...state.totals, computingError: 0 },
      activeCounts: { ...state.activeCounts, computingError: 0 },
      lastCheckedAt,
      recent: state.recent.filter((item) => item.source !== 'computingError'),
    }
    if (chrome.notifications?.getAll && chrome.notifications?.clear) {
      const notifications = await chrome.notifications.getAll().catch(() => ({}))
      await Promise.allSettled(Object.keys(notifications)
        .filter((id) => id.startsWith('portal-monitor-computingError-'))
        .map((id) => chrome.notifications.clear(id)))
    }
  }
  if (previousVersion < 3 && next.recent.length) {
    const ticketItems = next.recent.filter((item) => item.source === 'ticket')
    const computingItems = next.recent.filter((item) => item.source === 'computingError')
    await saveMonitorHistory('ticket', ticketItems).catch(() => {})
    await saveMonitorHistory('computingError', computingItems).catch(() => {})
  }
  if (previousVersion < 4) {
    const invalidTicketEvents = next.recent.filter((item) =>
      item.source === 'ticket' && !isActionableTicket(item))
    next = {
      ...next,
      initialized: { ...next.initialized, ticket: false },
      seen: { ...next.seen, ticket: [] },
      notified: { ...next.notified, ticket: [] },
      unread: Math.max(0, next.unread - invalidTicketEvents.length),
      unreadBySource: {
        ...next.unreadBySource,
        ticket: Math.max(0, next.unreadBySource.ticket - invalidTicketEvents.length),
      },
      activeCounts: { ...next.activeCounts, ticket: 0 },
      recent: next.recent.filter((item) => item.source !== 'ticket' || isActionableTicket(item)),
    }
  }
  const nextSettings = normalizePortalMonitorSettings(saved[portalMonitorSettingsKey])
  if (previousVersion < 5) {
    nextSettings.enabled = false
    nextSettings.ticketEnabled = false
    nextSettings.computingErrorEnabled = false
    delete nextSettings.ticketTabId
    delete nextSettings.computingErrorTabId
  }
  await chrome.storage.local.set({
    [portalMonitorDataVersionKey]: portalMonitorDataVersion,
    [portalMonitorSettingsKey]: nextSettings,
    [portalMonitorStateKey]: next,
  })
  await updateBadge(next.unread)
}

async function syncMonitorAlarm(settings?: PortalMonitorSettings): Promise<void> {
  if (!chrome.alarms?.create || !chrome.alarms?.clear) return
  const next = settings ?? (await loadMonitorData()).settings
  await chrome.alarms.clear(portalMonitorAlarm)
  const intervalMinutes = next.intervalSeconds / 60
  for (const source of ['ticket', 'computingError'] as const) {
    const alarmName = portalMonitorSourceAlarm(source)
    const selected = source === 'ticket'
      ? next.ticketEnabled && next.ticketTabId !== undefined
      : next.computingErrorEnabled && next.computingErrorTabId !== undefined
    if (!next.enabled || !selected || next.intervalSeconds < 30) {
      await chrome.alarms.clear(alarmName)
      continue
    }
    const existing = chrome.alarms.get ? await chrome.alarms.get(alarmName) : undefined
    if (existing?.periodInMinutes === intervalMinutes) continue
    await chrome.alarms.clear(alarmName)
    chrome.alarms.create(alarmName, {
      delayInMinutes: intervalMinutes,
      periodInMinutes: intervalMinutes,
    })
  }
}

function selectedTabId(settings: PortalMonitorSettings, source: PortalMonitorSource): number | undefined {
  return source === 'ticket' ? settings.ticketTabId : settings.computingErrorTabId
}

function portalTabUrl(tab: chrome.tabs.Tab): string {
  return tab.url || tab.pendingUrl || ''
}

async function selectedMonitorTabIsValid(tabId: number, source: PortalMonitorSource): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId)
    const url = portalTabUrl(tab)
    // A newly created background tab can briefly have neither url nor
    // pendingUrl. Its tab ID is still valid and onUpdated/onRemoved will
    // clear it later if loading fails or it navigates elsewhere.
    return !url || isPortalMonitorUrl(url, source)
  } catch {
    return false
  }
}

async function syncMonitorTabSelection(settings?: PortalMonitorSettings): Promise<void> {
  if (!chrome.tabs?.query || !chrome.tabs?.sendMessage) return
  const next = settings ?? (await loadMonitorData()).settings
  const tabs = await chrome.tabs.query({ url: ['https://portal.longvan.vn/*'] })
  await Promise.allSettled(tabs.flatMap((tab) => {
    const tabUrl = portalTabUrl(tab)
    if (tab.id === undefined || !tabUrl) return []
    const source = isPortalMonitorUrl(tabUrl, 'ticket')
      ? 'ticket'
      : isPortalMonitorUrl(tabUrl, 'computingError') ? 'computingError' : undefined
    if (!source) return []
    return [chrome.tabs.sendMessage(tab.id, {
      type: 'toolkit:monitor-tab-selection',
      source,
      selected: tab.id === selectedTabId(next, source),
    })]
  }))
}

async function reloadMonitoredTabs(
  settings?: PortalMonitorSettings,
  excludedTabIds = new Set<number>(),
  onlySource?: PortalMonitorSource,
): Promise<number> {
  const next = settings ?? (await loadMonitorData()).settings
  if (!next.enabled || !chrome.tabs?.query || !chrome.tabs?.reload) return 0
  const tabs = await chrome.tabs.query({ url: ['https://portal.longvan.vn/*'] })
  const monitored = tabs.filter((tab) => {
    const tabUrl = portalTabUrl(tab)
    if (!tabUrl || tab.id === undefined || excludedTabIds.has(tab.id)) return false
    return (onlySource !== 'computingError' &&
      next.ticketEnabled && tab.id === next.ticketTabId && isPortalMonitorUrl(tabUrl, 'ticket')) ||
      (onlySource !== 'ticket' && next.computingErrorEnabled && tab.id === next.computingErrorTabId &&
        isPortalMonitorUrl(tabUrl, 'computingError'))
  })
  await Promise.allSettled(monitored.flatMap((tab) => tab.id === undefined ? [] : [chrome.tabs.reload(tab.id)]))
  return monitored.length
}

async function openMissingMonitorTabs(settings: PortalMonitorSettings): Promise<{
  settings: PortalMonitorSettings
  openedTabIds: number[]
}> {
  const next = { ...settings }
  const openedTabIds: number[] = []
  if (!next.enabled || !chrome.tabs?.create) return { settings: next, openedTabIds }
  const sources: PortalMonitorSource[] = ['ticket', 'computingError']
  for (const source of sources) {
    const sourceEnabled = source === 'ticket' ? next.ticketEnabled : next.computingErrorEnabled
    if (!sourceEnabled || selectedTabId(next, source) !== undefined) continue
    const tab = await chrome.tabs.create({
      url: source === 'ticket' ? ticketMonitorUrl : computingErrorMonitorUrl,
      active: false,
    })
    if (tab.id === undefined) continue
    openedTabIds.push(tab.id)
    if (source === 'ticket') next.ticketTabId = tab.id
    else next.computingErrorTabId = tab.id
  }
  return { settings: next, openedTabIds }
}

export function portalMonitorNotificationTitle(source: PortalMonitorSource, count: number): string {
  return source === 'ticket'
    ? `${count} Ticket mới`
    : `${count} Computing triển khai lỗi`
}

async function notifyNewItems(
  source: PortalMonitorSource,
  count: number,
  title: string,
  notificationId: string,
): Promise<void> {
  if (!chrome.notifications?.create || count < 1) return
  const message = count === 1 ? title : `${title}\nVà ${count - 1} mục mới khác.`
  await chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: portalMonitorNotificationTitle(source, count),
    message,
    contextMessage: 'IT Support Toolkit',
  }).catch(() => {})
}

async function notifyCurrentItems(
  source: PortalMonitorSource,
  state: PortalMonitorState,
): Promise<boolean> {
  if (!chrome.notifications?.create) throw new Error('Trình duyệt không hỗ trợ thông báo extension.')
  const count = state.activeCounts[source]
  if (count < 1) return false
  const notificationId = `portal-monitor-current-${source}`
  const recent = state.recent.find((item) => item.source === source)
  await chrome.notifications.clear(notificationId).catch(() => {})
  await chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: portalMonitorNotificationTitle(source, count),
    message: recent?.title ?? (source === 'ticket'
      ? `Portal hiện có ${count} Ticket trạng thái NEW.`
      : `Portal hiện có ${count} VM trạng thái Triển khai lỗi.`),
    contextMessage: 'IT Support Toolkit',
  })
  return true
}

async function setSourceNotification(
  source: unknown,
  enabled: unknown,
): Promise<{ settings: PortalMonitorSettings; notified: boolean }> {
  if ((source !== 'ticket' && source !== 'computingError') || typeof enabled !== 'boolean') {
    throw new Error('Thiết lập thông báo không hợp lệ.')
  }
  const { settings, state } = await loadMonitorData()
  const next = {
    ...settings,
    [source === 'ticket' ? 'ticketNotificationsEnabled' : 'computingErrorNotificationsEnabled']: enabled,
  }
  await chrome.storage.local.set({ [portalMonitorSettingsKey]: next })
  if (!enabled) {
    if (chrome.notifications?.getAll && chrome.notifications?.clear) {
      const notifications = await chrome.notifications.getAll().catch(() => ({}))
      await Promise.allSettled(Object.keys(notifications)
        .filter((id) => id.startsWith(`portal-monitor-${source}-`) ||
          id === `portal-monitor-current-${source}`)
        .map((id) => chrome.notifications.clear(id)))
    }
    return { settings: next, notified: false }
  }
  return { settings: next, notified: await notifyCurrentItems(source, state) }
}

async function saveMonitorHistory(
  source: PortalMonitorSource,
  items: PortalMonitorState['recent'],
): Promise<void> {
  const records = items.map<CheckRecord>((item) => ({
    id: `portal-monitor:${source}:${item.id}:${item.at}`,
    at: item.at,
    tool: source === 'ticket' ? 'Theo dõi Ticket' : 'Computing triển khai lỗi',
    target: item.title,
    source: 'Portal Long Vân · Theo dõi',
    status: source === 'ticket' ? 'warn' : 'error',
    result: {
      type: 'portal_monitor',
      monitorSource: source,
      portalId: item.id,
      title: item.title,
      status: item.status ?? '',
      assignee: item.assignee ?? '',
      detail: item.detail ?? '',
      url: item.url,
    },
  }))
  await saveRecords(records)
}

async function receiveSnapshot(snapshot: unknown, sender: chrome.runtime.MessageSender): Promise<void> {
  const senderUrl = sender.tab?.url
  if (!senderUrl || !isPortalPageUrl(senderUrl) || !validPortalMonitorSnapshot(snapshot) ||
      !isPortalMonitorUrl(senderUrl, snapshot.source)) return
  const { settings, state } = await loadMonitorData()
  if (!isPortalMonitorSourceEnabled(snapshot.source, settings)) return
  if (sender.tab?.id !== selectedTabId(settings, snapshot.source)) return
  const result = applyPortalMonitorSnapshot(state, snapshot)
  await saveMonitorState(result.state)
  if (chrome.notifications?.clear) {
    const remainingNotificationIds = new Set(result.state.recent.map((item) => item.notificationId))
    const removedNotificationIds = [...new Set(state.recent
      .filter((item) => !result.state.recent.some((current) =>
        current.source === item.source && current.id === item.id))
      .map((item) => item.notificationId))]
      .filter((id) => !remainingNotificationIds.has(id))
    await Promise.allSettled(removedNotificationIds.map((id) => chrome.notifications.clear(id)))
  }
  if (result.added.length) {
    const notificationId = result.state.recent[0]?.notificationId ?? `portal-monitor-${Date.now()}`
    const addedIds = new Set(result.added.map((item) => item.id))
    const historyItems = result.state.recent.filter((item) =>
      item.source === snapshot.source && addedIds.has(item.id))
    await saveMonitorHistory(snapshot.source, historyItems).catch(() => {})
    if (isPortalMonitorNotificationEnabled(snapshot.source, settings)) {
      await notifyNewItems(snapshot.source, result.added.length, result.added[0].title, notificationId)
    }
  }
}

async function saveSettings(value: unknown, openMissingTabs = false): Promise<{
  settings: PortalMonitorSettings
  state: PortalMonitorState
  reloaded: number
  opened: number
}> {
  const previous = await loadMonitorData()
  const requested = normalizePortalMonitorSettings(value)
  let settings = { ...requested }
  if (settings.ticketTabId !== undefined &&
      !await selectedMonitorTabIsValid(settings.ticketTabId, 'ticket')) {
    delete settings.ticketTabId
  }
  if (settings.computingErrorTabId !== undefined &&
      !await selectedMonitorTabIsValid(settings.computingErrorTabId, 'computingError')) {
    delete settings.computingErrorTabId
  }
  if (!settings.enabled) {
    settings.ticketEnabled = false
    settings.computingErrorEnabled = false
  }
  let openedTabIds: number[] = []
  if (openMissingTabs) {
    const opened = await openMissingMonitorTabs(settings)
    settings = opened.settings
    openedTabIds = opened.openedTabIds
  }
  const state = normalizePortalMonitorState(previous.state)
  const resumed = settings.enabled && !previous.settings.enabled
  if (resumed || !settings.ticketEnabled || !previous.settings.ticketEnabled) {
    state.initialized.ticket = false
    state.seen.ticket = []
  }
  if (resumed || !settings.computingErrorEnabled || !previous.settings.computingErrorEnabled) {
    state.initialized.computingError = false
    state.seen.computingError = []
  }
  await chrome.storage.local.set({
    [portalMonitorSettingsKey]: settings,
    [portalMonitorStateKey]: state,
  })
  await syncMonitorAlarm(settings)
  await syncMonitorTabSelection(settings)
  const reloaded = settings.enabled
    ? await reloadMonitoredTabs(settings, new Set(openedTabIds))
    : 0
  return { settings, state, reloaded, opened: openedTabIds.length }
}

async function selectMonitorTab(
  source: unknown,
  tabId: unknown,
): Promise<{ settings: PortalMonitorSettings }> {
  if ((source !== 'ticket' && source !== 'computingError') ||
      !Number.isInteger(Number(tabId)) || Number(tabId) <= 0) {
    throw new Error('Tab theo dõi không hợp lệ.')
  }
  const id = Number(tabId)
  const tab = await chrome.tabs.get(id)
  if (!tab.url || !isPortalMonitorUrl(tab.url, source)) {
    throw new Error(source === 'ticket'
      ? 'Hãy mở đúng trang Danh sách Ticket rồi chọn lại.'
      : 'Hãy mở đúng trang Computing đang lọc Triển khai lỗi rồi chọn lại.')
  }
  const { settings } = await loadMonitorData()
  const next = normalizePortalMonitorSettings({
    ...settings,
    [source === 'ticket' ? 'ticketTabId' : 'computingErrorTabId']: id,
  })
  await chrome.storage.local.set({ [portalMonitorSettingsKey]: next })
  await syncMonitorTabSelection(next)
  return { settings: next }
}

async function clearMonitorTab(source: unknown): Promise<{ settings: PortalMonitorSettings }> {
  if (source !== 'ticket' && source !== 'computingError') {
    throw new Error('Nguồn theo dõi không hợp lệ.')
  }
  const { settings } = await loadMonitorData()
  const next = { ...settings }
  if (source === 'ticket') delete next.ticketTabId
  else delete next.computingErrorTabId
  const hasActiveTab =
    (next.ticketEnabled && next.ticketTabId !== undefined) ||
    (next.computingErrorEnabled && next.computingErrorTabId !== undefined)
  if (!hasActiveTab) {
    next.enabled = false
    next.ticketEnabled = false
    next.computingErrorEnabled = false
  }
  await chrome.storage.local.set({ [portalMonitorSettingsKey]: next })
  await syncMonitorAlarm(next)
  await syncMonitorTabSelection(next)
  return { settings: next }
}

async function clearUnavailableMonitorTab(tabId: number, url?: string): Promise<void> {
  const { settings } = await loadMonitorData()
  const ticketUnavailable = settings.ticketTabId === tabId &&
    (!url || !isPortalMonitorUrl(url, 'ticket'))
  const computingUnavailable = settings.computingErrorTabId === tabId &&
    (!url || !isPortalMonitorUrl(url, 'computingError'))
  if (!ticketUnavailable && !computingUnavailable) return
  const next = { ...settings }
  if (ticketUnavailable) delete next.ticketTabId
  if (computingUnavailable) delete next.computingErrorTabId
  const hasActiveTab =
    (next.ticketEnabled && next.ticketTabId !== undefined) ||
    (next.computingErrorEnabled && next.computingErrorTabId !== undefined)
  if (!hasActiveTab) {
    next.enabled = false
    next.ticketEnabled = false
    next.computingErrorEnabled = false
  }
  await chrome.storage.local.set({ [portalMonitorSettingsKey]: next })
  await syncMonitorAlarm(next)
  await syncMonitorTabSelection(next)
}

async function disableMonitorForBrowserStartup(): Promise<void> {
  const { settings, state } = await loadMonitorData()
  const next = {
    ...settings,
    enabled: false,
    ticketEnabled: false,
    computingErrorEnabled: false,
  }
  delete next.ticketTabId
  delete next.computingErrorTabId
  await chrome.storage.local.set({ [portalMonitorSettingsKey]: next })
  await Promise.all([
    syncMonitorAlarm(next),
    syncMonitorTabSelection(next),
    updateBadge(state.unread),
  ])
}

async function markRead(): Promise<PortalMonitorState> {
  const { state } = await loadMonitorData()
  const next = {
    ...state,
    unread: 0,
    unreadBySource: { ticket: 0, computingError: 0 },
  }
  await saveMonitorState(next)
  return next
}

async function clearAllNotifications(): Promise<PortalMonitorState> {
  const { state } = await loadMonitorData()
  const next = {
    ...state,
    unread: 0,
    unreadBySource: { ticket: 0, computingError: 0 },
    recent: [],
  }
  await saveMonitorState(next)
  if (chrome.notifications?.getAll && chrome.notifications?.clear) {
    const notifications = await chrome.notifications.getAll().catch(() => ({}))
    await Promise.allSettled(Object.keys(notifications)
      .filter((id) => id.startsWith('portal-monitor-'))
      .map((id) => chrome.notifications.clear(id)))
  }
  return next
}

function removeRecentItems(
  state: PortalMonitorState,
  predicate: (item: PortalMonitorState['recent'][number]) => boolean,
): PortalMonitorState {
  const removed = state.recent.filter(predicate)
  if (!removed.length) return state
  const removedTicket = removed.filter((item) => item.source === 'ticket').length
  const removedComputing = removed.length - removedTicket
  return {
    ...state,
    unread: Math.max(0, state.unread - removed.length),
    unreadBySource: {
      ticket: Math.max(0, state.unreadBySource.ticket - removedTicket),
      computingError: Math.max(0, state.unreadBySource.computingError - removedComputing),
    },
    recent: state.recent.filter((item) => !predicate(item)),
  }
}

async function dismissRecentItem(
  source: unknown,
  id: unknown,
  open: boolean,
): Promise<PortalMonitorState> {
  if ((source !== 'ticket' && source !== 'computingError') || typeof id !== 'string') {
    throw new Error('Thông báo không hợp lệ.')
  }
  const { state } = await loadMonitorData()
  const target = state.recent.find((item) => item.source === source && item.id === id)
  if (!target) return state
  if (open && isPortalPageUrl(target.url)) await chrome.tabs.create({ url: target.url })
  const next = removeRecentItems(state, (item) => item.source === source && item.id === id)
  await saveMonitorState(next)
  await chrome.notifications?.clear(target.notificationId).catch(() => {})
  return next
}

async function openNotification(notificationId: string): Promise<void> {
  const { state } = await loadMonitorData()
  if (notificationId === 'portal-monitor-current-ticket') {
    await chrome.tabs.create({ url: ticketMonitorUrl })
    await chrome.notifications?.clear(notificationId).catch(() => {})
    return
  }
  if (notificationId === 'portal-monitor-current-computingError') {
    await chrome.tabs.create({ url: computingErrorMonitorUrl })
    await chrome.notifications?.clear(notificationId).catch(() => {})
    return
  }
  const target = state.recent.find((item) => item.notificationId === notificationId)
  if (target?.url && isPortalPageUrl(target.url)) await chrome.tabs.create({ url: target.url })
  const next = removeRecentItems(state, (item) => item.notificationId === notificationId)
  await saveMonitorState(next)
  await chrome.notifications?.clear(notificationId).catch(() => {})
}

export function registerPortalMonitor(): void {
  let browserStartupReset = false
  migrationPromise = migratePortalMonitorData().catch(() => {})
  const initialMonitorSync = loadMonitorData().then(({ settings, state }) => {
    if (browserStartupReset) return
    return Promise.all([syncMonitorAlarm(settings), syncMonitorTabSelection(settings), updateBadge(state.unread)])
  }).catch(() => {})

  chrome.alarms?.onAlarm?.addListener((alarm) => {
    if (alarm.name === portalMonitorAlarm) void reloadMonitoredTabs().catch(() => {})
    if (alarm.name === portalMonitorSourceAlarm('ticket')) {
      void reloadMonitoredTabs(undefined, new Set(), 'ticket').catch(() => {})
    }
    if (alarm.name === portalMonitorSourceAlarm('computingError')) {
      void reloadMonitoredTabs(undefined, new Set(), 'computingError').catch(() => {})
    }
  })
  chrome.runtime.onStartup?.addListener(() => {
    browserStartupReset = true
    void initialMonitorSync.then(() => disableMonitorForBrowserStartup()).catch(() => {})
  })
  chrome.tabs?.onRemoved?.addListener((tabId) => {
    void clearUnavailableMonitorTab(tabId).catch(() => {})
  })
  chrome.tabs?.onUpdated?.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url !== undefined) {
      void clearUnavailableMonitorTab(tabId, tab.url ?? changeInfo.url).catch(() => {})
    }
  })
  chrome.notifications?.onClicked?.addListener((notificationId) => {
    if (notificationId.startsWith('portal-monitor-')) void openNotification(notificationId).catch(() => {})
  })
  chrome.runtime.onMessage.addListener((message: {
    type?: string
    snapshot?: unknown
    settings?: unknown
    source?: unknown
    id?: unknown
    open?: unknown
    enabled?: unknown
    tabId?: unknown
    openMissingTabs?: unknown
  }, sender, respond) => {
    if (message?.type === 'toolkit:monitor-snapshot') {
      const receive = () => receiveSnapshot(message.snapshot, sender)
      snapshotQueue = snapshotQueue.then(receive, receive)
      void snapshotQueue.then(
        () => respond({ accepted: true }),
        () => respond({ accepted: false }),
      )
      return true
    }
    if (message?.type === 'toolkit:monitor-get-tab-selection') {
      void loadMonitorData().then(({ settings }) => {
        const source = message.source
        const senderTab = sender.tab
        const selected = (source === 'ticket' || source === 'computingError') &&
          senderTab?.id === selectedTabId(settings, source) &&
          Boolean(senderTab?.url && isPortalMonitorUrl(senderTab.url, source))
        respond({ selected })
      }, (error) => respond({ error: error instanceof Error ? error.message : String(error) }))
      return true
    }
    if (message?.type === 'toolkit:get-monitor') {
      void loadMonitorData().then((data) => respond({ ...data, monitorVersion: 14 }), (error) =>
        respond({ error: error instanceof Error ? error.message : String(error) }))
      return true
    }
    if (message?.type === 'toolkit:save-monitor') {
      void saveSettings(message.settings, message.openMissingTabs === true).then(respond, (error) =>
        respond({ error: error instanceof Error ? error.message : String(error) }))
      return true
    }
    if (message?.type === 'toolkit:monitor-refresh-now') {
      void loadMonitorData()
        .then(({ settings }) => saveSettings(settings, true))
        .then(respond, (error) => respond({ error: error instanceof Error ? error.message : String(error) }))
      return true
    }
    if (message?.type === 'toolkit:monitor-mark-read') {
      void markRead().then((state) => respond({ state }), (error) =>
        respond({ error: error instanceof Error ? error.message : String(error) }))
      return true
    }
    if (message?.type === 'toolkit:monitor-clear-all') {
      void clearAllNotifications().then((state) => respond({ state }), (error) =>
        respond({ error: error instanceof Error ? error.message : String(error) }))
      return true
    }
    if (message?.type === 'toolkit:monitor-dismiss-item') {
      void dismissRecentItem(message.source, message.id, message.open === true)
        .then((state) => respond({ state }), (error) =>
          respond({ error: error instanceof Error ? error.message : String(error) }))
      return true
    }
    if (message?.type === 'toolkit:monitor-set-source-notification') {
      void setSourceNotification(message.source, message.enabled).then(respond, (error) =>
        respond({ error: error instanceof Error ? error.message : String(error) }))
      return true
    }
    if (message?.type === 'toolkit:monitor-select-tab') {
      void selectMonitorTab(message.source, message.tabId).then(respond, (error) =>
        respond({ error: error instanceof Error ? error.message : String(error) }))
      return true
    }
    if (message?.type === 'toolkit:monitor-clear-tab') {
      void clearMonitorTab(message.source).then(respond, (error) =>
        respond({ error: error instanceof Error ? error.message : String(error) }))
      return true
    }
    if (message?.type === 'toolkit:monitor-open-ticket') {
      void chrome.tabs.create({ url: ticketMonitorUrl }).then(() => respond({ opened: true }))
      return true
    }
    if (message?.type === 'toolkit:monitor-open-computing-error') {
      void chrome.tabs.create({ url: computingErrorMonitorUrl }).then(() => respond({ opened: true }))
      return true
    }
    return undefined
  })
}
