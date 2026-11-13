# FIXIT Commander — Web Edition

**FIXIT Commander is now a no-install IT Support website.** Users create an inspectable read-only Windows PowerShell script, choose to run it manually on authorized Windows devices, and import a locally generated JSON file to get diagnostic findings. Browser JavaScript never executes OS repair commands.

**Production:** https://fixit-commander.vercel.app

## Features

- Four preset read-only diagnostics: system/disk, network configuration, Windows services/event counts and printers.
- PowerShell 5.1 compatible generated script with only selected modules and local JSON output to Desktop/Documents.
- Copy/paste recommended. Optional script download is a plain .ps1 text file, not an installer. Never override enterprise execution policy.
- Local browser JSON import, strict schema and field allowlist, 512 KB file limit. No network uploads and no localStorage.
- Deterministic classification: normal, warning, critical and unknown. Missing data never implies success.
- Exports sanitized analysis JSON.
- Manual, consent-gated repair snippets: flush DNS, DISM CheckHealth, and read-only DNS/Spooler checks.
- Responsive browser UI and clear sample-data labeling.
- Vercel static hosting, CSP with connect-src none and GitHub Actions tests.

## Usage

1. Open website and choose **Tạo lệnh chẩn đoán**.
2. Select modules, inspect the PowerShell script, click **Sao chép toàn bộ**.
3. On the Windows machine you are authorized to support, open **Windows PowerShell**, paste and run the inspected code. No Admin request, remote download or execution-policy modification.
4. Find `FIXIT-Report-YYYYMMDD-HHmmss.json` on your Desktop, or Documents fallback.
5. On website, choose **Phân tích kết quả** → **Nhập file JSON**. It is processed inside your browser; Vercel never receives its contents.
6. Inspect issues and advice. For a repair, review the allowlisted command, acknowledge, copy and execute manually. Re-run diagnostics to verify.

**Important:** The browser cannot inspect or fix Windows directly. No remote agent, no hidden background task. Users must obey enterprise PowerShell/Group Policy restrictions.

## Development

Requires Node.js 22+ and npm 11 recommended.

`npm install`
`npm run dev`
`npm test`
`npm run build`
`npm run preview`

## Structure

- `src/App.tsx`: web interface.
- `src/lib/diagnostic-script.ts`: fixed PowerShell collectors and manual repair recipes.
- `src/lib/report.ts`: secure local JSON import, normalization, rules and sanitized export.
- `src/lib/report.test.ts`: allowlist, parsing and rules tests.
- `vercel.json`: CSP and static deployment.
- `.github/workflows/ci.yml`: safety tests + Vite build.

The desktop Tauri version is preserved in Git history prior to this web migration and is no longer part of the current branch/build. Render, Neon, Supabase and Cloudflare are intentionally unnecessary and not provisioned.

See [Security model](docs/SECURITY.md) and [Roadmap](docs/ROADMAP.md).
