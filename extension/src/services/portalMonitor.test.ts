import { describe, expect, it } from 'vitest'
import {
  applyPortalMonitorSnapshot, defaultPortalMonitorState, isPortalMonitorUrl,
  normalizePortalMonitorSettings, normalizePortalMonitorState, portalMonitorCountdownSeconds,
  portalMonitorSourceCountdownSeconds,
  validPortalMonitorSnapshot,
} from './portalMonitor'

describe('Portal monitor', () => {
  it('recognizes only the real Ticket and status=2 Computing pages', () => {
    expect(isPortalMonitorUrl(
      'https://portal.longvan.vn/crm/pages/ticket/index.xhtml?orgId=LONGVAN&wsId=20.1087',
      'ticket',
    )).toBe(true)
    expect(isPortalMonitorUrl(
      'https://portal.longvan.vn/computing-manager/manager/computing/computing.xhtml?status=2',
      'computingError',
    )).toBe(true)
    expect(isPortalMonitorUrl(
      'https://portal.longvan.vn/computing-manager/manager/computing/computing.xhtml?status=1',
      'computingError',
    )).toBe(false)
  })

  it('accepts only Computing rows whose status is exactly deployment error', () => {
    const base = {
      source: 'computingError' as const,
      total: 1,
      items: [{
        id: '20.1',
        title: 'VM',
        url: 'https://portal.longvan.vn/computing-manager/manager/computing/computing_detail.xhtml?id=20.1',
        status: 'Triển khai lỗi',
      }],
    }
    expect(validPortalMonitorSnapshot(base)).toBe(true)
    expect(validPortalMonitorSnapshot({
      ...base,
      items: [{ ...base.items[0], status: 'Đã triển khai' }],
    })).toBe(false)
  })

  it('uses arbitrary seconds, raises values below 10 and migrates old minutes', () => {
    expect(normalizePortalMonitorSettings({ enabled: true, intervalSeconds: 5 }).intervalSeconds).toBe(10)
    expect(normalizePortalMonitorSettings({ enabled: true, intervalSeconds: 17 }).intervalSeconds).toBe(17)
    expect(normalizePortalMonitorSettings({ enabled: true, intervalSeconds: 7200 }).intervalSeconds).toBe(7200)
    expect(normalizePortalMonitorSettings({ enabled: true, intervalMinutes: 5 }).intervalSeconds).toBe(300)
    expect(normalizePortalMonitorSettings({})).toEqual(expect.objectContaining({
      enabled: false,
      ticketEnabled: false,
      computingErrorEnabled: false,
    }))
    expect(normalizePortalMonitorSettings({}).ticketNotificationsEnabled).toBe(true)
    expect(normalizePortalMonitorSettings({
      ticketNotificationsEnabled: false,
      computingErrorNotificationsEnabled: false,
    })).toEqual(expect.objectContaining({
      ticketNotificationsEnabled: false,
      computingErrorNotificationsEnabled: false,
    }))
  })

  it('counts down from the latest check and rolls into the next reload cycle', () => {
    const settings = normalizePortalMonitorSettings({
      enabled: true,
      ticketEnabled: true,
      computingErrorEnabled: false,
      ticketTabId: 7,
      intervalSeconds: 30,
    })
    const state = normalizePortalMonitorState({
      lastCheckedAt: { ticket: '2026-11-28T09:00:00.000Z' },
    })
    expect(portalMonitorCountdownSeconds(
      settings,
      state,
      new Date('2026-11-28T09:00:07.000Z').getTime(),
    )).toBe(23)
    expect(portalMonitorCountdownSeconds(
      settings,
      state,
      new Date('2026-11-28T09:00:31.000Z').getTime(),
    )).toBe(29)
    expect(portalMonitorCountdownSeconds(
      { ...settings, enabled: false },
      state,
      new Date('2026-11-28T09:00:07.000Z').getTime(),
    )).toBeNull()
  })

  it('counts down Ticket and Computing independently', () => {
    const settings = normalizePortalMonitorSettings({
      enabled: true,
      ticketEnabled: true,
      computingErrorEnabled: true,
      ticketTabId: 7,
      computingErrorTabId: 8,
      intervalSeconds: 100,
    })
    const state = normalizePortalMonitorState({
      lastCheckedAt: {
        ticket: '2026-11-28T09:00:00.000Z',
        computingError: '2026-11-28T09:00:30.000Z',
      },
    })
    const now = new Date('2026-11-28T09:00:40.000Z').getTime()
    expect(portalMonitorSourceCountdownSeconds(settings, state, 'ticket', now)).toBe(60)
    expect(portalMonitorSourceCountdownSeconds(settings, state, 'computingError', now)).toBe(90)
  })

  it('creates a baseline first, then reports only unseen IDs without duplicates', () => {
    const baseline = applyPortalMonitorSnapshot(defaultPortalMonitorState, {
      source: 'ticket',
      total: 1,
      items: [{
        id: 'old', title: 'Ticket cũ', url: 'https://portal.longvan.vn/ticket/old', status: 'DOING',
      }],
    }, new Date('2026-11-27T10:00:00Z'))
    expect(baseline.added).toEqual([])
    expect(baseline.state.unread).toBe(0)

    const next = applyPortalMonitorSnapshot(baseline.state, {
      source: 'ticket',
      total: 2,
      items: [
        { id: 'new', title: 'Ticket mới', url: 'https://portal.longvan.vn/ticket/new', status: 'NEW' },
        { id: 'old', title: 'Ticket cũ', url: 'https://portal.longvan.vn/ticket/old', status: 'DOING' },
      ],
    }, new Date('2026-11-27T10:05:00Z'))
    expect(next.added.map((item) => item.id)).toEqual(['new'])
    expect(next.state.unread).toBe(1)
    expect(next.state.unreadBySource.ticket).toBe(1)

    const duplicate = applyPortalMonitorSnapshot(next.state, {
      source: 'ticket',
      total: 2,
      items: next.added,
    }, new Date('2026-11-27T10:10:00Z'))
    expect(duplicate.added).toEqual([])
    expect(duplicate.state.unread).toBe(1)
  })

  it('reports tickets already marked NEW on the first snapshot without reporting other old rows', () => {
    const baseline = applyPortalMonitorSnapshot(defaultPortalMonitorState, {
      source: 'ticket',
      total: 2,
      items: [
        {
          id: 'new-ticket',
          title: 'Ticket vừa tạo',
          url: 'https://portal.longvan.vn/crm/pages/ticket/detail.xhtml?id=new-ticket',
          status: 'NEW',
        },
        {
          id: 'doing-ticket',
          title: 'Ticket đang xử lý',
          url: 'https://portal.longvan.vn/crm/pages/ticket/detail.xhtml?id=doing-ticket',
          status: 'DOING',
        },
      ],
    }, new Date('2026-11-27T20:40:00Z'))

    expect(baseline.added.map((item) => item.id)).toEqual(['new-ticket'])
    expect(baseline.state.unread).toBe(1)
    expect(baseline.state.recent[0]?.title).toBe('Ticket vừa tạo')
    expect(baseline.state.seen.ticket).toEqual(['new-ticket', 'doing-ticket'])
    expect(baseline.state.notified.ticket).toEqual(['new-ticket'])
    expect(baseline.state.activeCounts.ticket).toBe(1)
  })

  it('notifies a current NEW ticket once when upgrading state that already marked its ID as seen', () => {
    const oldState = {
      ...defaultPortalMonitorState,
      initialized: { ticket: true, computingError: false },
      seen: { ticket: ['current-new'], computingError: [] },
    }
    const first = applyPortalMonitorSnapshot(oldState, {
      source: 'ticket',
      total: 14619,
      items: [{
        id: 'current-new',
        title: 'Triển Khai cụm 2 DC',
        url: 'https://portal.longvan.vn/crm/pages/ticket/detail.xhtml?id=current-new',
        status: 'NEW',
      }],
    }, new Date('2026-11-27T20:45:00Z'))

    expect(first.added.map((item) => item.id)).toEqual(['current-new'])
    expect(first.state.activeCounts.ticket).toBe(1)
    expect(first.state.totals.ticket).toBe(14619)

    const second = applyPortalMonitorSnapshot(first.state, {
      source: 'ticket',
      total: 14619,
      items: [{
        id: 'current-new',
        title: 'Triển Khai cụm 2 DC',
        url: 'https://portal.longvan.vn/crm/pages/ticket/detail.xhtml?id=current-new',
        status: 'NEW',
      }],
    }, new Date('2026-11-27T20:46:00Z'))

    expect(second.added).toEqual([])
    expect(second.state.unread).toBe(1)
  })

  it('notifies current Computing deployment errors once even when their IDs are already seen', () => {
    const oldState = {
      ...defaultPortalMonitorState,
      initialized: { ticket: false, computingError: true },
      seen: { ticket: [], computingError: ['error-1', 'error-2'] },
    }
    const snapshot = {
      source: 'computingError' as const,
      total: 2,
      items: [
        {
          id: 'error-1',
          title: 'Computing lỗi 1',
          url: 'https://portal.longvan.vn/computing-manager/manager/computing/computing_detail.xhtml?id=error-1',
          status: 'Triển khai lỗi',
        },
        {
          id: 'error-2',
          title: 'Computing lỗi 2',
          url: 'https://portal.longvan.vn/computing-manager/manager/computing/computing_detail.xhtml?id=error-2',
          status: 'Triển khai lỗi',
        },
      ],
    }

    const first = applyPortalMonitorSnapshot(oldState, snapshot, new Date('2026-11-28T08:55:00Z'))
    expect(first.added.map((item) => item.id)).toEqual(['error-1', 'error-2'])
    expect(first.state.unreadBySource.computingError).toBe(2)
    expect(first.state.recent).toHaveLength(2)

    const second = applyPortalMonitorSnapshot(first.state, snapshot, new Date('2026-11-28T08:56:00Z'))
    expect(second.added).toEqual([])
    expect(second.state.unreadBySource.computingError).toBe(2)
  })

  it('never counts an assigned DOING ticket as a new ticket even when its ID was unseen', () => {
    const previous = {
      ...defaultPortalMonitorState,
      initialized: { ticket: true, computingError: false },
      seen: { ticket: ['old-ticket'], computingError: [] },
    }
    const result = applyPortalMonitorSnapshot(previous, {
      source: 'ticket',
      total: 14626,
      items: [{
        id: 'doing-assigned',
        title: 'server 103.2.226.3 nghẽn disk',
        url: 'https://portal.longvan.vn/crm/pages/ticket/detail.xhtml?id=doing-assigned',
        status: 'DOING',
        assignee: 'Nguyễn Đức Huy',
      }],
    }, new Date('2026-11-28T16:19:23Z'))

    expect(result.added).toEqual([])
    expect(result.state.activeCounts.ticket).toBe(0)
    expect(result.state.recent).toEqual([])
  })

  it('counts a NEW ticket whose responsibility cell only contains the update action', () => {
    const result = applyPortalMonitorSnapshot(defaultPortalMonitorState, {
      source: 'ticket',
      total: 14627,
      items: [{
        id: 'new-unassigned',
        title: 'Đổi Hệ Điều Hành',
        url: 'https://portal.longvan.vn/crm/pages/ticket/detail.xhtml?id=new-unassigned',
        status: 'NEW',
        assignee: 'cập nhật',
      }],
    }, new Date('2026-11-28T17:22:04Z'))

    expect(result.added).toHaveLength(1)
    expect(result.state.activeCounts.ticket).toBe(1)
    expect(result.state.recent[0]).toEqual(expect.objectContaining({
      id: 'new-unassigned',
      status: 'NEW',
    }))
  })

  it('removes a previous NEW notification after the ticket becomes assigned and DOING', () => {
    const previouslyNew = applyPortalMonitorSnapshot(defaultPortalMonitorState, {
      source: 'ticket',
      total: 1,
      items: [{
        id: 'ticket-1',
        title: 'Ticket cần nhận',
        url: 'https://portal.longvan.vn/crm/pages/ticket/detail.xhtml?id=ticket-1',
        status: 'NEW',
      }],
    }, new Date('2026-11-28T16:00:00Z'))
    const doing = applyPortalMonitorSnapshot(previouslyNew.state, {
      source: 'ticket',
      total: 1,
      items: [{
        id: 'ticket-1',
        title: 'Ticket đã nhận',
        url: 'https://portal.longvan.vn/crm/pages/ticket/detail.xhtml?id=ticket-1',
        status: 'DOING',
        assignee: 'Nguyễn Đức Huy',
      }],
    }, new Date('2026-11-28T16:01:00Z'))

    expect(doing.added).toEqual([])
    expect(doing.state.activeCounts.ticket).toBe(0)
    expect(doing.state.recent).toEqual([])
    expect(doing.state.unreadBySource.ticket).toBe(0)
  })

  it('removes duplicate recent notifications by source and item ID', () => {
    const normalized = normalizePortalMonitorState({
      ...defaultPortalMonitorState,
      recent: [
        {
          id: 'same-ticket', source: 'ticket', title: 'Bản mới nhất',
          url: 'https://portal.longvan.vn/crm/pages/ticket/detail.xhtml?id=same-ticket',
          at: '2026-11-27T21:00:00Z', notificationId: 'newer',
        },
        {
          id: 'same-ticket', source: 'ticket', title: 'Bản bị trùng',
          url: 'https://portal.longvan.vn/crm/pages/ticket/detail.xhtml?id=same-ticket',
          at: '2026-11-27T20:59:00Z', notificationId: 'older',
        },
      ],
    })

    expect(normalized.recent).toHaveLength(1)
    expect(normalized.recent[0]?.notificationId).toBe('newer')
  })
})
