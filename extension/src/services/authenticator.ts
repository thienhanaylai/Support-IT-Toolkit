import * as OTPAuth from 'otpauth'

export type AuthenticatorEntry = {
  id: string
  issuer: string
  label: string
  secret: string
  algorithm: string
  digits: number
  period: number
}

type EncryptedVault = {
  version: 1
  iv: string
  ciphertext: string
}

export const authenticatorVaultKey = 'authenticatorVault'
export const authenticatorEncryptionKey = 'authenticatorEncryptionKey'

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(16)))
    .replace(/[+/=]/g, '').slice(0, 22)
}

function validEntry(value: unknown): value is AuthenticatorEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const entry = value as Partial<AuthenticatorEntry>
  return typeof entry.id === 'string' && entry.id.length <= 100 &&
    typeof entry.issuer === 'string' && entry.issuer.length <= 200 &&
    typeof entry.label === 'string' && entry.label.length > 0 && entry.label.length <= 300 &&
    typeof entry.secret === 'string' && /^[A-Z2-7]+=*$/.test(entry.secret) && entry.secret.length <= 1024 &&
    typeof entry.algorithm === 'string' && /^(?:SHA1|SHA256|SHA512)$/.test(entry.algorithm) &&
    Number.isInteger(entry.digits) && entry.digits! >= 6 && entry.digits! <= 8 &&
    Number.isInteger(entry.period) && entry.period! >= 15 && entry.period! <= 120
}

export function parseAuthenticatorURI(value: string): AuthenticatorEntry {
  const uri = value.trim()
  if (!uri || uri.length > 4096 || !/^otpauth:\/\/totp\//i.test(uri)) {
    throw new Error('Chỉ hỗ trợ mã TOTP dạng otpauth://totp/.')
  }
  let parsed: OTPAuth.HOTP | OTPAuth.TOTP
  try {
    parsed = OTPAuth.URI.parse(uri)
  } catch {
    throw new Error('Liên kết Authenticator không hợp lệ.')
  }
  if (!(parsed instanceof OTPAuth.TOTP)) throw new Error('Chỉ hỗ trợ mã TOTP theo thời gian.')
  const algorithm = parsed.algorithm.toUpperCase().replace(/-/g, '')
  const entry: AuthenticatorEntry = {
    id: randomId(),
    issuer: parsed.issuer.trim().slice(0, 200),
    label: parsed.label.trim().slice(0, 300),
    secret: parsed.secret.base32.toUpperCase(),
    algorithm,
    digits: parsed.digits,
    period: parsed.period,
  }
  if (!validEntry(entry)) throw new Error('Thông số TOTP không được hỗ trợ.')
  return entry
}

export function parseAuthenticatorText(value: string): AuthenticatorEntry[] {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Không có liên kết Authenticator để thêm.')
  }
  if (value.length > 1024 * 1024) throw new Error('Nội dung Authenticator không được lớn hơn 1 MB.')
  const links = value.replace(/^\uFEFF/, '').match(/otpauth:\/\/[^\s"'<>]+/gi) ?? []
  if (!links.length) throw new Error('Không tìm thấy liên kết otpauth://totp/.')
  const entries = links.map((link) => parseAuthenticatorURI(link))
  const unique = entries.filter((entry, index) => entries.findIndex((candidate) =>
    candidate.secret === entry.secret && candidate.issuer === entry.issuer &&
    candidate.label === entry.label) === index)
  if (unique.length > 100) throw new Error('Mỗi lần chỉ được thêm tối đa 100 tài khoản.')
  return unique
}

export function authenticatorEntryURI(entry: AuthenticatorEntry): string {
  if (!validEntry(entry)) throw new Error('Mã Authenticator đã lưu không hợp lệ.')
  const label = entry.issuer ? `${entry.issuer}:${entry.label}` : entry.label
  const parameters = [
    `secret=${encodeURIComponent(entry.secret)}`,
    ...(entry.issuer ? [`issuer=${encodeURIComponent(entry.issuer)}`] : []),
    `algorithm=${encodeURIComponent(entry.algorithm)}`,
    `digits=${entry.digits}`,
    `period=${entry.period}`,
  ]
  return `otpauth://totp/${encodeURIComponent(label)}?${parameters.join('&')}`
}

export function renderAuthenticatorExport(entries: AuthenticatorEntry[]): string {
  if (!Array.isArray(entries) || entries.length > 100 || !entries.every(validEntry)) {
    throw new Error('Danh sách Authenticator không hợp lệ.')
  }
  return [
    '# IT Support Toolkit Authenticator export',
    '# CANH BAO: File nay chua secret TOTP. Hay bao ve file va xoa sau khi sao luu.',
    '# Import lai bang nut Import trong tab Auth.',
    ...entries.map(authenticatorEntryURI),
    '',
  ].join('\n')
}

export function downloadAuthenticatorExport(entries: AuthenticatorEntry[]): void {
  const content = renderAuthenticatorExport(entries)
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  link.download = `it-support-authenticator-${new Date().toISOString().slice(0, 10)}.txt`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

export function generateAuthenticatorCode(entry: AuthenticatorEntry, timestamp = Date.now()): string {
  if (!validEntry(entry)) throw new Error('Mã Authenticator đã lưu không hợp lệ.')
  return OTPAuth.TOTP.generate({
    secret: OTPAuth.Secret.fromBase32(entry.secret),
    algorithm: entry.algorithm,
    digits: entry.digits,
    period: entry.period,
    timestamp,
  })
}

export function authenticatorRemainingSeconds(entry: AuthenticatorEntry, timestamp = Date.now()): number {
  return Math.max(1, Math.ceil(OTPAuth.TOTP.remaining({ period: entry.period, timestamp }) / 1000))
}

async function encryptionKey(create: boolean): Promise<CryptoKey | null> {
  const saved = await chrome.storage.local.get(authenticatorEncryptionKey)
  let raw: Uint8Array
  const encoded = saved[authenticatorEncryptionKey]
  if (typeof encoded === 'string') {
    try {
      raw = base64ToBytes(encoded)
      if (raw.length !== 32) throw new Error('invalid key')
    } catch {
      throw new Error('Khóa mã hóa Authenticator đã lưu không hợp lệ.')
    }
  } else {
    if (!create) return null
    raw = crypto.getRandomValues(new Uint8Array(32))
    await chrome.storage.local.set({ [authenticatorEncryptionKey]: bytesToBase64(raw) })
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function loadAuthenticatorEntries(): Promise<AuthenticatorEntry[]> {
  const saved = await chrome.storage.local.get(authenticatorVaultKey)
  const vault = saved[authenticatorVaultKey] as Partial<EncryptedVault> | undefined
  if (!vault) return []
  if (vault.version !== 1 || typeof vault.iv !== 'string' || typeof vault.ciphertext !== 'string') {
    throw new Error('Kho Authenticator đã lưu không hợp lệ.')
  }
  const key = await encryptionKey(false)
  if (!key) throw new Error('Không tìm thấy khóa giải mã Authenticator.')
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(vault.iv) },
      key,
      base64ToBytes(vault.ciphertext),
    )
    const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext))
    if (!Array.isArray(parsed) || !parsed.every(validEntry)) throw new Error('invalid entries')
    return parsed
  } catch {
    throw new Error('Không thể giải mã dữ liệu Authenticator.')
  }
}

export async function saveAuthenticatorEntries(entries: AuthenticatorEntry[]): Promise<void> {
  if (!Array.isArray(entries) || entries.length > 100 || !entries.every(validEntry)) {
    throw new Error('Danh sách Authenticator không hợp lệ.')
  }
  const key = await encryptionKey(true)
  if (!key) throw new Error('Không thể tạo khóa mã hóa Authenticator.')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(entries))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  const vault: EncryptedVault = {
    version: 1,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  }
  await chrome.storage.local.set({ [authenticatorVaultKey]: vault })
}
