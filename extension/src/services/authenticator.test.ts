// @vitest-environment node
import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  authenticatorEncryptionKey, authenticatorRemainingSeconds, authenticatorVaultKey,
  generateAuthenticatorCode, loadAuthenticatorEntries, parseAuthenticatorURI,
  parseAuthenticatorText, renderAuthenticatorExport, saveAuthenticatorEntries,
} from './authenticator'

const uri = 'otpauth://totp/Example:alice%40example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Example&algorithm=SHA1&digits=8&period=30'

describe('Authenticator vault', () => {
  let storage: Record<string, unknown>

  beforeEach(() => {
    storage = {}
    vi.stubGlobal('crypto', webcrypto)
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => key in storage ? { [key]: storage[key] } : {}),
          set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(storage, values) }),
        },
      },
    })
  })

  it('parses otpauth TOTP and follows the RFC 6238 test vector', () => {
    const entry = parseAuthenticatorURI(uri)
    expect(entry).toMatchObject({
      issuer: 'Example',
      label: 'alice@example.com',
      secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
      algorithm: 'SHA1',
      digits: 8,
      period: 30,
    })
    expect(generateAuthenticatorCode(entry, 59_000)).toBe('94287082')
    expect(authenticatorRemainingSeconds(entry, 59_000)).toBe(1)
  })

  it('rejects HOTP and malformed imports', () => {
    expect(() => parseAuthenticatorURI('otpauth://hotp/Test?secret=JBSWY3DPEHPK3PXP&counter=1'))
      .toThrow('Chỉ hỗ trợ mã TOTP')
    expect(() => parseAuthenticatorURI('https://example.com/qr')).toThrow('otpauth://totp')
  })

  it('imports one or more TOTP links from a TXT file and removes duplicates', () => {
    const second = 'otpauth://totp/Example:bob?secret=JBSWY3DPEHPK3PXP&issuer=Example'
    const entries = parseAuthenticatorText(`\uFEFF# Authenticator export\n${uri}\n${second}\n${second}\n`)
    expect(entries).toHaveLength(2)
    expect(entries.map((entry) => entry.label)).toEqual(['alice@example.com', 'bob'])
    expect(() => parseAuthenticatorText('no authenticator links')).toThrow('Không tìm thấy')
    expect(() => parseAuthenticatorText('otpauth://hotp/Test?secret=JBSWY3DPEHPK3PXP&counter=1'))
      .toThrow('Chỉ hỗ trợ mã TOTP')
  })

  it('exports a re-importable TXT while preserving order and TOTP settings', () => {
    const first = parseAuthenticatorURI(uri)
    const second = parseAuthenticatorURI('otpauth://totp/Long%20Van%3Aadmin%2Bops?secret=JBSWY3DPEHPK3PXP&issuer=Long%20Van&algorithm=SHA256&digits=6&period=60')
    const exported = renderAuthenticatorExport([second, first])
    const restored = parseAuthenticatorText(exported)

    expect(exported).toContain('# CANH BAO:')
    expect(restored.map(({ id: _id, ...entry }) => entry)).toEqual([
      { issuer: second.issuer, label: second.label, secret: second.secret, algorithm: second.algorithm, digits: second.digits, period: second.period },
      { issuer: first.issuer, label: first.label, secret: first.secret, algorithm: first.algorithm, digits: first.digits, period: first.period },
    ])
  })

  it('encrypts entries with AES-GCM and restores them without plaintext secrets', async () => {
    const entry = parseAuthenticatorURI(uri)
    await saveAuthenticatorEntries([entry])

    expect(storage[authenticatorEncryptionKey]).toEqual(expect.any(String))
    expect(storage[authenticatorVaultKey]).toMatchObject({ version: 1 })
    expect(JSON.stringify(storage[authenticatorVaultKey])).not.toContain(entry.secret)
    expect(JSON.stringify(storage[authenticatorVaultKey])).not.toContain(entry.label)
    await expect(loadAuthenticatorEntries()).resolves.toEqual([entry])
  })

  it('refuses a modified encrypted vault', async () => {
    await saveAuthenticatorEntries([parseAuthenticatorURI(uri)])
    const vault = storage[authenticatorVaultKey] as { ciphertext: string }
    vault.ciphertext = `${vault.ciphertext.slice(0, -2)}AA`
    await expect(loadAuthenticatorEntries()).rejects.toThrow('Không thể giải mã')
  })
})
