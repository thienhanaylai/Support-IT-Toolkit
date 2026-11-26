export function validTarget(value: string): boolean {
  const target = value.trim()
  if (!target || target.length > 253 || /[\s\/\\?#@]/.test(target) || target.startsWith('-')) return false
  if (target.startsWith('[') && target.endsWith(']')) return validTarget(target.slice(1, -1))
  if (target.includes(':')) return /^[0-9a-f:.%]+$/i.test(target) && target.includes(':') && !target.includes('%')
  return target.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
}

export function parseInput(input: string): { host: string; url: string } {
  const trimmed = input.trim()
  if (/^(?:https?:)\/\//i.test(trimmed)) {
    const url = new URL(trimmed)
    if (!validTarget(url.hostname)) throw new Error('Domain/IP không hợp lệ')
    return { host: url.hostname, url: url.href }
  }
  if (!validTarget(trimmed)) throw new Error('Domain/IP không hợp lệ')
  const host = trimmed.replace(/^\[|\]$/g, '')
  return { host, url: `https://${host.includes(':') ? `[${host}]` : host}/` }
}

export function safeTimeout(n: number): number {
  return Number.isFinite(n) ? Math.max(500, Math.min(10000, Math.round(n))) : 3000
}

export function safePort(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error('Port phải từ 1 đến 65535')
  return n
}

export function safePingCount(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error('Số lần Ping phải từ 1 đến 5')
  return n
}

export function safeHTTPCount(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error('Số lần HTTP Ping phải từ 1 đến 5')
  return n
}

export function safeMaxHops(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 30) throw new Error('Số hop Traceroute phải từ 1 đến 30')
  return n
}
