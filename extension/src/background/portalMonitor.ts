import { isPortalPageUrl } from '../services/portalAccess'
import { saveRecords, type CheckRecord } from '../services/storage'
import {
  applyPortalMonitorSnapshot, computingErrorMonitorUrl, defaultPortalMonitorState,
  isPortalMonitorNotificationEnabled, isPortalMonitorSourceEnabled, isPortalMonitorUrl, normalizePortalMonitorSettings,
  normalizePortalMonitorState, portalMonitorAlarm, portalMonitorSettingsKey,
  portalMonitorStateKey, ticketMonitorUrl, validPortalMonitorSnapshot,
  type PortalMonitorSettings, type PortalMonitorSource, type PortalMonitorState,
} from '../services/portalMonitor'

let snapshotQueue: Promise<void> = Promise.resolve()
let migrationPromise: Promise<void> = Promise.resolve()
const portalMonitorDataVersionKey = 'portalMonitorDataVersion'
const portalMonitorDataVersion = 3

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
  const saved = await chrome.storage.local.get([portalMonitorDataVersionKey, portalMonitorStateKey])
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
  await chrome.storage.local.set({
    [portalMonitorDataVersionKey]: portalMonitorDataVersion,
    [portalMonitorStateKey]: next,
  })
  await updateBadge(next.unread)
}

async function syncMonitorAlarm(settings?: PortalMonitorSettings): Promise<void> {
  if (!chrome.alarms?.create || !chrome.alarms?.clear) return
  const next = settings ?? (await loadMonitorData()).settings
  await chrome.alarms.clear(portalMonitorAlarm)
  if (next.enabled && (next.ticketEnabled || next.computingErrorEnabled) && next.intervalSeconds >= 30) {
    const intervalMinutes = next.intervalSeconds / 60
    chrome.alarms.create(portalMonitorAlarm, {
      delayInMinutes: intervalMinutes,
      periodInMinutes: intervalMinutes,
    })
  }
}

async function reloadMonitoredTabs(settings?: PortalMonitorSettings): Promise<number> {
  const next = settings ?? (await loadMonitorData()).settings
  if (!next.enabled || !chrome.tabs?.query || !chrome.tabs?.reload) return 0
  const tabs = await chrome.tabs.query({ url: ['https://portal.longvan.vn/*'] })
  const monitored = tabs.filter((tab) => {
    if (!tab.url) return false
    return (next.ticketEnabled && isPortalMonitorUrl(tab.url, 'ticket')) ||
      (next.computingErrorEnabled && isPortalMonitorUrl(tab.url, 'computingError'))
  })
  await Promise.allSettled(monitored.flatMap((tab) => tab.id === undefined ? [] : [chrome.tabs.reload(tab.id)]))
  return monitored.length
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
  const result = applyPortalMonitorSnapshot(state, snapshot)
  await saveMonitorState(result.state)
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

async function saveSettings(value: unknown): Promise<{
  settings: PortalMonitorSettings
  state: PortalMonitorState
  reloaded: number
}> {
  const previous = await loadMonitorData()
  const settings = normalizePortalMonitorSettings(value)
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
  const reloaded = settings.enabled ? await reloadMonitoredTabs(settings) : 0
  return { settings, state, reloaded }
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
  migrationPromise = migratePortalMonitorData().catch(() => {})
  void loadMonitorData().then(({ settings, state }) =>
    Promise.all([syncMonitorAlarm(settings), updateBadge(state.unread)]),
  ).catch(() => {})

  chrome.alarms?.onAlarm?.addListener((alarm) => {
    if (alarm.name === portalMonitorAlarm) void reloadMonitoredTabs().catch(() => {})
  })
  chrome.runtime.onStartup?.addListener(() => {
    void loadMonitorData().then(({ settings, state }) =>
      Promise.all([syncMonitorAlarm(settings), updateBadge(state.unread)]),
    ).catch(() => {})
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
    if (message?.type === 'toolkit:get-monitor') {
      void loadMonitorData().then((data) => respond({ ...data, monitorVersion: 13 }), (error) =>
        respond({ error: error instanceof Error ? error.message : String(error) }))
      return true
    }
    if (message?.type === 'toolkit:save-monitor') {
      void saveSettings(message.settings).then(respond, (error) =>
        respond({ error: error instanceof Error ? error.message : String(error) }))
      return true
    }
    if (message?.type === 'toolkit:monitor-refresh-now') {
      void reloadMonitoredTabs().then((reloaded) => respond({ reloaded }), (error) =>
        respond({ error: error instanceof Error ? error.message : String(error) }))
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
