import type { ScanResult } from "./types";

export function createRedactedReport(scan: ScanResult, mode: "demo" | "desktop") {
  return {
    product: "FIXIT Commander",
    version: "0.1.0",
    mode,
    isMockData: mode === "demo",
    generatedAt: new Date().toISOString(),
    scanId: scan.id,
    scanAt: scan.timestamp,
    device: { hostname: "[REDACTED]", os: scan.snapshot.os ?? "unknown", version: scan.snapshot.version ?? "unknown" },
    checks: scan.checks.map(({ id, title, category, status, evidence, recommendation }) =>
      ({ id, title, category, status, evidence, recommendation })),
    warning: "Báo cáo này không chứng nhận thiết bị an toàn, không ghi nhận sửa lỗi tự động.",
  };
}

export function downloadReport(scan: ScanResult, mode: "demo" | "desktop") {
  const contents = JSON.stringify(createRedactedReport(scan, mode), null, 2);
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "fixit-report-" + scan.id.replace(/[^a-zA-Z0-9_-]/g, "-") + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
