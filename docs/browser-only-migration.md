# Browser-only migration

The extension no longer installs or connects to a Native Messaging Host.

## Active tools

- Public IP through browser Fetch to `https://ifconfig.me/ip`.
- HTTP Ping through browser Fetch.
- DNS over HTTPS through Cloudflare, Google or Quad9.
- VM information through the active Long Vân Portal tab.

Authenticator, Password Generator and Portal helpers remain available.

## Retired tools

- ICMP Ping
- Traceroute
- TCP Port and Port Scan
- System DNS Check
- SSL/TLS socket inspection
- LAN adapter information
- MXToolbox and WHOIS

Old saved records remain readable in history and exported reports. They are not
shown as runnable tools and are filtered from the popup's five-item recent list.

## Removed integration

- The `nativeMessaging` manifest permission.
- Native Engine and Native Host request code.
- Windows Native Agent source and release package.
- Agent download/onboarding/settings UI.
- Native Host registration and Agent installation from the Windows package.

The Windows ZIP/EXE installer now copies only the built extension. The Go
launcher used to make the optional self-extracting installer is not a network
Agent and is not installed on the user's machine.

## Deliberate limitations

Chrome/Edge Manifest V3 does not expose ICMP, Windows IP Helper, arbitrary TCP
sockets or complete local adapter information to a normal extension. HTTP Ping
is not presented as ICMP Ping, and public DoH is not presented as system/VPN
DNS. No remote probe or backend fallback was added.
