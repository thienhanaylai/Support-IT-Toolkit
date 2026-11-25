export type PasswordOptions = {
  length: number
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

function pools(options: PasswordOptions): { name: string; value: string }[] {
  const excluded = new Set(options.excludeEnabled ? [...options.excludeChars] : [])
  const clean = (value: string) => unique([...value].filter((character) => !excluded.has(character)).join(''))
  const selected = [
    options.numbers && { name: 'chữ số', value: clean(characterSets.numbers) },
    options.lowercase && { name: 'chữ thường', value: clean(characterSets.lowercase) },
    options.uppercase && { name: 'chữ hoa', value: clean(characterSets.uppercase) },
    options.special && { name: 'ký tự đặc biệt', value: clean(characterSets.special) },
  ].filter(Boolean) as { name: string; value: string }[]
  if (!selected.length) throw new Error('Hãy chọn ít nhất một nhóm ký tự.')
  const empty = selected.find((item) => !item.value)
  if (empty) throw new Error(`Không còn ${empty.name} sau khi áp dụng danh sách loại trừ.`)
  return selected
}

function validatedPools(options: PasswordOptions): { name: string; value: string }[] {
  if (!Number.isSafeInteger(options.length) || options.length < 4 || options.length > 128) {
    throw new Error('Độ dài mật khẩu phải từ 4 đến 128 ký tự.')
  }
  const selected = pools(options)
  if (options.length < selected.length) throw new Error(`Độ dài phải ít nhất ${selected.length} để chứa đủ các nhóm ký tự.`)
  return selected
}

export function validatePasswordOptions(options: PasswordOptions): void {
  void validatedPools(options)
}

export function generatePassword(options: PasswordOptions): string {
  const selected = validatedPools(options)
  const result = selected.map((item) => pick(item.value))
  const all = unique(selected.map((item) => item.value).join(''))
  while (result.length < options.length) result.push(pick(all))
  return shuffle(result).join('')
}
