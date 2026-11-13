# Security boundaries and limitations

## Security model

- Native commands are implemented in Rust and cannot accept arbitrary command strings or arbitrary user-supplied arguments.
- Tauri webview only receives \`core:default\`; there is no shell or filesystem plugin.
- \`NET_FLUSH_DNS\` and \`WIN_DISM_CHECK\` require explicit preview + consent + a single-use 120-second token. Token is consumed before execution.
- Fix subprocesses use fixed executable paths/names and fixed argument vectors, never \`cmd /c\` or shell string concatenation.
- Windows may require an elevated session; the tool does **not** bypass UAC or company policy.
- External Internet connectivity tests are not run by default.
- History is written only to local SQLite. The app does not authenticate or collect passwords/BitLocker keys.
- Browser mode is always simulation, even if someone downloads the static page and opens it on Windows.

## Known limitations to resolve before business deployment

1. **Repair verification:** a successful command exit is recorded as \`unverified\`; separate recovery detectors are required. DISM CheckHealth currently does not parse diagnostic results.
2. **Process boundedness:** child processes have a timeout but output streams should be consumed concurrently and capped in the production version; this MVP runs fixed commands emitting small output.
3. **Data minimization:** device scan history contains raw hostname and local network metadata. Shared-device usage requires retention policy and local access restrictions. Default reports redact hostname but evidence redaction should receive more robust testing.
4. **Threat model:** native window and IPC exposure require review under Tauri 2 capabilities and CSP. No remote webview URLs are loaded.
5. **Release supply chain:** add lockfiles, dependency vulnerability checks, signed installers and artifact attestations before production.
6. **Windows validation:** test admin/nonadmin, no network, VPN, domain-joined devices, services disabled by policy, language settings and PowerShell failures.
7. **Privacy:** no sensitive Event Log payloads are collected in MVP, and no user secrets should ever be logged.

The public web demo's font/assets must be self-contained for fully offline use; avoid external resource loads.

## QA acceptance gates

- Windows x64 app starts, scans real system data (no synthetic fallback).
- Without privileges, errors are surfaced; no simulated success.
- \`unknown\` is shown when readings fail.
- No recipe executes without separate consent.
- Repair history contains real execution outcome; no automatic success claims.
- Website clearly states DEMO and executes no Windows functions.
