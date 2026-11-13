import { describe, expect, it } from "vitest";
import { demoScan } from "./demo";
import { createRedactedReport } from "./report";

describe("report redaction", () => {
  it("never discloses raw hostname in a public report", () => {
    const scan = demoScan();
    const report = createRedactedReport(scan, "demo");
    expect(report.device.hostname).toBe("[REDACTED]");
    expect(JSON.stringify(report)).not.toContain(scan.snapshot.hostname);
    expect(report.isMockData).toBe(true);
  });
});
