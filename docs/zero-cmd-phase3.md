# Zero CMD Phase 3 — Windows Network API

Scope: T06, replacing `ipconfig /all` with the Windows IP Helper API.

## Implementation

- `GetAdaptersAddresses` supplies adapter name, description, kind, status, MAC, IPv4/IPv6 addresses with prefix and DAD state, gateways, DNS servers, DNS suffix, MTU, link speed, DHCP/NetBIOS flags, DHCPv6 IAID and DUID.
- `GetAdaptersInfo` supplies DHCP server and IPv4 lease times; adapters are matched by `IfIndex`, not display name.
- `GetPerAdapterInfo` supplies autoconfiguration state.
- `GetNetworkParams` supplies host name, primary DNS suffix, node type, routing/WINS proxy and NetBIOS scope.
- The public Native Messaging `adapters` array keeps the v0.1.9 shape `{ name, ipAddresses, mac }`; the `ipconfig` text field is rebuilt by the formatter.

## Verification

- `go test ./...` and `go vet ./...` pass.
- `TestAdaptersMatchIpconfigReference` compares every API-derived adapter header, MAC, gateway, DNS server and DUID with live `ipconfig /all` on this Windows machine. `ipconfig` is only invoked by the test, never by the Agent runtime.
- Manual block comparison for the connected Wi-Fi adapter matches the reference field-for-field, including `(Preferred)` address state, subnet mask, DHCP server, IAID, DUID, multi-line DNS servers and NetBIOS state.
- Disconnected Ethernet/WireSock/virtual adapters match the reference shape (`Media State`, suffix, description, MAC, DHCP, autoconfiguration) and omit address fields.

## Known difference

`Lease Obtained` comes from `IP_ADAPTER_INFO.LeaseObtained`. On this machine Windows reports the last renewal time (`12:46:06`), which is exactly one lease duration before `Lease Expires`; `ipconfig /all` still prints an older original timestamp (`11:27:03`). `Lease Expires` and every other compared field match. The API value is used as-is; no registry or shell fallback was added.
