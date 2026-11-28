export const portalMonitorSettingsKey = 'portalMonitorSettings'
export const portalMonitorStateKey = 'portalMonitorState'
export const portalMonitorAlarm = 'portal-monitor-refresh'

export type PortalMonitorSource = 'ticket' | 'computingError'

export type PortalMonitorSettings = {
  enabled: boolean
  ticketEnabled: boolean
  computingErrorEnabled: boolean
  ticketNotificationsEnabled: boolean
  computingErrorNotificationsEnabled: boolean
  intervalSeconds: number
}

export type PortalMonitorItem = {
  id: string
  title: string
  url: string
  detail?: string
  status?: string
}

export type PortalMonitorSnapshot = {
  source: PortalMonitorSource
  items: PortalMonitorItem[]
  total: number
}

export type PortalMonitorEvent = PortalMonitorItem & {
  source: PortalMonitorSource
  at: string
  notificationId: string
}

export type PortalMonitorState = {
  initialized: Record<PortalMonitorSource, boolean>
  seen: Record<PortalMonitorSource, string[]>
  notified: Record<PortalMonitorSource, string[]>
  unread: number
  unreadBySource: Record<PortalMonitorSource, number>
  totals: Record<PortalMonitorSource, number>
  activeCounts: Record<PortalMonitorSource, number>
  lastCheckedAt: Partial<Record<PortalMonitorSource, string>>
  recent: PortalMonitorEvent[]
}

export const defaultPortalMonitorSettings: PortalMonitorSettings = {
  enabled: false,
  ticketEnabled: true,
  computingErrorEnabled: true,
  ticketNotificationsEnabled: true,
  computingErrorNotificationsEnabled: true,
  intervalSeconds: 300,
}

export const defaultPortalMonitorState: PortalMonitorState = {
  initialized: { ticket: false, computingError: false },
  seen: { ticket: [], computingError: [] },
  notified: { ticket: [], computingError: [] },
  unread: 0,
  unreadBySource: { ticket: 0, computingError: 0 },
  totals: { ticket: 0, computingError: 0 },
  activeCounts: { ticket: 0, computingError: 0 },
  lastCheckedAt: {},
  recent: [],
}

export const ticketMonitorUrl =
  'https://portal.longvan.vn/crm/pages/ticket/index.xhtml?orgId=LONGVAN&wsId=20.1087'
export const computingErrorMonitorUrl =
  'https://portal.longvan.vn/computing-manager/manager/computing/computing.xhtml?wsId=20.3&orgId=LONGVAN&status=2'

function dedupePortalMonitorEvents(items: PortalMonitorEvent[]): PortalMonitorEvent[] {
  const keys = new Set<string>()
  return items.filter((item) => {
    const key = `${item.source}:${item.id}`
    if (keys.has(key)) return false
    keys.add(key)
    return true
  }).slice(0, 30)
}

export function isComputingDeploymentErrorStatus(value: unknown): boolean {
  return typeof value === 'string' &&
    value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi-VN') === 'triển khai lỗi'
}

export function normalizePortalMonitorSettings(value: unknown): PortalMonitorSettings {
  const saved = value && typeof value === 'object'
    ? value as Partial<PortalMonitorSettings> & { intervalMinutes?: unknown }
    : {}
  const seconds = Number(saved.intervalSeconds)
  const legacyMinutes = Number(saved.intervalMinutes)
  // Migrate settings written before intervals were displayed in seconds.
  const interval = Number.isFinite(seconds)
    ? seconds
    : Number.isFinite(legacyMinutes) ? legacyMinutes * 60 : 300
  return {
    enabled: saved.enabled === true,
    ticketEnabled: saved.ticketEnabled !== false,
    computingErrorEnabled: saved.computingErrorEnabled !== false,
    ticketNotificationsEnabled: saved.ticketNotificationsEnabled !== false,
    computingErrorNotificationsEnabled: saved.computingErrorNotificationsEnabled !== false,
    intervalSeconds: Math.max(10, Math.round(interval)),
  }
}

export function isPortalMonitorNotificationEnabled(
  source: PortalMonitorSource,
  settings: PortalMonitorSettings,
): boolean {
  return source === 'ticket'
    ? settings.ticketNotificationsEnabled
    : settings.computingErrorNotificationsEnabled
}

export function normalizePortalMonitorState(value: unknown): PortalMonitorState {
  const saved = value && typeof value === 'object' ? value as Partial<PortalMonitorState> : {}
  const initialized = saved.initialized ?? defaultPortalMonitorState.initialized
  const seen = saved.seen ?? defaultPortalMonitorState.seen
  const notified = saved.notified ?? defaultPortalMonitorState.notified
  const unreadBySource = saved.unreadBySource ?? defaultPortalMonitorState.unreadBySource
  const totals = saved.totals ?? defaultPortalMonitorState.totals
  const activeCounts = saved.activeCounts ?? defaultPortalMonitorState.activeCounts
  const recent = Array.isArray(saved.recent) ? saved.recent.filter((item): item is PortalMonitorEvent =>
    Boolean(item && typeof item.id === 'string' && typeof item.title === 'string' &&
      typeof item.url === 'string' && (item.source === 'ticket' ||
        (item.source === 'computingError' && isComputingDeploymentErrorStatus(item.status))))) : []
  return {
    initialized: {
      ticket: initialized.ticket === true,
      computingError: initialized.computingError === true,
    },
    seen: {
      ticket: Array.isArray(seen.ticket) ? seen.ticket.filter((id): id is string => typeof id === 'string').slice(0, 500) : [],
      computingError: Array.isArray(seen.computingError)
        ? seen.computingError.filter((id): id is string => typeof id === 'string').slice(0, 500) : [],
    },
    notified: {
      ticket: Array.isArray(notified.ticket)
        ? notified.ticket.filter((id): id is string => typeof id === 'string').slice(0, 500) : [],
      computingError: Array.isArray(notified.computingError)
        ? notified.computingError.filter((id): id is string => typeof id === 'string').slice(0, 500) : [],
    },
    unread: Math.max(0, Number.isFinite(Number(saved.unread)) ? Math.round(Number(saved.unread)) : 0),
    unreadBySource: {
      ticket: Math.max(0, Number(unreadBySource.ticket) || 0),
      computingError: Math.max(0, Number(unreadBySource.computingError) || 0),
    },
    totals: {
      ticket: Math.max(0, Number(totals.ticket) || 0),
      computingError: Math.max(0, Number(totals.computingError) || 0),
    },
    activeCounts: {
      ticket: Math.max(0, Number(activeCounts.ticket) || 0),
      computingError: Math.max(0, Number(activeCounts.computingError) || 0),
    },
    lastCheckedAt: saved.lastCheckedAt && typeof saved.lastCheckedAt === 'object' ? saved.lastCheckedAt : {},
    recent: dedupePortalMonitorEvents(recent),
  }
}

export function isPortalMonitorSourceEnabled(
  source: PortalMonitorSource,
  settings: PortalMonitorSettings,
): boolean {
  return settings.enabled && (source === 'ticket' ? settings.ticketEnabled : settings.computingErrorEnabled)
}

export function isPortalMonitorUrl(value: string, source: PortalMonitorSource): boolean {
  try {
    const url = new URL(value)
    if (url.origin !== 'https://portal.longvan.vn') return false
    if (source === 'ticket') return url.pathname === '/crm/pages/ticket/index.xhtml'
    return url.pathname === '/computing-manager/manager/computing/computing.xhtml' &&
      url.searchParams.get('status') === '2'
  } catch {
    return false
  }
}

export function validPortalMonitorSnapshot(value: unknown): value is PortalMonitorSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<PortalMonitorSnapshot>
  return (snapshot.source === 'ticket' || snapshot.source === 'computingError') &&
    Array.isArray(snapshot.items) && snapshot.items.length <= 250 &&
    snapshot.items.every((item) => {
      if (!item || typeof item.id !== 'string' || item.id.length > 100 ||
          typeof item.title !== 'string' || item.title.length > 500 ||
          typeof item.url !== 'string' || item.url.length > 2048 ||
          (item.status !== undefined && (typeof item.status !== 'string' || item.status.length > 100))) return false
      if (snapshot.source === 'computingError' && !isComputingDeploymentErrorStatus(item.status)) return false
      try {
        const url = new URL(item.url)
        const expectedPath = snapshot.source === 'ticket'
          ? '/crm/pages/ticket/detail.xhtml'
          : '/computing-manager/manager/computing/computing_detail.xhtml'
        return url.origin === 'https://portal.longvan.vn' && url.pathname === expectedPath &&
          url.searchParams.get('id') === item.id
      } catch {
        return false
      }
    }) &&
    Number.isFinite(snapshot.total) && Number(snapshot.total) >= 0
}

export function applyPortalMonitorSnapshot(
  current: PortalMonitorState,
  snapshot: PortalMonitorSnapshot,
  now = new Date(),
): { state: PortalMonitorState; added: PortalMonitorItem[] } {
  const state = normalizePortalMonitorState(current)
  const source = snapshot.source
  const uniqueItems = snapshot.items.filter((item, index, items) =>
    items.findIndex((candidate) => candidate.id === item.id) === index)
  const currentIds = uniqueItems.map((item) => item.id)
  const checkedAt = now.toISOString()
  const isNewTicket = (item: PortalMonitorItem) =>
    source === 'ticket' &&
    ['new', 'mới'].includes((item.status ?? '').trim().toLocaleLowerCase('vi-VN'))
  const shouldNotifyCurrent = (item: PortalMonitorItem) =>
    isNewTicket(item) || source === 'computingError'
  const activeCount = source === 'ticket'
    ? uniqueItems.filter(isNewTicket).length
    : snapshot.total
  const notified = new Set(state.notified[source])

  if (!state.initialized[source]) {
    // Surface current actionable rows once: Ticket NEW and Computing deployment errors.
    const added = uniqueItems.filter((item) => shouldNotifyCurrent(item) && !notified.has(item.id))
    const notificationId = `portal-monitor-${source}-${now.getTime()}`
    const events = added.map<PortalMonitorEvent>((item) => ({
      ...item, source, at: checkedAt, notificationId,
    }))
    return {
      added,
      state: {
        ...state,
        initialized: { ...state.initialized, [source]: true },
        seen: { ...state.seen, [source]: currentIds.slice(0, 500) },
        notified: {
          ...state.notified,
          [source]: [...new Set([...added.map((item) => item.id), ...state.notified[source]])].slice(0, 500),
        },
        unread: state.unread + added.length,
        unreadBySource: {
          ...state.unreadBySource,
          [source]: state.unreadBySource[source] + added.length,
        },
        totals: { ...state.totals, [source]: snapshot.total },
        activeCounts: { ...state.activeCounts, [source]: activeCount },
        lastCheckedAt: { ...state.lastCheckedAt, [source]: checkedAt },
        recent: dedupePortalMonitorEvents([...events, ...state.recent]),
      },
    }
  }

  const seen = new Set(state.seen[source])
  const added = uniqueItems.filter((item) =>
    !seen.has(item.id) || (shouldNotifyCurrent(item) && !notified.has(item.id)))
  const notificationId = `portal-monitor-${source}-${now.getTime()}`
  const events = added.map<PortalMonitorEvent>((item) => ({
    ...item, source, at: checkedAt, notificationId,
  }))
  const mergedSeen = [...new Set([...currentIds, ...state.seen[source]])].slice(0, 500)

  return {
    added,
    state: {
      ...state,
      seen: { ...state.seen, [source]: mergedSeen },
      notified: {
        ...state.notified,
        [source]: [...new Set([...added.map((item) => item.id), ...state.notified[source]])].slice(0, 500),
      },
      unread: state.unread + added.length,
      unreadBySource: {
        ...state.unreadBySource,
        [source]: state.unreadBySource[source] + added.length,
      },
      totals: { ...state.totals, [source]: snapshot.total },
      activeCounts: { ...state.activeCounts, [source]: activeCount },
      lastCheckedAt: { ...state.lastCheckedAt, [source]: checkedAt },
      recent: dedupePortalMonitorEvents([...events, ...state.recent]),
    },
  }
}
