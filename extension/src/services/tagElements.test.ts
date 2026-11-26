import { afterEach, expect, it, vi } from 'vitest'
import {
  defaultTagElementGroups, formatTagElement, loadTagElementGroups, parseTagElementText,
  saveTagElementGroups, serializeTagElementGroups, tagElementsStorageKey,
} from './tagElements'

afterEach(() => vi.unstubAllGlobals())

it('parses headings followed by Element mention lines', () => {
  const groups = parseTagElementText(`
Proxmox
(Lê Ngọc Vương)[@10.19530321:team.longvan.vn]
(Nguyễn Văn A) [ @nguyenvana:example.com ]

Restore VMware
(Trần Văn B)[@tranvanb:example.com]
`)
  expect(groups.map((group) => group.name)).toEqual(['Proxmox', 'Restore VMware'])
  expect(groups[0].members.map(({ name, elementId }) => ({ name, elementId }))).toEqual([
    { name: 'Lê Ngọc Vương', elementId: '@10.19530321:team.longvan.vn' },
    { name: 'Nguyễn Văn A', elementId: '@nguyenvana:example.com' },
  ])
  expect(serializeTagElementGroups(groups)).toContain('(Lê Ngọc Vương)[@10.19530321:team.longvan.vn]')
})

it('rejects malformed member lines and allows an empty heading for later editing', () => {
  expect(() => parseTagElementText('(Name)[@id:example.com]')).toThrow('cần có tên lĩnh vực')
  expect(() => parseTagElementText('Vmware\n(name) @id:example.com')).toThrow('phải có dạng')
  expect(parseTagElementText('Vmware')).toEqual([
    expect.objectContaining({ name: 'Vmware', members: [] }),
  ])
})

it('formats a member using the recognized Element syntax', () => {
  expect(formatTagElement({ name: 'Name', elementId: 'id:example.com' })).toBe('(Name)[@id:example.com]')
})

it('loads defaults when nothing is saved and persists customized groups', async () => {
  const get = vi.fn(async () => ({}))
  const set = vi.fn(async () => {})
  vi.stubGlobal('chrome', { storage: { local: { get, set } } })
  expect(await loadTagElementGroups()).toEqual(defaultTagElementGroups)
  const groups = parseTagElementText('Vmware\n(Name)[@id:example.com]')
  await saveTagElementGroups(groups)
  expect(set).toHaveBeenCalledWith({ [tagElementsStorageKey]: groups })
})
