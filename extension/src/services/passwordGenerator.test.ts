import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  defaultPasswordOptions, generatePassword, normalizePasswordOptions, type PasswordOptions,
} from './passwordGenerator'

const defaults: PasswordOptions = {
  length: 16, specialCount: 3, numbers: true, lowercase: true, uppercase: true, special: true,
  excludeEnabled: false, excludeChars: '',
}

afterEach(() => vi.restoreAllMocks())

describe('password generator', () => {
  it('uses crypto randomness, exact length, and every selected character class', () => {
    const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      const values = array as Uint32Array
      values[0] = (values[0] ?? 0) + 7
      return array
    })
    const password = generatePassword(defaults)
    expect(password).toHaveLength(16)
    expect(password).toMatch(/[0-9]/)
    expect(password).toMatch(/[a-z]/)
    expect(password).toMatch(/[A-Z]/)
    expect((password.match(/[^A-Za-z0-9]/g) ?? [])).toHaveLength(3)
    expect(random).toHaveBeenCalled()
  })

  it('excludes requested characters from the generated password', () => {
    const password = generatePassword({
      ...defaults, length: 24, excludeEnabled: true, excludeChars: '0O1Il',
    })
    expect(password).toHaveLength(24)
    expect(password).not.toMatch(/[0O1Il]/)
    expect((password.match(/[^A-Za-z0-9]/g) ?? [])).toHaveLength(3)
  })

  it('uses the configured number of special characters and validates it', () => {
    const password = generatePassword({ ...defaults, length: 24, specialCount: 7 })
    expect(password).toHaveLength(24)
    expect((password.match(/[^A-Za-z0-9]/g) ?? [])).toHaveLength(7)
    expect(() => generatePassword({ ...defaults, length: 3 })).toThrow('4 đến 128')
    expect(() => generatePassword({ ...defaults, specialCount: 0 })).toThrow('1 đến 128')
    expect(() => generatePassword({ ...defaults, specialCount: 129 })).toThrow('1 đến 128')
    expect(() => generatePassword({ ...defaults, length: 6, specialCount: 4 })).toThrow('ít nhất 7')
    expect(() => generatePassword({
      ...defaults, numbers: false, lowercase: false, uppercase: false, length: 6, specialCount: 3,
    })).toThrow('Cần chọn thêm nhóm ký tự khác')
    expect(generatePassword({ ...defaults, special: false, specialCount: 0 })).toHaveLength(16)
  })

  it('requires at least one character class', () => {
    expect(() => generatePassword({ ...defaults, numbers: false, lowercase: false, uppercase: false, special: false })).toThrow('ít nhất một')
  })

  it('normalizes persisted options without trusting malformed storage values', () => {
    expect(normalizePasswordOptions({
      length: 24, specialCount: 5, numbers: false, lowercase: true, uppercase: false, special: true,
      excludeEnabled: true, excludeChars: '0O',
    })).toEqual({
      length: 24, specialCount: 5, numbers: false, lowercase: true, uppercase: false, special: true,
      excludeEnabled: true, excludeChars: '0O',
    })
    expect(normalizePasswordOptions({ length: 999, specialCount: 0, numbers: 'yes', excludeChars: 123 }))
      .toEqual(defaultPasswordOptions)
    expect(normalizePasswordOptions({ length: 20, specialCount: 200 }))
      .toMatchObject({ length: 20, specialCount: 3 })
  })
})
