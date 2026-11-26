export type PasswordOptions = {
  length: number
  specialCount: number
  numbers: boolean
  lowercase: boolean
  uppercase: boolean
  special: boolean
  excludeEnabled: boolean
  excludeChars: string
}

export const passwordRecentKey = 'passwordGeneratorRecent'
export const passwordOptionsKey = 'passwordGeneratorOptions'

export const defaultPasswordOptions: PasswordOptions = {
  length: 16,
  specialCount: 3,
  numbers: true,
  lowercase: true,
  uppercase: true,
  special: true,
  excludeEnabled: false,
  excludeChars: '',
}

export function normalizePasswordOptions(value: unknown): PasswordOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...defaultPasswordOptions }
  const item = value as Partial<PasswordOptions>
  return {
    length: Number.isSafeInteger(item.length) && item.length! >= 4 && item.length! <= 128
      ? item.length! : defaultPasswordOptions.length,
    specialCount: Number.isSafeInteger(item.specialCount) && item.specialCount! >= 1 && item.specialCount! <= 128
      ? item.specialCount! : defaultPasswordOptions.specialCount,
    numbers: typeof item.numbers === 'boolean' ? item.numbers : defaultPasswordOptions.numbers,
    lowercase: typeof item.lowercase === 'boolean' ? item.lowercase : defaultPasswordOptions.lowercase,
    uppercase: typeof item.uppercase === 'boolean' ? item.uppercase : defaultPasswordOptions.uppercase,
    special: typeof item.special === 'boolean' ? item.special : defaultPasswordOptions.special,
    excludeEnabled: typeof item.excludeEnabled === 'boolean' ? item.excludeEnabled : defaultPasswordOptions.excludeEnabled,
    excludeChars: typeof item.excludeChars === 'string' ? item.excludeChars.slice(0, 256) : '',
  }
}

const characterSets = {
  numbers: '0123456789',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  special: '!@#$%^&*()-_=+[]{};:,.?/|~',
}

function unique(value: string): string {
  return [...new Set([...value])].join('')
}

function randomIndex(max: number): number {
  if (!Number.isSafeInteger(max) || max <= 0) throw new Error('Không có ký tự hợp lệ để tạo mật khẩu.')
  const range = 0x1_0000_0000
  const limit = Math.floor(range / max) * max
  const buffer = new Uint32Array(1)
  do crypto.getRandomValues(buffer); while (buffer[0] >= limit)
  return buffer[0] % max
}

function pick(pool: string): string {
  return pool[randomIndex(pool.length)]
}

function shuffle(items: string[]): string[] {
  for (let index = items.length - 1; index > 0; index--) {
    const other = randomIndex(index + 1)
    ;[items[index], items[other]] = [items[other], items[index]]
  }
  return items
}

type CharacterPool = { key: 'numbers' | 'lowercase' | 'uppercase' | 'special'; name: string; value: string }

function pools(options: PasswordOptions): CharacterPool[] {
  const excluded = new Set(options.excludeEnabled ? [...options.excludeChars] : [])
  const clean = (value: string) => unique([...value].filter((character) => !excluded.has(character)).join(''))
  const selected = [
    options.numbers && { key: 'numbers' as const, name: 'chữ số', value: clean(characterSets.numbers) },
    options.lowercase && { key: 'lowercase' as const, name: 'chữ thường', value: clean(characterSets.lowercase) },
    options.uppercase && { key: 'uppercase' as const, name: 'chữ hoa', value: clean(characterSets.uppercase) },
    options.special && { key: 'special' as const, name: 'ký tự đặc biệt', value: clean(characterSets.special) },
  ].filter((item): item is CharacterPool => Boolean(item))
  if (!selected.length) throw new Error('Hãy chọn ít nhất một nhóm ký tự.')
  const empty = selected.find((item) => !item.value)
  if (empty) throw new Error(`Không còn ${empty.name} sau khi áp dụng danh sách loại trừ.`)
  return selected
}

function validatedPools(options: PasswordOptions): CharacterPool[] {
  if (!Number.isSafeInteger(options.length) || options.length < 4 || options.length > 128) {
    throw new Error('Độ dài mật khẩu phải từ 4 đến 128 ký tự.')
  }
  if (options.special && (!Number.isSafeInteger(options.specialCount) || options.specialCount < 1 || options.specialCount > 128)) {
    throw new Error('Số ký tự đặc biệt phải từ 1 đến 128.')
  }
  const selected = pools(options)
  const special = selected.find((item) => item.key === 'special')
  const otherCount = selected.length - (special ? 1 : 0)
  const required = otherCount + (special ? options.specialCount : 0)
  if (options.length < required) {
    throw new Error(special
      ? `Độ dài phải ít nhất ${required} để chứa ${options.specialCount} ký tự đặc biệt và đủ các nhóm ký tự đã chọn.`
      : `Độ dài phải ít nhất ${required} để chứa đủ các nhóm ký tự đã chọn.`)
  }
  if (special && !otherCount && options.length > options.specialCount) {
    throw new Error('Cần chọn thêm nhóm ký tự khác nếu độ dài lớn hơn số ký tự đặc biệt.')
  }
  return selected
}

export function validatePasswordOptions(options: PasswordOptions): void {
  void validatedPools(options)
}

export function generatePassword(options: PasswordOptions): string {
  const selected = validatedPools(options)
  const special = selected.find((item) => item.key === 'special')
  const others = selected.filter((item) => item.key !== 'special')
  const result = others.map((item) => pick(item.value))
  if (special) {
    for (let index = 0; index < options.specialCount; index++) result.push(pick(special.value))
  }
  // Fill from non-special pools so the special-character count stays exact.
  const fill = unique((others.length ? others : special ? [special] : []).map((item) => item.value).join(''))
  while (result.length < options.length) result.push(pick(fill))
  return shuffle(result).join('')
}
