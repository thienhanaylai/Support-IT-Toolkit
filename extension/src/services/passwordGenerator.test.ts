import { afterEach, describe, expect, it, vi } from 'vitest'
import { generatePassword, type PasswordOptions } from './passwordGenerator'

const defaults: PasswordOptions = {
  length: 16, numbers: true, lowercase: true, uppercase: true, special: true,
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
    expect(password).toMatch(/[^A-Za-z0-9]/)
    expect(random).toHaveBeenCalled()
  })

  it('excludes requested characters from the generated password', () => {
    const password = generatePassword({
      ...defaults, length: 24, excludeEnabled: true, excludeChars: '0O1Il',
    })
    expect(password).toHaveLength(24)
    expect(password).not.toMatch(/[0O1Il]/)
  })

  it('validates length and requires at least one character class', () => {
    expect(() => generatePassword({ ...defaults, length: 3 })).toThrow('4 đến 128')
    expect(() => generatePassword({ ...defaults, numbers: false, lowercase: false, uppercase: false, special: false })).toThrow('ít nhất một')
  })
})
