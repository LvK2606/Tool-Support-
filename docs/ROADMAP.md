# FIXIT Commander roadmap

## Delivered: MVP foundation (v0.1.0)
Tauri + React UI, Windows CIM inventory, deterministic check statuses, local SQLite history, two guarded fixed recipes, report JSON, web demo and CI source/build workflow.

## Next milestone: tested MVP v0.2
- Windows CI build success, manual Windows 11 VM smoke tests and reliable installer artifact.
- Normalize all PS output; remove fragile WMI provider assumptions and add per-detector error isolation.
- Proper bounded subprocess output, cancellation and secure audit retention.
- Add opt-in external DNS/TCP checks (configured endpoints), stronger repair rechecks.
- Add Event Log time-window counters (do not export user-sensitive event messages by default).
- Redaction policy and report HTML generation.

## v1.1
- WinGet allowlisted installer workflows and safe Print Spooler diagnostics.
- DHCP renew behind live network/remote-session safety tests.
- Admin helper with signed, narrowly scoped actions.
- RestoreHealth/SFC as manual, high-risk, elevated operations with post-check evidence.
- Installer signatures and staged update channels.

## v2+
- Opt-in AI triage: AI only suggests; cannot directly invoke native commands.
- Optional organization-managed remote agent, explicit user consent, device authentication, audit and encrypted transport.
- Backend + cloud database **only when** multi-device sync is needed; choose either Neon or Supabase, not both by default.
- Render or Cloudflare Workers may host API, Vercel remains public website.
