# Security model: Web + Manual PowerShell

1. Only explicitly allowlisted module identifiers are accepted. Generated PowerShell is fixed and inspectable, not AI-created and never runs automatically in the browser.
2. Windows scripts only read OS, RAM, CPU, disk space, adapter configuration flags, service state and event error count (max 20). They do not read passwords, account names, hostnames, full IP addresses, printer names, jobs or event message bodies. Their single write is a JSON report to the user's Desktop or Documents.
3. Script makes **no external network requests**, runs no remote code, does not change registry, services, execution policy or UAC. Enterprise execution policy must not be bypassed.
4. The browser reads JSON via File API; imported data is validated (max 512 KB, schemaVersion 1), normalized to a small allowlist, and stays in memory. No POST upload, cloud backend, log analytics or persistent browser storage.
5. Vercel headers restrict script execution and set connect-src 'none'. Browser extensions and compromised source/deployment are outside the app's direct control.
6. Manual repair recipes require explicit review and consent before the Copy button is enabled; browser never runs them.
7. Diagnoses are limited to selected checks, and sampled log counts do not prove root cause. Unknown observations stay unknown. The PASS percentage is not an overall PC health score.
8. Network adapter descriptions, CPU names and service states may still be sensitive enterprise information. Users should review any JSON before sharing with others.

## QA before organization-wide use

- Validate all module combinations with Windows PowerShell 5.1 on a VM and several Windows editions/locales.
- Test without Administrator, when CIM/WinRM/Event Log providers are unavailable.
- Validate null network lists, no printer, no system error event, Desktop redirect to OneDrive, and Windows Server restrictions.
- Try invalid/oversized/malicious JSON. Verify no XSS, no upload and no raw fields escaping the validated schema.
- Test keyboard-only operation, mobile layout, secure headers and copying commands.
- Treat the generated .ps1 as unsigned. Do not instruct users to change Group Policy or set ExecutionPolicy Bypass.
