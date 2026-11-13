# FIXIT Commander Web Roadmap

## Current v1.0 — No-install web
- Four selectable Windows PowerShell read-only collectors.
- Local JSON, strict in-browser import, deterministic findings, report export.
- Consent-gated manual fix commands and responsive interface.
- GitHub Actions web tests and Vercel production.

## v1.1
- Stronger collector fallback handling for unavailable Windows providers and verbose per-check unknown status.
- Before-and-after JSON comparison within browser, more granular privacy redaction.
- Optional network probes with clearly disclosed destinations and explicit opt-in.
- Browser-printable technician report and accessibility QA.
- PowerShell automated tests on Windows VMs.

## v2 (optional)
- Ticket and asset registry with user authentication, only if a team asks for synchronized work.
- Choose one cloud database (Neon or Supabase), not both by default; Render or Cloudflare only if API endpoints are justified.
- Optional signed Windows agent only for customers who accept installation. Never silently introduce it into the no-install edition.
