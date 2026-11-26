export type TagElementMember = {
  id: string
  name: string
  elementId: string
}

export type TagElementGroup = {
  id: string
  name: string
  members: TagElementMember[]
}

export const tagElementsStorageKey = 'tagElements'

export const defaultTagElementGroups: TagElementGroup[] = [
  { id: 'proxmox', name: 'Proxmox', members: [] },
  { id: 'restore-vmware', name: 'Restore VMware', members: [] },
  { id: 'network', name: 'Network', members: [] },
  { id: 'vmware', name: 'Vmware', members: [] },
  { id: 'hosting', name: 'Hosting', members: [] },
]

function newId(): string {
  return crypto.randomUUID()
}

function cleanElementId(value: string): string {
  const clean = value.trim()
  return clean && !clean.startsWith('@') ? `@${clean}` : clean
}

export function formatTagElement(member: Pick<TagElementMember, 'name' | 'elementId'>): string {
  return `(${member.name.trim()})[${cleanElementId(member.elementId)}]`
}

export function parseTagElementText(value: string): TagElementGroup[] {
  const groups: TagElementGroup[] = []
  let current: TagElementGroup | null = null

  for (const [index, rawLine] of value.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    const line = rawLine.trim()
    if (!line) continue
    const member = line.match(/^\(([^()[\]]+)\)\s*\[\s*(@[^\][\r\n]+)\s*\]$/)
    if (member) {
      if (!current) throw new Error(`Dòng ${index + 1}: cần có tên lĩnh vực ở phía trên thành viên.`)
      const name = member[1].trim()
      const elementId = cleanElementId(member[2])
      if (!name || !/^@[^\s:[\]]+:[^\s[\]]+$/.test(elementId)) {
        throw new Error(`Dòng ${index + 1}: Element ID phải có dạng @id:example.com.`)
      }
      current.members.push({ id: newId(), name, elementId })
      continue
    }
    if (/[\[\]()]/.test(line)) {
      throw new Error(`Dòng ${index + 1}: thành viên phải có dạng (Tên)[@id:example.com].`)
    }
    current = { id: newId(), name: line, members: [] }
    groups.push(current)
  }

  if (!groups.length) throw new Error('Chưa tìm thấy lĩnh vực nào để import.')
  return groups
}

export function serializeTagElementGroups(groups: TagElementGroup[]): string {
  return groups.map((group) => [
    group.name,
    ...group.members.map(formatTagElement),
  ].join('\n')).join('\n\n')
}

function validMember(value: unknown): value is TagElementMember {
  if (!value || typeof value !== 'object') return false
  const member = value as Partial<TagElementMember>
  return typeof member.id === 'string' && Boolean(member.id) &&
    typeof member.name === 'string' && Boolean(member.name.trim()) &&
    typeof member.elementId === 'string' && /^@[^\s:[\]]+:[^\s[\]]+$/.test(member.elementId.trim())
}

function validGroup(value: unknown): value is TagElementGroup {
  if (!value || typeof value !== 'object') return false
  const group = value as Partial<TagElementGroup>
  return typeof group.id === 'string' && Boolean(group.id) &&
    typeof group.name === 'string' && Boolean(group.name.trim()) &&
    Array.isArray(group.members) && group.members.every(validMember)
}

export async function loadTagElementGroups(): Promise<TagElementGroup[]> {
  const saved = await chrome.storage.local.get(tagElementsStorageKey)
  if (!(tagElementsStorageKey in saved)) return structuredClone(defaultTagElementGroups)
  const groups = saved[tagElementsStorageKey]
  return Array.isArray(groups) && groups.every(validGroup) ? groups : structuredClone(defaultTagElementGroups)
}

export async function saveTagElementGroups(groups: TagElementGroup[]): Promise<void> {
  await chrome.storage.local.set({ [tagElementsStorageKey]: groups })
}

export function createTagElementGroup(name = 'Lĩnh vực mới'): TagElementGroup {
  return { id: newId(), name, members: [] }
}

export function createTagElementMember(name = 'Thành viên mới', elementId = '@id:example.com'): TagElementMember {
  return { id: newId(), name, elementId }
}
