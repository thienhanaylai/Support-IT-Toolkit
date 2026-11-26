# Zero CMD Phase 5 — Final removal and regression

Phase 5 implements T07 and verifies T01–T08 on branch `refactor/zero-cmd`.

## Removed from the Native Agent

- Removed the legacy `public_ip` Native Messaging action. Public IP is now owned by the Browser Engine.
- Removed `commandOutput`, `os/exec`, `exec.CommandContext`, and the fixed `curl.exe` command.
- Removed obsolete Agent tests for curl command construction and stdout parsing.
- Replaced the test-only `ipconfig /all` reference process with an API/formatter contract test. The live comparison evidence remains recorded in `zero-cmd-phase3.md`.
- Added `public_ip` to the unsupported-action test so the Agent cannot silently reintroduce the old path.

The following case-insensitive scan returns no matches in `native-agent/**/*.go`:

```text
os/exec
exec.Command
commandOutput
cmd.exe
powershell
ping.exe
tracert.exe
ipconfig.exe
curl.exe
```

## Runtime process check

A freshly built Agent was driven through Native Messaging frames for:

- `local_interfaces`
- `ping` to `127.0.0.1`
- `traceroute` to `198.51.100.1`

All three actions returned `success: true`. Sampling direct children of the Agent found only Windows `conhost.exe`, which hosts the console-subsystem Agent process. No `ping`, `tracert`, `ipconfig`, `curl`, `cmd`, or PowerShell child was created by a network check.

## Regression results

- Extension tests: **147/147 passed**.
- Extension TypeScript and production Vite build: passed.
- Native Agent `go test ./...`: passed.
- Native Agent `go vet ./...`: passed.
- Native Agent Windows executable build: passed.
- Installer tests: Chrome, Edge, no-browser, dev update, CMD UTF-8, and CMD failure handling passed.
- Browser-tool tests explicitly verify Public IP, HTTP Ping, and DoH do not call the Native Host.
- Native tools retain the existing request/result/progress adapter and Local Agent failure area.
- Manifest version remains `0.1.9`; Host ID, Extension ID, and installation flow are unchanged.

`go test -race ./...` was attempted but not run because this Go environment has CGO disabled (`-race requires cgo`). This is an environment limitation, not a test failure.

## Scope confirmation

No central Tool Router, capabilities handshake, global result/progress redesign, package split, remote backend, shell fallback, push, or release was added.
