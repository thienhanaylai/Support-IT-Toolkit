import { describe, expect, it } from 'vitest'
import {
  applyPortalMonitorSnapshot, defaultPortalMonitorState, isPortalMonitorUrl,
  normalizePortalMonitorSettings, normalizePortalMonitorState, validPortalMonitorSnapshot,
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
    expect(normalizePortalMonitorSettings({}).ticketNotificationsEnabled).toBe(true)
    expect(normalizePortalMonitorSettings({
      ticketNotificationsEnabled: false,
      computingErrorNotificationsEnabled: false,
    })).toEqual(expect.objectContaining({
      ticketNotificationsEnabled: false,
      computingErrorNotificationsEnabled: false,
    }))
  })

  it('creates a baseline first, then reports only unseen IDs without duplicates', () => {
    const baseline = applyPortalMonitorSnapshot(defaultPortalMonitorState, {
      source: 'ticket',
      total: 1,
      items: [{ id: 'old', title: 'Ticket cũ', url: 'https://portal.longvan.vn/ticket/old' }],
    }, new Date('2026-11-27T10:00:00Z'))
    expect(baseline.added).toEqual([])
    expect(baseline.state.unread).toBe(0)

    const next = applyPortalMonitorSnapshot(baseline.state, {
      source: 'ticket',
      total: 2,
      items: [
        { id: 'new', title: 'Ticket mới', url: 'https://portal.longvan.vn/ticket/new' },
        { id: 'old', title: 'Ticket cũ', url: 'https://portal.longvan.vn/ticket/old' },
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
