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

export function generatePassword(options: PasswordOptions): string {
  if (!Number.isSafeInteger(options.length) || options.length < 4 || options.length > 128) {
    throw new Error('Độ dài mật khẩu phải từ 4 đến 128 ký tự.')
  }
  const selected = pools(options)
  if (options.length < selected.length) throw new Error(`Độ dài phải ít nhất ${selected.length} để chứa đủ các nhóm ký tự.`)
  const result = selected.map((item) => pick(item.value))
  const all = unique(selected.map((item) => item.value).join(''))
  while (result.length < options.length) result.push(pick(all))
  return shuffle(result).join('')
}
