import { afterEach, expect, it, vi } from 'vitest'
import {
  deleteMessageTemplate, loadMessageTemplates, messageTemplatesStorageKey, saveMessageTemplate, saveMessageTemplates,
} from './messageTemplates'

afterEach(() => vi.unstubAllGlobals())

it('creates, updates, and deletes reusable message templates', async () => {
  let saved: unknown[] = []
  const set = vi.fn(async (value: Record<string, unknown>) => {
    saved = value[messageTemplatesStorageKey] as unknown[]
  })
  vi.stubGlobal('crypto', { randomUUID: () => 'template-one' })
  vi.stubGlobal('chrome', { storage: { local: {
    get: vi.fn(async () => ({ [messageTemplatesStorageKey]: saved })),
    set,
  } } })

  const created = await saveMessageTemplate('Thông báo', 'Nội dung mẫu')
  expect(created.template).toEqual({ id: 'template-one', name: 'Thông báo', content: 'Nội dung mẫu' })
  expect(await loadMessageTemplates()).toEqual([created.template])

  const updated = await saveMessageTemplate('Thông báo mới', 'Nội dung mới', 'template-one')
  expect(updated.templates).toEqual([
    { id: 'template-one', name: 'Thông báo mới', content: 'Nội dung mới' },
  ])
  expect(await deleteMessageTemplate('template-one')).toEqual([])
  expect(set).toHaveBeenLastCalledWith({ [messageTemplatesStorageKey]: [] })
})

it('rejects empty template names or content', async () => {
  vi.stubGlobal('chrome', { storage: { local: { get: vi.fn(async () => ({})), set: vi.fn() } } })
  await expect(saveMessageTemplate('', 'Nội dung')).rejects.toThrow('Tên template')
  await expect(saveMessageTemplate('Tên', '')).rejects.toThrow('Nội dung template')
  await expect(saveMessageTemplates([{ id: 'one', name: '', content: 'Nội dung' }])).rejects.toThrow('Tên template')
})
