# Zero CMD Phase 4 — Browser network tools

Phase 4 implements T08 without replacing ICMP Ping or the existing system DNS Check.

## HTTP Ping

- Runs in the Browser Engine with `fetch`, `performance.now()` and `AbortController`.
- Supports `HEAD` and `GET`, 1–5 requests, and the existing 500–10000 ms timeout setting.
- Measures time until response headers are available.
- Sends no cookies (`credentials: "omit"`) and requests optional host access only for the user-entered HTTP/HTTPS origin.
- Treats HTTP 4xx/5xx as received HTTP responses, while showing the run as a warning when a response is not 2xx.
- Reports transport errors separately and includes them in request loss.
- Keeps HTTP Ping independent from the existing ICMP Ping.

## DNS over HTTPS

- Uses RFC 8484 wire format (`application/dns-message`) over `fetch`.
- Resolver choices: Cloudflare, Google, and Quad9.
- Supports `A`, `AAAA`, `CNAME`, `MX`, `TXT`, `NS`, `SOA`, `PTR`, `CAA`, and `SRV`.
- Converts IPv4 and IPv6 input to reverse zones for PTR queries.
- Preserves DNS statuses such as `NOERROR`, `NXDOMAIN`, and `SERVFAIL`; no-data is displayed as an empty record result.
- Clearly identifies the selected public resolver and states that the result does not represent system/VPN DNS.
- Keeps DoH independent from the Agent-backed DNS Check and MXToolbox.

The manifest adds only the three fixed HTTPS DoH resolver hosts. HTTP Ping continues to use the existing optional HTTP/HTTPS host permission and asks for only the entered origin.

## UI regression

The two tools reuse the existing tool cards, input panel, option grid, progress area, result block, and history format. Existing tools retain their labels and controls.

- [HTTP Ping form](zero-cmd-phase4-http-ping.jpg)
- [DNS over HTTPS form](zero-cmd-phase4-doh.jpg)

The UI was checked at the popup's 561 px width in the existing dark theme. No console errors were present in the UI harness.

## Verification

- Browser-tool integration tests assert that HTTP Ping and DoH complete without calling `sendNativeMessage`.
- HTTP tests cover URL validation, HEAD/GET request behavior, 2xx versus 4xx, transport errors, timeout, progress, and abort propagation.
- DoH tests cover query construction, IPv4/IPv6 PTR, every exposed record type, `NXDOMAIN`, `SERVFAIL`, HTTP failure, timeout, formatter output, and resolver selection.
- Popup tests cover both new forms, persisted choices, per-origin HTTP permission, and request wiring.
- A live development probe returned HTTP 200 for `HEAD https://example.com/`; Cloudflare and Google returned valid RFC 8484 responses. Quad9 requires HTTP/2, which Chromium supplies; the Node HTTP/1.1 probe was therefore not used as a Quad9 acceptance result.

The v0.1.9 baseline exposes no cancel button or public cancel-job message. Phase 4 does not add or claim new cancellation UX; the Browser Engine functions accept an abort signal and always enforce finite request timeouts.
