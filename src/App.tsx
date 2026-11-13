import { useMemo, useRef, useState } from "react";
import {
  Activity, AlertCircle, ArrowRight, BookOpenCheck, Check, CheckCheck, CheckCircle2, ChevronRight,
  CircleHelp, Clipboard, ClipboardCheck, Code2, Cpu, Download, FileJson2, FileText, Gauge,
  LayoutDashboard, LockKeyhole, Menu, Monitor, Network, Printer,
  ScanSearch, Search, Shield, ShieldAlert, ShieldCheck, Terminal, UploadCloud,
  Wrench, X, type LucideIcon,
} from "lucide-react";
import { buildDiagnosticScript, MODULES, REPAIR_RECIPES, type ModuleId } from "./lib/diagnostic-script";
import { analyzeReport, exportAnalysis, parseDiagnosticReport, type AnalyzedReport, type Finding, type Severity } from "./lib/report";

type Page = "overview" | "script" | "analysis" | "repairs" | "guide";
type DataSource = "import" | "sample";
const NAV: Array<{ id: Page; label: string; icon: LucideIcon }> = [
  {id:"overview",label:"Tổng quan",icon:LayoutDashboard},
  {id:"script",label:"Tạo lệnh chẩn đoán",icon:Terminal},
  {id:"analysis",label:"Phân tích kết quả",icon:ScanSearch},
  {id:"repairs",label:"Thư viện sửa lỗi",icon:Wrench},
  {id:"guide",label:"Hướng dẫn & bảo mật",icon:ShieldCheck},
];
const MOD_ICONS:Record<ModuleId,LucideIcon>={system:Cpu,network:Network,windows:Activity,printer:Printer};
const LABELS:Record<Severity,string>={ok:"Bình thường",warning:"Cảnh báo",critical:"Cần chú ý",unknown:"Chưa xác định"};
const DEMO_REPORT = {
  schema:"fixit-commander-diagnostics",schemaVersion:1,generatedAt:"2026-11-13T09:00:00.000Z",
  modules:["system","network","windows","printer"],
  system:{osCaption:"Windows 11 Pro (mẫu)",osVersion:"10.0",cpuName:"Intel Core i5 (mẫu)",ramGB:16,uptimeHours:34,
    disks:[{drive:"C:",totalGB:256,freeGB:24,freePct:9.4},{drive:"D:",totalGB:512,freeGB:260,freePct:50.8}]},
  network:{adapters:[{name:"Ethernet (mẫu)",ipv4Configured:true,dhcpEnabled:true,hasGateway:true,hasDns:true}]},
  windows:{services:[{name:"Dnscache",status:"Running",startType:"Automatic"},
    {name:"Dhcp",status:"Running",startType:"Automatic"},
    {name:"EventLog",status:"Running",startType:"Automatic"},
    {name:"Spooler",status:"Stopped",startType:"Manual"}],
    systemErrorCountSampled:2,systemErrorSampleLimit:20},
  printer:{spoolerStatus:"Stopped",printerCount:1},errors:[],
};
function saveText(name:string, content:string, mime:string){
  const url=URL.createObjectURL(new Blob([content],{type:mime}));
  const a=document.createElement("a");a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
function Status({severity}:{severity:Severity}){
  return <span className={"status "+severity}><span className="status-dot"/>{LABELS[severity]}</span>;
}
function FindingItem({finding}:{finding:Finding}){
  const Icon=finding.severity==="ok"?CheckCircle2:finding.severity==="unknown"?CircleHelp:AlertCircle;
  return <article className="finding"><div className={"finding-icon "+finding.severity}><Icon size={18}/></div>
    <div className="finding-body"><div className="finding-main"><strong>{finding.title}</strong><Status severity={finding.severity}/></div>
      <p>{finding.evidence}</p><small>{finding.category} <span className="dot-divide">·</span> {finding.advice}</small></div>
  </article>;
}
export default function App(){
  const [page,setPage]=useState<Page>("overview");
  const [mobileNav,setMobileNav]=useState(false);
  const [modules,setModules]=useState<ModuleId[]>(["system","network","windows"]);
  const [result,setResult]=useState<AnalyzedReport|null>(null);
  const [source,setSource]=useState<DataSource|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [copied,setCopied]=useState<string|null>(null);
  const [severity,setSeverity]=useState<Severity|"all">("all");
  const [search,setSearch]=useState("");
  const [approved,setApproved]=useState(false);
  const [selectedRecipe,setSelectedRecipe]=useState<string|null>(null);
  const picker=useRef<HTMLInputElement>(null);
  const script=useMemo(()=>buildDiagnosticScript(modules.length?modules:["system"]),[modules]);
  const currentRecipe=REPAIR_RECIPES.find((r)=>r.id===selectedRecipe);
  const navigate=(next:Page)=>{setPage(next);setMobileNav(false);setNotice(null);window.scrollTo({top:0,behavior:"smooth"});};
  const toggleModule=(value:ModuleId)=>{
    setModules((old)=>old.includes(value)?old.length>1?old.filter((v)=>v!==value):old:[...old,value]);
  };
  const copy=async(content:string,key:string)=>{
    try{await navigator.clipboard.writeText(content);setCopied(key);setNotice("Đã sao chép vào clipboard. Hãy đọc kỹ nội dung trước khi thực thi.");}
    catch{setNotice("Trình duyệt không cho phép sao chép tự động. Hãy chọn và sao chép nội dung trong khung lệnh.");}
  };
  const loadJson=async(file:File|undefined)=>{
    if(!file)return;
    try{
      if(file.size>512*1024)throw new Error("File vượt giới hạn 512 KB.");
      if(!file.name.toLowerCase().endsWith(".json"))throw new Error("Hãy chọn file FIXIT-Report-*.json.");
      const data=parseDiagnosticReport(await file.text());
      setResult(analyzeReport(data));setSource("import");setSeverity("all");setSearch("");
      setNotice("Đã phân tích file JSON cục bộ. Không tải file lên Vercel hoặc API.");
      navigate("analysis");
      setNotice("Đã nhập và phân tích báo cáo cục bộ, không gửi file lên server.");
    }catch(err){setNotice(err instanceof Error?err.message:"Không thể đọc báo cáo.");}
    finally{if(picker.current)picker.current.value="";}
  };
  const sample=()=>{
    setResult(analyzeReport(parseDiagnosticReport(JSON.stringify(DEMO_REPORT))));
    setSource("sample");setSearch("");setSeverity("all");navigate("analysis");
    setNotice("Đây là dữ liệu mẫu để thử giao diện, KHÔNG phải tình trạng máy tính của bạn.");
  };
  const findings=(result?.findings??[]).filter((f)=>
    (severity==="all"||f.severity===severity)&&
    (f.title+" "+f.evidence+" "+f.category).toLowerCase().includes(search.toLowerCase())
  );
  const openRepair=(id:string)=>{setSelectedRecipe(id);setApproved(false);setCopied(null);setNotice(null);};
  const closeRepair=()=>{setSelectedRecipe(null);setApproved(false);};
  const importButton=(className="primary")=><button className={"btn "+className} onClick={()=>picker.current?.click()}>
    <UploadCloud size={17}/> Nhập file JSON <ArrowRight size={16}/></button>;
  return <div className="layout">
    <input ref={picker} className="visually-hidden" type="file" accept=".json,application/json" onChange={(e)=>void loadJson(e.target.files?.[0])} aria-label="Chọn file FIXIT-Report JSON"/>
    <aside className={"sidebar "+(mobileNav?"is-open":"")}>
      <div className="identity"><div className="identity-logo"><Monitor size={21}/><span/></div>
        <div><strong>FIXIT <em>Commander</em></strong><small>IT SUPPORT / WEB EDITION</small></div>
        <button className="icon-btn mobile-close" aria-label="Đóng menu" onClick={()=>setMobileNav(false)}><X size={18}/></button></div>
      <div className="side-caption">WORKSPACE</div>
      <nav aria-label="Điều hướng">{NAV.map(({id,label,icon:Icon})=>
        <button key={id} className={"nav-link "+(page===id?"active":"")} onClick={()=>navigate(id)}>
          <Icon size={18}/><span>{label}</span>{page===id&&<ChevronRight size={16} className="nav-arrow"/>}
        </button>)}</nav>
      <div className="side-bottom"><div className="privacy-side"><div className="privacy-icon"><ShieldCheck size={21}/></div>
        <strong>Private by design</strong><p>Phân tích ngay trong trình duyệt. Không có tài khoản, database hay upload tự động.</p></div>
        <div className="side-version"><span className="green-light"/> Web-only · v1.0.0</div></div>
    </aside>
    {mobileNav&&<button aria-label="Đóng menu" className="backdrop" onClick={()=>setMobileNav(false)}/>}
    <div className="workspace">
      <header className="topbar"><div className="topbar-left"><button className="icon-btn mobile-menu" aria-label="Mở menu" onClick={()=>setMobileNav(true)}><Menu size={20}/></button>
          <span>Workspace</span><ChevronRight size={14}/><strong>{NAV.find((p)=>p.id===page)?.label}</strong></div>
        <div className="topbar-right"><span className="private-flag"><LockKeyhole size={14}/> Local analysis</span><span className="web-flag"><span/> WEB · NO INSTALL</span></div>
      </header>
      <main className="main">
        <div className="web-notice"><ShieldCheck size={18}/><span><b>Chế độ Web + PowerShell thủ công.</b> Website không trực tiếp đọc hay sửa Windows. Bạn chủ động chạy lệnh và chọn file JSON để phân tích.</span></div>
        {notice&&<div className="flash" role="status"><CircleHelp size={17}/><span>{notice}</span><button onClick={()=>setNotice(null)} aria-label="Đóng thông báo"><X size={16}/></button></div>}
        {page==="overview"&&<>
          <div className="page-head"><div className="eyebrow"><span className="green-light"/> IT SUPPORT COMMAND CENTER</div>
            <h1>Sửa lỗi máy tính, <span>đơn giản hơn.</span></h1>
            <p>Thu thập thông tin Windows bằng lệnh PowerShell an toàn, phân tích kết quả ngay trên web và thực hiện thao tác đã xem xét.</p></div>
          <section className="hero"><div className="hero-content"><div className="hero-chip"><ShieldCheck size={15}/> KHÔNG CẦN CÀI ỨNG DỤNG</div>
            <h2>Chẩn đoán có bằng chứng.<br/>Sửa lỗi có kiểm soát.</h2>
            <p>Không remote agent, không tải phần mềm lạ, không chạy lệnh từ Internet. Bạn luôn là người quyết định.</p>
            <button className="btn hero-action" onClick={()=>navigate("script")}>Bắt đầu chẩn đoán <ArrowRight size={18}/></button></div>
            <div className="hero-visual"><div className="hero-ring r1"/><div className="hero-ring r2"/><div className="screen"><div className="screen-bar"><i/><i/><i/></div><div className="screen-line"/><div className="screen-line short"/><div className="screen-panel"><CheckCircle2 size={24}/><span>CHECK COMPLETE</span></div></div></div></section>
          <div className="metric-grid">{[
            {label:"Cần cài ứng dụng",value:"0",note:"Chỉ dùng trình duyệt & PowerShell",icon:Download},
            {label:"Module chẩn đoán",value:"04",note:"Hệ thống, mạng, Windows, máy in",icon:ScanSearch},
            {label:"Dữ liệu tải lên server",value:"0",note:"Phân tích JSON tại trình duyệt",icon:Shield},
            {label:"Lệnh thao tác thủ công",value:"04",note:"Chỉ chọn từ danh mục cố định",icon:Terminal},
          ].map((v)=><div className="metric" key={v.label}><div className="metric-icon"><v.icon size={20}/></div>
              <strong>{v.value}</strong><span>{v.label}</span><small>{v.note}</small></div>)}</div>
          <div className="section-heading"><div><h2>Quy trình làm việc</h2><p>Ba bước rõ ràng, luôn có sự kiểm soát của kỹ thuật viên</p></div><span>WORKFLOW / 01—03</span></div>
          <div className="workflow">
            <button className="workflow-card" onClick={()=>navigate("script")}><span className="step-number">01</span><div className="flow-icon"><Code2/></div><h3>Tạo lệnh chẩn đoán</h3>
              <p>Chọn module, xem trước nội dung và sao chép PowerShell chỉ đọc.</p><span className="card-link">Tạo lệnh <ArrowRight size={16}/></span></button>
            <button className="workflow-card" onClick={()=>navigate("guide")}><span className="step-number">02</span><div className="flow-icon"><Monitor/></div><h3>Chạy trên Windows</h3>
              <p>Chạy thủ công trong PowerShell. Báo cáo JSON lưu trên Desktop/Documents.</p><span className="card-link">Xem hướng dẫn <ArrowRight size={16}/></span></button>
            <button className="workflow-card" onClick={()=>navigate("analysis")}><span className="step-number">03</span><div className="flow-icon"><FileJson2/></div><h3>Nhập & phân tích</h3>
              <p>Chọn JSON để web đánh giá, phân loại lỗi và đưa hướng xử lý.</p><span className="card-link">Phân tích <ArrowRight size={16}/></span></button>
          </div>
          <div className="bottom-cta"><div><h3>Đã có file FIXIT-Report?</h3><p>Nhập báo cáo để xem các vấn đề và xuất biên bản.</p></div>{importButton()}</div>
        </>}
        {page==="script"&&<>
          <div className="page-heading"><div className="eyebrow">STEP 01 / PREPARE</div><h1>Tạo lệnh chẩn đoán</h1>
            <p>Chỉ chọn các phép đọc hệ thống cần thiết. Lệnh không tự chạy trên máy và không yêu cầu Administrator.</p></div>
          <div className="content-grid">
            <section className="panel"><div className="panel-title"><div><h2>Chọn khu vực cần kiểm tra</h2><p>{modules.length}/4 module đang được chọn</p></div><span className="count-chip">{modules.length} MODULES</span></div>
              <div className="module-list">{MODULES.map((m)=>{
                const Icon=MOD_ICONS[m.id],checked=modules.includes(m.id);
                return <label className={"module-option "+(checked?"checked":"")} key={m.id}><div className="module-icon"><Icon size={21}/></div>
                  <span><strong>{m.title}</strong><small>{m.description}</small></span><input type="checkbox" checked={checked} onChange={()=>toggleModule(m.id)} aria-label={m.title}/>
                  <span className="fake-check">{checked&&<Check size={13}/>}</span></label>;
              })}</div>
              <div className="info-note"><LockKeyhole size={18}/><span>Script không đọc mật khẩu, tài khoản, nội dung file, tên tài liệu in hoặc địa chỉ IP cụ thể.</span></div>
            </section>
            <section className="panel script-panel"><div className="panel-title"><div><h2>PowerShell được tạo</h2><p>Script cố định · Chỉ đọc · Có thể kiểm tra trước</p></div><span className="safe-chip"><ShieldCheck size={13}/> READ ONLY</span></div>
              <div className="codebar"><span><i/><i/><i/> FIXIT-Diagnostics.ps1</span><span>Windows PowerShell 5.1+</span></div>
              <pre className="code-preview"><code>{script}</code></pre>
              <div className="code-actions"><button className="btn primary" onClick={()=>void copy(script,"script")}>{copied==="script"?<ClipboardCheck size={17}/>:<Clipboard size={17}/>} {copied==="script"?"Đã sao chép":"Sao chép toàn bộ"}</button>
                <button className="btn secondary" onClick={()=>saveText("FIXIT-Diagnostics.ps1",script,"text/plain;charset=utf-8")}><Download size={17}/> Tải file .ps1</button></div>
              <p className="under-code">Ưu tiên sao chép và dán vào PowerShell sau khi đọc lệnh. File .ps1 tải xuống có thể bị chính sách thực thi của doanh nghiệp chặn; không thay đổi chính sách để vượt qua giới hạn đó.</p>
            </section>
          </div>
          <div className="guide-row"><div><span className="step-number">02</span><strong>Sau khi chạy PowerShell</strong><p>Script lưu FIXIT-Report-*.json trên Desktop (hoặc Documents). Quay lại website để chọn file này.</p></div>{importButton()}</div>
        </>}
        {page==="analysis"&&<>
          <div className="page-heading with-action"><div><div className="eyebrow">STEP 03 / INVESTIGATE</div><h1>Phân tích kết quả</h1>
            <p>File JSON chỉ được xử lý trong bộ nhớ trình duyệt. Không có API nhận file hay tự động gửi dữ liệu.</p></div>{importButton()}</div>
          {!result?<section className="empty-import"><div className="empty-import-icon"><UploadCloud size={36}/></div><h2>Chưa có báo cáo chẩn đoán</h2>
            <p>Chạy script trong PowerShell rồi chọn file JSON được lưu tại Desktop hoặc Documents.</p>
            <div className="empty-actions">{importButton()}<button className="btn secondary" onClick={sample}><Gauge size={17}/> Xem dữ liệu mẫu</button></div>
            <div className="empty-info"><LockKeyhole size={16}/> Giới hạn 512 KB · JSON v1 · Đọc và phân tích hoàn toàn phía trình duyệt</div></section>
          : <>
            {source==="sample"&&<div className="sample-banner"><ShieldAlert size={19}/> Đây là báo cáo <b>MÔ PHỎNG</b>, không phải thông số máy tính của bạn. {importButton("secondary small")}</div>}
            <div className="report-top"><div><div className="eyebrow">SCAN REVIEW / {source==="sample"?"SAMPLE":"LOCAL IMPORT"}</div>
              <h2>Kết quả phân tích</h2><p>Được tạo: {new Date(result.report.generatedAt).toLocaleString("vi-VN")} · {result.report.modules.length} module</p></div>
              <button className="btn secondary" onClick={()=>saveText("FIXIT-Analysis.json",exportAnalysis(result),"application/json;charset=utf-8")}><Download size={16}/> Xuất báo cáo</button></div>
            <div className="result-metrics">{[
              {title:"Bình thường",value:result.counts.ok,key:"ok",icon:CheckCircle2},
              {title:"Cảnh báo",value:result.counts.warning,key:"warning",icon:AlertCircle},
              {title:"Cần chú ý",value:result.counts.critical,key:"critical",icon:ShieldAlert},
              {title:"Chưa xác định",value:result.counts.unknown,key:"unknown",icon:CircleHelp},
            ].map((m)=><div key={m.key} className={"result-metric "+m.key}><m.icon size={20}/><strong>{m.value}</strong><span>{m.title}</span></div>)}</div>
            <div className="panel"><div className="panel-title"><div><h2>Danh sách phát hiện</h2><p>{result.findings.length} điều kiện đã được đánh giá; không phải chứng nhận toàn bộ máy tính khỏe mạnh.</p></div>
              <span className="count-chip">{result.score===null?"UNKNOWN":result.score+"% PASS*"}</span></div>
              <div className="filters"><div className="search"><Search size={16}/><input aria-label="Tìm kiểm tra" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Tìm lỗi, dịch vụ, bằng chứng..."/></div>
                <select aria-label="Lọc trạng thái" value={severity} onChange={(e)=>setSeverity(e.target.value as Severity|"all")}>
                  <option value="all">Tất cả trạng thái</option>{(Object.keys(LABELS) as Severity[]).map((x)=><option key={x} value={x}>{LABELS[x]}</option>)}</select></div>
              <div className="findings">{findings.length?findings.map((f)=><FindingItem key={f.id} finding={f}/>):<div className="empty-list">Không có phát hiện phù hợp bộ lọc.</div>}</div>
              <p className="footnote">* Tỷ lệ vượt kiểm tra trên những phép đo đã biết; không biểu thị độ an toàn hoặc sức khỏe tổng thể của máy.</p>
            </div>
            <div className="bottom-cta"><div><h3>Muốn kiểm tra lại sau khi sửa?</h3><p>Chạy lại script để lấy một JSON mới, sau đó so sánh trạng thái thủ công.</p></div><button className="btn primary" onClick={()=>navigate("repairs")}>Mở thư viện sửa lỗi <ArrowRight size={16}/></button></div>
          </>}
        </>}
        {page==="repairs"&&<>
          <div className="page-heading"><div className="eyebrow">MANUAL REPAIR LIBRARY</div><h1>Thư viện sửa lỗi</h1>
            <p>Website chỉ cung cấp lệnh đã định nghĩa trước. Mỗi lệnh phải được bạn xem xét và đồng ý mới có thể sao chép.</p></div>
          <div className="caution"><ShieldAlert size={23}/><div><strong>Không có nút tự sửa Windows từ website</strong><p>Chỉ chạy trên thiết bị được phép quản trị. Nếu đang hỗ trợ từ xa, tránh thao tác gây mất kết nối. Không vượt quyền Administrator hoặc chính sách nội bộ.</p></div></div>
          <div className="repair-grid">{REPAIR_RECIPES.map((r)=><article className="repair-card" key={r.id}><div className="repair-head"><span className={"repair-symbol "+(r.kind==="Sửa lỗi"?"write":"")}><Wrench size={21}/></span><span className="risk">{r.risk}</span></div>
              <h3>{r.title}</h3><p>{r.description}</p><div className="repair-foot"><span>{r.kind}</span><button className="btn secondary small" onClick={()=>openRepair(r.id)}>Xem lệnh <ArrowRight size={16}/></button></div>
            </article>)}</div>
          <div className="info-note broad"><BookOpenCheck size={20}/><span>Chức năng cao rủi ro như SFC, RestoreHealth, reset network, sửa registry và khởi động lại dịch vụ không được thực thi tự động trong phiên bản web này.</span></div>
        </>}
        {page==="guide"&&<>
          <div className="page-heading"><div className="eyebrow">DOCUMENTATION / SECURITY</div><h1>Hướng dẫn sử dụng</h1><p>Không tải ứng dụng. Không cần đăng nhập. Giữ quyền kiểm soát và dữ liệu trên thiết bị của bạn.</p></div>
          <div className="guide-panel">
            {[
              {step:"01",title:"Chọn module & sao chép lệnh",desc:"Mở Tạo lệnh chẩn đoán, bật các module phù hợp, đọc toàn bộ nội dung PowerShell và chọn Sao chép toàn bộ."},
              {step:"02",title:"Mở Windows PowerShell",desc:"Trên máy cần kiểm tra, mở Windows PowerShell bằng quyền người dùng hiện tại. Dán nội dung đã kiểm tra và xác nhận trong terminal."},
              {step:"03",title:"Lấy file báo cáo trên Desktop",desc:"Khi hoàn thành, PowerShell hiển thị đường dẫn FIXIT-Report-*.json. Nếu Desktop không tồn tại, script lưu tại Documents."},
              {step:"04",title:"Nhập file vào trang web",desc:"Mở Phân tích kết quả, chọn file JSON. File được đọc bằng JavaScript trong trình duyệt, không gửi tới Vercel."},
              {step:"05",title:"Xem cảnh báo & thao tác thủ công",desc:"Đọc bằng chứng và gợi ý. Với các lệnh sửa trong Fix Center, xem trước, xác nhận và tự chạy trên Windows. Sau đó quét lại."},
            ].map((s)=><div className="guide-step" key={s.step}><span>{s.step}</span><div><h3>{s.title}</h3><p>{s.desc}</p></div></div>)}
          </div>
          <div className="security-grid"><div className="security-card"><ShieldCheck size={26}/><h3>Không upload dữ liệu</h3><p>Không có backend nhận file. Báo cáo chỉ tồn tại trong phiên hiện tại, không lưu localStorage theo mặc định.</p></div>
            <div className="security-card"><LockKeyhole size={26}/><h3>Không vượt quyền Windows</h3><p>Ứng dụng không thay đổi Execution Policy, không dùng lệnh chạy mã từ Internet và không tự yêu cầu Administrator.</p></div>
            <div className="security-card"><FileText size={26}/><h3>Báo cáo giới hạn dữ liệu</h3><p>Không thu hostname, IP cụ thể, tên tài khoản, mật khẩu, nội dung Event Log hoặc tên lệnh in. Vẫn nên xem JSON trước khi chia sẻ.</p></div></div>
          <div className="bottom-cta"><div><h3>Sẵn sàng chẩn đoán?</h3><p>Chọn chỉ các phần cần kiểm tra trên máy tính.</p></div><button className="btn primary" onClick={()=>navigate("script")}>Tạo lệnh PowerShell <ArrowRight size={17}/></button></div>
        </>}
        <footer className="footer"><span>FIXIT Commander · Web Edition v1.0.0</span><span><ShieldCheck size={14}/> Local-only JSON analysis · No account required</span></footer>
      </main>
    </div>
    {currentRecipe&&<div className="modal-backdrop" onMouseDown={(e)=>{if(e.currentTarget===e.target)closeRepair();}}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><div className="modal-icon"><Terminal size={25}/></div><button className="icon-btn" aria-label="Đóng" onClick={closeRepair}><X size={20}/></button></div>
        <div className="eyebrow">REVIEW BEFORE EXECUTION</div><h2 id="modal-title">{currentRecipe.title}</h2><p>{currentRecipe.description}</p>
        <div className="command-box"><div className="command-title"><span>WINDOWS POWERSHELL</span><span>Rủi ro: {currentRecipe.risk}</span></div><pre><code>{currentRecipe.command}</code></pre></div>
        <div className="caution mini"><ShieldAlert size={20}/><p>{currentRecipe.note}</p></div>
        <label className="consent"><input type="checkbox" checked={approved} onChange={(e)=>setApproved(e.target.checked)}/>
          <span>Tôi đã xem lệnh, hiểu tác động và được phép thao tác trên thiết bị này. Tôi tự chịu trách nhiệm chạy thủ công.</span></label>
        <div className="modal-actions"><button className="btn secondary" onClick={closeRepair}>Hủy</button><button className="btn primary" disabled={!approved} onClick={()=>void copy(currentRecipe.command,"repair")}>{copied==="repair"?<CheckCheck size={17}/>:<Clipboard size={17}/>} {copied==="repair"?"Đã sao chép":"Sao chép lệnh"}</button></div>
        <small className="modal-foot">Website KHÔNG thực hiện lệnh. Bạn chủ động dán và chạy lệnh trong PowerShell trên Windows.</small>
      </section>
    </div>}
  </div>;
}
