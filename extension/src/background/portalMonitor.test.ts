import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

it('reloads selected Portal tabs, baselines once, then notifies and updates the badge for new IDs', async () => {
  const storage: Record<string, unknown> = {
    portalMonitorState: {
      initialized: { ticket: false, computingError: true },
      seen: { ticket: [], computingError: ['20.31593.6764'] },
      notified: { ticket: [], computingError: ['20.31593.6764'] },
      unread: 1,
      unreadBySource: { ticket: 0, computingError: 1 },
      totals: { ticket: 0, computingError: 29155 },
      activeCounts: { ticket: 0, computingError: 29155 },
      lastCheckedAt: { computingError: '2026-11-28T08:44:47Z' },
      recent: [{
        id: '20.31593.6764',
        source: 'computingError',
        title: 'NguyenDinhDat VM',
        url: 'https://portal.longvan.vn/computing-manager/manager/computing/computing_detail.xhtml?id=20.31593.6764',
        status: 'Đã triển khai',
        at: '2026-11-28T08:44:47Z',
        notificationId: 'portal-monitor-computingError-wrong',
      }],
    },
  }
  const listeners: Array<(
    message: { type?: string; snapshot?: unknown; settings?: unknown; source?: unknown; enabled?: unknown },
    sender: chrome.runtime.MessageSender,
    respond: (value: unknown) => void,
  ) => boolean | undefined> = []
  const alarmCreate = vi.fn()
  const alarmClear = vi.fn(async () => true)
  const reload = vi.fn(async () => {})
  const createNotification = vi.fn(async (id: string) => id)
  const setBadgeText = vi.fn(async () => {})
  const setBadgeBackgroundColor = vi.fn(async () => {})

  vi.stubGlobal('chrome', {
    storage: { local: {
      get: vi.fn(async (keys: string | string[]) => {
        const requested = Array.isArray(keys) ? keys : [keys]
        return Object.fromEntries(requested.filter((key) => key in storage).map((key) => [key, storage[key]]))
      }),
      set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(storage, values) }),
    } },
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      onMessage: { addListener: (listener: typeof listeners[number]) => listeners.push(listener) },
      onStartup: { addListener: vi.fn() },
    },
    alarms: {
      create: alarmCreate,
      clear: alarmClear,
      onAlarm: { addListener: vi.fn() },
    },
    tabs: {
      query: vi.fn(async () => [{
        id: 7,
        url: 'https://portal.longvan.vn/crm/pages/ticket/index.xhtml?orgId=LONGVAN&wsId=20.1087',
      }]),
      reload,
      create: vi.fn(async () => ({})),
    },
    notifications: {
      create: createNotification,
      clear: vi.fn(async () => true),
      getAll: vi.fn(async () => ({
        'portal-monitor-computingError-wrong': true,
        'portal-monitor-ticket-old': true,
        'unrelated-notification': true,
      })),
      onClicked: { addListener: vi.fn() },
    },
    action: { setBadgeText, setBadgeBackgroundColor },
  })

  const { portalMonitorNotificationTitle, registerPortalMonitor } = await import('./portalMonitor')
  expect(portalMonitorNotificationTitle('ticket', 2)).toBe('2 Ticket mới')
  expect(portalMonitorNotificationTitle('computingError', 51)).toBe('51 Computing triển khai lỗi')
  registerPortalMonitor()

  async function send(message: {
    type: string
    snapshot?: unknown
    settings?: unknown
    source?: unknown
    id?: unknown
    open?: unknown
    enabled?: unknown
  }) {
    const listener = listeners[0]
    return new Promise<Record<string, unknown>>((resolve) => {
      expect(listener(message, {
        tab: {
          id: 7,
          url: 'https://portal.longvan.vn/crm/pages/ticket/index.xhtml?orgId=LONGVAN&wsId=20.1087',
        } as chrome.tabs.Tab,
      }, (value) => resolve(value as Record<string, unknown>))).toBe(true)
    })
  }

  const migrated = await send({ type: 'toolkit:get-monitor' })
  const migratedState = migrated.state as {
    activeCounts: { computingError: number }
    totals: { computingError: number }
    recent: unknown[]
  }
  expect(migratedState.activeCounts.computingError).toBe(0)
  expect(migratedState.totals.computingError).toBe(0)
  expect(migratedState.recent).toEqual([])
  expect(chrome.notifications.clear).toHaveBeenCalledWith('portal-monitor-computingError-wrong')

  await send({
    type: 'toolkit:save-monitor',
    settings: { enabled: true, ticketEnabled: true, computingErrorEnabled: false, intervalSeconds: 180 },
  })
  expect(alarmCreate).toHaveBeenCalledWith('portal-monitor-refresh', {
    delayInMinutes: 3, periodInMinutes: 3,
  })
  expect(reload).toHaveBeenCalledWith(7)

  await send({
    type: 'toolkit:monitor-snapshot',
    snapshot: {
      source: 'ticket', total: 1,
      items: [{
        id: 'old',
        title: 'Ticket cũ',
        url: 'https://portal.longvan.vn/crm/pages/ticket/detail.xhtml?id=old',
        status: 'DOING',
      }],
    },
  })
  expect(createNotification).not.toHaveBeenCalled()

  const newSnapshot = {
    type: 'toolkit:monitor-snapshot',
    snapshot: {
      source: 'ticket', total: 2,
      items: [
        {
          id: 'new',
          title: 'Ticket mới',
          url: 'https://portal.longvan.vn/crm/pages/ticket/detail.xhtml?id=new',
          status: 'NEW',
        },
        {
          id: 'old',
          title: 'Ticket cũ',
          url: 'https://portal.longvan.vn/crm/pages/ticket/detail.xhtml?id=old',
          status: 'DOING',
        },
      ],
    },
  }
  await Promise.all([send(newSnapshot), send(newSnapshot)])
  expect(createNotification).toHaveBeenCalledWith(
    expect.stringMatching(/^portal-monitor-ticket-/),
    expect.objectContaining({ title: '1 Ticket mới', message: 'Ticket mới' }),
  )
  expect(createNotification).toHaveBeenCalledTimes(1)
  expect(setBadgeText).toHaveBeenLastCalledWith({ text: '1' })
  expect((storage.history as Array<{ tool: string; target: string; result: { portalId: string } }>)[0])
    .toEqual(expect.objectContaining({
      tool: 'Theo dõi Ticket',
      target: 'Ticket mới',
      result: expect.objectContaining({ portalId: 'new' }),
    }))

  const disabled = await send({
    type: 'toolkit:monitor-set-source-notification',
    source: 'ticket',
    enabled: false,
  })
  expect(disabled).toEqual(expect.objectContaining({
    settings: expect.objectContaining({ ticketNotificationsEnabled: false }),
    notified: false,
  }))
  createNotification.mockClear()

  await send({
    type: 'toolkit:monitor-snapshot',
    snapshot: {
      source: 'ticket',
      total: 3,
      items: [
        {
          id: 'new-2',
          title: 'Ticket mới thứ hai',
          url: 'https://portal.longvan.vn/crm/pages/ticket/detail.xhtml?id=new-2',
          status: 'NEW',
        },
        ...newSnapshot.snapshot.items,
      ],
    },
  })
  expect(createNotification).not.toHaveBeenCalled()

  const enabled = await send({
    type: 'toolkit:monitor-set-source-notification',
    source: 'ticket',
    enabled: true,
  })
  expect(enabled).toEqual(expect.objectContaining({
    settings: expect.objectContaining({ ticketNotificationsEnabled: true }),
    notified: true,
  }))
  expect(createNotification).toHaveBeenCalledWith(
    'portal-monitor-current-ticket',
    expect.objectContaining({ title: '2 Ticket mới' }),
  )

  const dismissed = await send({
    type: 'toolkit:monitor-dismiss-item',
    source: 'ticket',
    id: 'new',
    open: true,
  })
  expect((dismissed.state as { recent: Array<{ id: string }> }).recent.map((item) => item.id)).toEqual(['new-2'])
  expect(chrome.tabs.create).toHaveBeenCalledWith({
    url: 'https://portal.longvan.vn/crm/pages/ticket/detail.xhtml?id=new',
  })
  expect(setBadgeText).toHaveBeenLastCalledWith({ text: '1' })

  await send({ type: 'toolkit:monitor-mark-read' })
  expect(setBadgeText).toHaveBeenLastCalledWith({ text: '' })

  const cleared = await send({ type: 'toolkit:monitor-clear-all' })
  expect((cleared.state as { recent: unknown[] }).recent).toEqual([])
  expect(chrome.notifications.clear).toHaveBeenCalledWith('portal-monitor-ticket-old')
  expect(chrome.notifications.clear).not.toHaveBeenCalledWith('unrelated-notification')

  await send({
    type: 'toolkit:save-monitor',
    settings: { enabled: true, ticketEnabled: true, computingErrorEnabled: false, intervalSeconds: 10 },
  })
  expect(alarmCreate).toHaveBeenCalledTimes(1)
})
