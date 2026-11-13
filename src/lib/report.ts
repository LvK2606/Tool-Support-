export interface DiskInfo { drive: string; totalGB: number | null; freeGB: number | null; freePct: number | null }
export interface AdapterInfo { name: string; ipv4Configured: boolean; dhcpEnabled: boolean; hasGateway: boolean; hasDns: boolean }
export interface ServiceInfo { name: string; status: string; startType: string }
export interface DiagnosticReport {
  schema: "fixit-commander-diagnostics";
  schemaVersion: 1;
  generatedAt: string;
  modules: Array<"system" | "network" | "windows" | "printer">;
  system: null | { osCaption: string; osVersion: string; cpuName: string; ramGB: number | null; uptimeHours: number | null; disks: DiskInfo[] };
  network: null | { adapters: AdapterInfo[] };
  windows: null | { services: ServiceInfo[]; systemErrorCountSampled: number | null; systemErrorSampleLimit: number };
  printer: null | { spoolerStatus: string; printerCount: number | null };
  errors: string[];
}
export type Severity = "ok" | "warning" | "critical" | "unknown";
export interface Finding { id: string; category: string; title: string; severity: Severity; evidence: string; advice: string }
export interface AnalyzedReport { report: DiagnosticReport; findings: Finding[]; counts: Record<Severity, number>; score: number | null }
const MODS = ["system","network","windows","printer"] as const;
const SERVICES = ["Dnscache","Dhcp","EventLog","Spooler"];
function object(v: unknown): v is Record<string, unknown> { return v !== null && typeof v === "object" && !Array.isArray(v); }
function text(v: unknown, max = 160): string { return typeof v === "string" ? v.slice(0,max).replace(/[\u0000-\u001f\u007f]/g," ") : ""; }
function number(v: unknown, max = 1e9): number | null { return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : null; }
function array(v: unknown, max = 32): unknown[] { return Array.isArray(v) ? v.slice(0,max) : []; }
export function parseDiagnosticReport(content: string): DiagnosticReport {
  if (content.length > 512 * 1024) throw new Error("Báo cáo quá lớn, tối đa 512 KB.");
  let raw: unknown;
  try { raw = JSON.parse(content.replace(/^\uFEFF/,"")); }
  catch { throw new Error("Đây không phải JSON hợp lệ."); }
  if (!object(raw) || raw.schema !== "fixit-commander-diagnostics" || raw.schemaVersion !== 1) {
    throw new Error("Không đúng định dạng FIXIT-Report v1. Hãy tạo file từ website.");
  }
  if (typeof raw.generatedAt !== "string" || raw.generatedAt.length > 64 || !Number.isFinite(Date.parse(raw.generatedAt))) {
    throw new Error("Báo cáo có ngày tạo không hợp lệ.");
  }
  if (!Array.isArray(raw.modules) || raw.modules.length < 1 || raw.modules.length > 4 ||
      raw.modules.some((m) => !MODS.includes(m as typeof MODS[number]))) {
    throw new Error("Danh sách module không được hỗ trợ.");
  }
  const modules = [...new Set(raw.modules as DiagnosticReport["modules"])];
  const system = (): DiagnosticReport["system"] => {
    if (!object(raw.system)) return null;
    return {
      osCaption: text(raw.system.osCaption), osVersion: text(raw.system.osVersion),
      cpuName: text(raw.system.cpuName),
      ramGB: number(raw.system.ramGB,1e6), uptimeHours: number(raw.system.uptimeHours,1e7),
      disks: array(raw.system.disks,40).filter(object).map((d) => ({
        drive:text(d.drive,12), totalGB:number(d.totalGB), freeGB:number(d.freeGB), freePct:number(d.freePct,100),
      })),
    };
  };
  const network = (): DiagnosticReport["network"] => {
    if (!object(raw.network) || !Array.isArray(raw.network.adapters)) return null;
    return { adapters: array(raw.network.adapters,20).filter(object).filter((a) =>
      ["ipv4Configured","dhcpEnabled","hasGateway","hasDns"].every((k) => typeof a[k] === "boolean")).map((a) => ({
      name:text(a.name,100), ipv4Configured:a.ipv4Configured===true, dhcpEnabled:a.dhcpEnabled===true,
      hasGateway:a.hasGateway===true, hasDns:a.hasDns===true,
    })) };
  };
  const windows = (): DiagnosticReport["windows"] => {
    if (!object(raw.windows)) return null;
    return {
      services:array(raw.windows.services,10).filter(object).map((s) => ({
        name:SERVICES.includes(s.name as string)?String(s.name):"Unknown",
        status:text(s.status,32),startType:text(s.startType,32),
      })),
      systemErrorCountSampled:number(raw.windows.systemErrorCountSampled,20),
      systemErrorSampleLimit:20,
    };
  };
  const printer = (): DiagnosticReport["printer"] => {
    if (!object(raw.printer)) return null;
    return { spoolerStatus:text(raw.printer.spoolerStatus,32),printerCount:number(raw.printer.printerCount,1e5) };
  };
  return {
    schema:"fixit-commander-diagnostics", schemaVersion:1, generatedAt:raw.generatedAt, modules,
    system:modules.includes("system")?system():null,
    network:modules.includes("network")?network():null,
    windows:modules.includes("windows")?windows():null,
    printer:modules.includes("printer")?printer():null,
    errors:array(raw.errors,16).map((e)=>text(e,120)).filter(Boolean),
  };
}
export function analyzeReport(report:DiagnosticReport):AnalyzedReport {
  const findings:Finding[]=[];
  const add=(id:string,category:string,title:string,severity:Severity,evidence:string,advice:string)=>{
    findings.push({id,category,title,severity,evidence,advice});
  };
  if(report.modules.includes("system")){
    if(!report.system) add("system","Hệ thống","Thông tin Windows","unknown","Không có dữ liệu.","Kiểm tra quyền và chạy lại PowerShell.");
    else {
      add("os","Hệ thống","Hệ điều hành",report.system.osCaption?"ok":"unknown",report.system.osCaption||"Chưa rõ","Đây chỉ là kết quả đọc thông tin Windows.");
      if(!report.system.disks.length) add("disk-empty","Ổ đĩa","Dung lượng ổ","unknown","Không thấy ổ đĩa hợp lệ.","Kiểm tra Disk Management.");
      for(const d of report.system.disks){
        const p=d.freePct;
        const severity:Severity=p===null?"unknown":p<5?"critical":p<15?"warning":"ok";
        add("disk-"+d.drive,"Ổ đĩa","Dung lượng "+(d.drive||"ổ đĩa"),severity,
          p===null?"Không đọc được dung lượng.":p.toFixed(1)+"% dung lượng trống",
          severity==="critical"||severity==="warning"?"Kiểm tra Storage Settings. Sao lưu trước khi dọn dẹp.":"Theo dõi định kỳ; không tự xóa dữ liệu.");
      }
    }
  }
  if(report.modules.includes("network")){
    if(!report.network||!report.network.adapters.length)
      add("network-missing","Mạng","Adapter IPEnabled","unknown","Chưa có adapter được đọc.","Có thể đang offline, dùng VPN hoặc không có quyền truy cập.");
    else{
      const adapters=report.network.adapters;
      const gateway=adapters.some((a)=>a.hasGateway);
      const dns=adapters.some((a)=>a.hasDns);
      add("gateway","Mạng","Default Gateway",gateway?"ok":"warning",
        gateway?"Có adapter được cấu hình Gateway.":"Không thấy Gateway trên các adapter đọc được.",
        "Không chứng minh Internet đã hoạt động. Kiểm tra đặc thù VPN/LAN.");
      add("dns","Mạng","Cấu hình DNS",dns?"ok":"warning",
        dns?"Có DNS resolver được cấu hình.":"Không thấy DNS resolver.",
        "Chưa kiểm tra phân giải DNS thực tế; không tự đổi DNS công ty.");
    }
  }
  if(report.modules.includes("windows")){
    if(!report.windows) add("win-missing","Windows","Dịch vụ và Event Log","unknown","Không có dữ liệu.","Kiểm tra lại quyền đọc dịch vụ.");
    else{
      for(const s of report.windows.services){
        const state=s.status.toLowerCase();
        const sev:Severity=state==="running"?"ok":s.startType.toLowerCase()==="automatic"?"warning":"unknown";
        add("svc-"+s.name,"Windows","Dịch vụ "+s.name,sev,s.status+" · "+s.startType,
          "Manual/Disabled có thể do chính sách chủ đích. Không tự thay đổi dịch vụ.");
      }
      const n=report.windows.systemErrorCountSampled;
      add("event","Windows","Mẫu lỗi System Event Log 24 giờ",n===null?"unknown":n>0?"warning":"ok",
        n===null?"Không đọc được log.":n+" sự kiện lấy mẫu (tối đa 20).",
        "Số lượng sự kiện không xác định nguyên nhân. Kiểm tra qua Event Viewer.");
    }
  }
  if(report.modules.includes("printer")){
    if(!report.printer) add("printer","Máy in","Dịch vụ in","unknown","Không đọc được thông tin.","Kiểm tra dịch vụ Spooler thủ công.");
    else{
      const state=report.printer.spoolerStatus.toLowerCase();
      const sev:Severity=state==="running"?"ok":(report.printer.printerCount??0)>0?"warning":"unknown";
      add("spooler","Máy in","Print Spooler",sev,report.printer.spoolerStatus+" · Số máy in: "+(report.printer.printerCount??"chưa rõ"),
        "Không restart hoặc xóa queue trước khi kiểm tra ảnh hưởng tới người dùng.");
    }
  }
  report.errors.forEach((e,i)=>add("error-"+i,"Thu thập dữ liệu","Module chưa đọc được","unknown",e,
    "Kiểm tra quyền hoặc chạy lại script trên PowerShell Windows."));
  const counts={ok:0,warning:0,critical:0,unknown:0};
  findings.forEach((f)=>{counts[f.severity]++});
  const measured=counts.ok+counts.warning+counts.critical;
  return {report,findings,counts,score:measured?Math.round(100*counts.ok/measured):null};
}
export function exportAnalysis(value:AnalyzedReport):string {
  return JSON.stringify({
    schema:"fixit-analysis",version:1,generatedAt:new Date().toISOString(),
    sourceTimestamp:value.report.generatedAt,
    modules:value.report.modules,counts:value.counts,findings:value.findings,
    note:"Chỉ đánh giá các điều kiện đã kiểm tra; không chứng nhận toàn bộ máy tính khỏe mạnh.",
  },null,2);
}
