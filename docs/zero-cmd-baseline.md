# Zero CMD compatibility baseline

Baseline source: tag `v0.1.9`, commit `7e4b689e1927558281b1c9be50743454626d0397`.

This document records the public behavior that the Zero CMD implementation must preserve. The source and tests at the baseline commit are authoritative when this summary is incomplete.

## Native Messaging contract

- Host ID: `com.itsupport.toolkit`.
- Requests are JSON objects containing `action` plus action-specific fields.
- A non-stream response contains `success`, `action`, and action-specific data. Failures contain `success: false`, `action`, and `error`.
- Streaming requests add `stream: true`. Progress frames are `{ "type": "progress", "text": string }`, optionally with numeric `completed` and `total`; the final frame uses the normal response contract.
- The extension opens a native connection only when a native tool is run. A missing/disconnected host is reported in the existing result error area.
- v0.1.9 has no public cancel-job message or cancel button. Zero CMD must not claim cancellation support that the UI does not expose.

## Tool requests and result schemas

### Ping

Request: `{ action: "ping", target, count, timeoutMs[, stream] }`.

Defaults and validation: count defaults to 4 and must be an integer from 1 to 5; timeout is clamped by the existing settings validation to 500–10000 ms.

Result fields: `target`, `sent`, `received`, `loss`, `min`, `avg`, `max`, `timesMs`, `raw`, `note`, plus `success` and `action` from the Native Messaging adapter. Streaming progress is plain output text. The UI displays only `raw` in the existing terminal block.

### Traceroute

Request: `{ action: "traceroute", target, maxHops, timeoutMs[, stream] }`.

Defaults and validation: max hops defaults to 20 and must be an integer from 1 to 30; three probes are produced per hop by the v0.1.9 implementation.

Result fields: `target`, `hops`, `raw`, optional `timedOut`, plus `success` and `action`. `hops` contains the trimmed display line for each hop. The UI displays `raw` in the existing terminal block.

### Local interfaces

Request: `{ action: "local_interfaces", timeoutMs }`.

Result fields: `adapters` and, on Windows v0.1.9, `ipconfig`. Each adapter has `name`, `ipAddresses`, and `mac`. The UI prefers the `ipconfig` text in the terminal block; if unavailable it formats the adapter list as `Adapter`, `IP`, and `MAC` lines.

### Public IP

Request at v0.1.9: `{ action: "public_ip", timeoutMs }`. Result: `{ ip }`, plus `success` and `action`. Source label: `Máy người dùng · curl ifconfig.me`. Progress text: `Đang chạy curl ifconfig.me...`. Input target label: `Đường truyền hiện tại`.

The Browser Engine replacement must keep the result `{ ip }`, target label, validation and visible output, while changing the source to accurately identify browser Fetch rather than curl/Agent.

### DNS Check

Request: `{ action: "dns_lookup", name, recordType, resolver, timeoutMs }`.

Existing record types: `AUTO`, `A`, `AAAA`, `MX`, `TXT`, `NS`, `CNAME`, `PTR`. `AUTO` maps a domain to `A/AAAA` and an IP to `PTR`. Result fields: `name`, `recordType`, `records`, `durationMs`, `resolver`, plus `success` and `action`.

The existing DNS Check uses the system DNS or an explicitly entered DNS server through the Agent. DoH is an additional Browser Engine tool and must not silently replace this measurement.

### Native tools retained without process execution

- TCP Check: Go `net.DialTimeout`.
- Port Scan: Go TCP networking, with `completed`/`total` progress.
- TLS Check: Go `crypto/tls` and `crypto/x509`.
- DNS Check: Go `net.Resolver`.

## UI baseline

- Popup starts on Authenticator; network tools are under the existing **Công cụ** tab.
- Tool names, grouping, controls, loading block, result block, history and visual design must remain unchanged for existing tools.
- Ping and Traceroute use the terminal result presentation; LAN prefers terminal output when `ipconfig` exists.
- Agent failures use the existing `.error` area. Browser tools must remain runnable without a registered Native Host.
- Baseline screenshot: [`zero-cmd-baseline-tools.png`](zero-cmd-baseline-tools.png).

## Runtime process baseline and target

At v0.1.9, runtime network checks call `ping`, `tracert`, `ipconfig /all`, and `curl.exe`; these are the only `os/exec` users in the Agent. The target implementation must remove all runtime `os/exec` use while leaving build, installer and developer commands out of scope.

## Baseline tests

- Extension: 122 tests at v0.1.9.
- Agent: `go test ./...` and `go vet ./...` pass.
- Installer tests pass for Chrome, Edge, dev update, UTF-8 output, failure handling, Native Host ID registration and invalid ID rejection.

Dynamic values such as IP addresses, route hops, RTT, timestamps and adapter lists are not snapshot constants. Compatibility means preserving their types, meaning, labels and formatter structure for equivalent fixed input data.
