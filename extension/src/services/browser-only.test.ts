// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isTool, tools } from './checks'

describe('Browser-only distribution', () => {
  it('exposes only browser and Portal tools', () => {
    expect(tools).toEqual(['doh_lookup', 'public_ip', 'http_ping', 'vm_info'])
    for (const retired of [
      'ping', 'traceroute', 'tcp_check', 'port_scan', 'dns_lookup', 'tls_check',
      'local_interfaces', 'mxtoolbox', 'whois',
    ]) {
      expect(isTool(retired)).toBe(false)
    }
  })

  it('does not request Native Messaging permission', () => {
    const manifestPath = fileURLToPath(new URL('../../public/manifest.json', import.meta.url))
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { permissions?: string[] }
    expect(manifest.permissions).not.toContain('nativeMessaging')
  })
})
