export type MessageTemplate = {
  id: string
  name: string
  content: string
}

export const messageTemplatesStorageKey = 'messageTemplates'

export function createMessageTemplate(): MessageTemplate {
  return { id: crypto.randomUUID(), name: '', content: '' }
}

function validTemplate(value: unknown): value is MessageTemplate {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<MessageTemplate>
  return typeof item.id === 'string' && Boolean(item.id) &&
    typeof item.name === 'string' && Boolean(item.name.trim()) &&
    typeof item.content === 'string' && Boolean(item.content.trim())
}

export async function loadMessageTemplates(): Promise<MessageTemplate[]> {
  const saved = await chrome.storage.local.get(messageTemplatesStorageKey)
  const templates = saved[messageTemplatesStorageKey]
  return Array.isArray(templates) ? templates.filter(validTemplate) : []
}

export async function saveMessageTemplates(templates: MessageTemplate[]): Promise<MessageTemplate[]> {
  const clean = templates.map((item) => ({
    id: item.id || crypto.randomUUID(),
    name: item.name.trim(),
    content: item.content.trim(),
  }))
  if (clean.some((item) => !item.name)) throw new Error('Tên template không được để trống.')
  if (clean.some((item) => !item.content)) throw new Error('Nội dung template không được để trống.')
  await chrome.storage.local.set({ [messageTemplatesStorageKey]: clean })
  return clean
}

export async function saveMessageTemplate(
  name: unknown,
  content: unknown,
  templateId?: unknown,
): Promise<{ template: MessageTemplate; templates: MessageTemplate[] }> {
  const cleanName = typeof name === 'string' ? name.trim() : ''
  const cleanContent = typeof content === 'string' ? content.trim() : ''
  if (!cleanName) throw new Error('Tên template không được để trống.')
  if (!cleanContent) throw new Error('Nội dung template không được để trống.')
  const templates = await loadMessageTemplates()
  const id = typeof templateId === 'string' && templates.some((item) => item.id === templateId)
    ? templateId : crypto.randomUUID()
  const template = { id, name: cleanName, content: cleanContent }
  const next = templates.some((item) => item.id === id)
    ? templates.map((item) => item.id === id ? template : item)
    : [...templates, template]
  const saved = await saveMessageTemplates(next)
  return { template, templates: saved }
}

export async function deleteMessageTemplate(templateId: unknown): Promise<MessageTemplate[]> {
  if (typeof templateId !== 'string' || !templateId) throw new Error('Chưa chọn template để xóa.')
  const templates = await loadMessageTemplates()
  const next = templates.filter((item) => item.id !== templateId)
  await chrome.storage.local.set({ [messageTemplatesStorageKey]: next })
  return next
}
