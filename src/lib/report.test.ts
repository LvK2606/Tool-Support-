import { describe, expect, it } from "vitest";
import { buildDiagnosticScript, MODULES } from "./diagnostic-script";
import { analyzeReport, exportAnalysis, parseDiagnosticReport } from "./report";

const base = {
  schema:"fixit-commander-diagnostics",schemaVersion:1,generatedAt:"2026-11-13T09:00:00.000Z",
  modules:["system"],
  system:{osCaption:"Windows 11",osVersion:"10.0",cpuName:"CPU",ramGB:16,uptimeHours:24,
    disks:[{drive:"C:",totalGB:256,freeGB:8,freePct:3.1}]},
  network:null,windows:null,printer:null,errors:[],
};
describe("PowerShell allowlist",()=>{
  it("generates only requested read-only modules",()=>{
    const script=buildDiagnosticScript(["system","network"]);
    expect(script).toContain("Win32_LogicalDisk");
    expect(script).toContain("Win32_NetworkAdapterConfiguration");
    expect(script).not.toContain("Get-Printer");
    expect(script).not.toContain("Get-WinEvent");
    expect(script).not.toContain("Set-ExecutionPolicy");
    expect(script).not.toContain("Invoke-Expression");
    expect(script).not.toContain("Invoke-WebRequest");
  });
  it("rejects module injection",()=>{
    expect(()=>buildDiagnosticScript(["system'; Remove-Item C:\\*" as never])).toThrow();
    expect(()=>buildDiagnosticScript([])).toThrow();
  });
  it("makes each module independently selectable",()=>{
    for(const m of MODULES)expect(buildDiagnosticScript([m.id])).toContain("# MODULE: "+m.id);
  });
});
describe("Untrusted local JSON",()=>{
  it("filters unknown fields and scores critical disk space",()=>{
    const report=parseDiagnosticReport(JSON.stringify({...base,password:"SECRET-NEVER-SAVE"}));
    expect(JSON.stringify(report)).not.toContain("SECRET-NEVER-SAVE");
    const analyzed=analyzeReport(report);
    expect(analyzed.counts.critical).toBe(1);
    expect(exportAnalysis(analyzed)).not.toContain("SECRET-NEVER-SAVE");
  });
  it("rejects an arbitrary non-FIXIT json file",()=>{
    expect(()=>parseDiagnosticReport('{"password":"x"}')).toThrow();
  });
  it("treats empty collector as unknown, never green",()=>{
    const result=analyzeReport(parseDiagnosticReport(JSON.stringify({...base,system:null,errors:["system: unavailable"]})));
    expect(result.counts.unknown).toBeGreaterThan(0);
    expect(result.score).toBeNull();
  });
  it("rejects oversized input",()=>expect(()=>parseDiagnosticReport(" ".repeat(512*1024+1))).toThrow());
});
