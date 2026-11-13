import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertCircle, ArrowRight, CheckCircle2, ChevronRight, CircleHelp, Clock3,
  Cpu, Database, Download, FileText, HardDrive, History, LayoutDashboard, LockKeyhole,
  Menu, Monitor, Network, RotateCw, ScanSearch, Search, Settings2, ShieldCheck,
  ShieldAlert, Stethoscope, Wifi, Wrench, X,
} from "lucide-react";
import type { Check, CheckStatus, HistoryItem, RecipePreview, ScanResult, Section } from "./lib/types";
import { demoScan, initialDemo } from "./lib/demo";
import { executeFix, isDesktop, loadHistory, previewFix, scanDevice } from "./lib/api";
import { createRedactedReport, downloadReport } from "./lib/report";

const pages: Array<{ id: Section; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { id: "diagnostics", label: "Chẩn đoán", icon: Stethoscope },
  { id: "fixes", label: "Fix Center", icon: Wrench },
  { id: "history", label: "Lịch sử", icon: History },
  { id: "reports", label: "Báo cáo", icon: FileText },
  { id: "settings", label: "Cài đặt", icon: Settings2 },
];
const recipes = [
  { id: "NET_FLUSH_DNS", title: "Xóa bộ nhớ đệm DNS", description: "Thực thi ipconfig /flushdns, không thay đổi DNS server, firewall hay địa chỉ IP.", risk: "low", tag: "Có thể thực hiện", enabled: true, icon: Network },
  { id: "WIN_DISM_CHECK", title: "Kiểm tra thành phần Windows", description: "Chạy DISM /Online /Cleanup-Image /CheckHealth (chỉ kiểm tra).", risk: "medium", tag: "Có thể thực hiện", enabled: true, icon: ShieldCheck },
  { id: "NET_RENEW_DHCP", title: "Gia hạn DHCP", description: "Chỉ hỗ trợ khi đã có kiểm tra adapter và bảo vệ phiên hỗ trợ từ xa.", risk: "medium", tag: "Roadmap V1.1", enabled: false, icon: Wifi },
  { id: "WIN_SFC", title: "SFC /scannow", description: "Cần kiểm soát quyền Administrator, thời gian chạy và xác minh sau sửa.", risk: "high", tag: "Roadmap V1.1", enabled: false, icon: HardDrive },
];
const labels: Record<CheckStatus, string> = {
  pass: "Bình thường", warn: "Cảnh báo", fail: "Lỗi", unknown: "Chưa xác định",
};
const categories: Record<string, string> = { system: "Hệ thống", network: "Mạng", windows: "Windows" };
function time(value: string): string {
  return new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}
function Pill({ status }: { status: CheckStatus }) {
  return <span className={"pill " + status}>{labels[status]}</span>;
}
function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="brand"><div className="brandmark"><Monitor size={21} strokeWidth={2.5}/><span className="branddot"/></div>{!compact && <div><strong>FIXIT <span>Commander</span></strong><small>IT SUPPORT WORKSTATION</small></div>}</div>;
}
function CheckRow({ item }: { item: Check }) {
  return <div className="check-row">
    <div className={"check-icon " + item.status}>{item.status === "pass" ? <CheckCircle2 size={19}/> : item.status === "unknown" ? <CircleHelp size={19}/> : <AlertCircle size={19}/>}</div>
    <div className="check-body"><strong>{item.title}</strong><p>{item.evidence}</p><small>{categories[item.category] ?? item.category} · {item.recommendation}</small></div>
    <Pill status={item.status}/>
  </div>;
}

export default function App() {
  const [page, setPage] = useState<Section>("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [scan, setScan] = useState<ScanResult | null>(isDesktop ? null : initialDemo);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<CheckStatus | "all">("all");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [preview, setPreview] = useState<RecipePreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    if (isDesktop) void loadHistory().then(setHistory).catch((error) => setMessage(String(error)));
  }, []);

  const checks = scan?.checks ?? [];
  const counts = {
    pass: checks.filter((c) => c.status === "pass").length,
    warn: checks.filter((c) => c.status === "warn").length,
    fail: checks.filter((c) => c.status === "fail").length,
    unknown: checks.filter((c) => c.status === "unknown").length,
  };
  const matches = useMemo(() => checks.filter((item) =>
    (filter === "all" || item.status === filter) &&
    (category === "all" || item.category === category) &&
    (item.title + " " + item.evidence).toLowerCase().includes(query.toLowerCase())
  ), [checks, filter, category, query]);
  const refreshHistory = async () => {
    if (isDesktop) setHistory(await loadHistory());
  };
  const runScan = async () => {
    setBusy(true); setMessage(null); setOutcome(null);
    try {
      const result = isDesktop ? await scanDevice() : demoScan();
      setScan(result);
      if (isDesktop) await refreshHistory();
      else setHistory((rows) => [{ id: result.id, timestamp: result.timestamp, kind: "scan", status: "demo", summary: "Quét dữ liệu mô phỏng — không truy cập Windows" }, ...rows]);
      setMessage(isDesktop ? "Đã thu thập dữ liệu Windows và lưu lịch sử cục bộ." : "Chỉ chạy dữ liệu mẫu trong trình duyệt. Không có máy nào được quét.");
    } catch (error) { setMessage("Không thể quét thiết bị: " + String(error)); }
    finally { setBusy(false); }
  };
  const openPreview = async (id: string) => {
    setMessage(null); setOutcome(null);
    try { setPreview(await previewFix(id)); }
    catch (error) { setMessage(String(error)); }
  };
  const applyFix = async () => {
    if (!preview) return;
    if (!isDesktop) {
      setHistory((rows) => [{
        id: "demo-repair-" + Date.now(), timestamp: new Date().toISOString(), kind: "repair", status: "demo",
        summary: "Mô phỏng " + preview.title + " — KHÔNG thực thi lệnh",
      }, ...rows]);
      setOutcome("Mô phỏng thành công trên giao diện. Không có lệnh Windows nào được chạy.");
      setPreview(null);
      return;
    }
    setBusy(true);
    try {
      const result = await executeFix(preview.token);
      setOutcome(result.detail + " · Trạng thái: " + result.state);
      await refreshHistory();
    } catch (error) { setOutcome("Thao tác thất bại: " + String(error)); }
    finally { setBusy(false); setPreview(null); }
  };
  const changePage = (value: Section) => { setPage(value); setMobileNav(false); setMessage(null); };
  const scanButton = <button className="button primary" disabled={busy} onClick={() => void runScan()}>
    {busy ? <RotateCw className="spin" size={17}/> : <ScanSearch size={17}/>}
    {busy ? "Đang xử lý..." : isDesktop ? "Quét máy tính" : "Chạy quét mô phỏng"}
  </button>;

  return <div className="shell">
    <aside className={"sidebar " + (mobileNav ? "visible" : "")}>
      <div className="sidebar-head"><Brand/><button className="close-mobile" aria-label="Đóng menu" onClick={() => setMobileNav(false)}><X size={19}/></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav aria-label="Điều hướng chính">{pages.map(({ id, label, icon: Icon }) =>
        <button key={id} className={"nav-item " + (page === id ? "selected" : "")} onClick={() => changePage(id)}>
          <Icon size={19}/><span>{label}</span>{page === id && <ChevronRight size={16} className="nav-chevron"/>}
        </button>)}</nav>
      <div className="sidebar-bottom">
        <div className="local-card"><ShieldCheck size={21}/><b>Local-first</b><p>Không tải log hoặc cấu hình thiết bị lên cloud.</p></div>
        <div className="sidebar-footer"><span className="live-dot"/> {isDesktop ? "Windows Desktop" : "Website Demo"} <span className="muted">· v0.1.0</span></div>
      </div>
    </aside>
    {mobileNav && <button aria-label="Đóng menu" className="mobile-backdrop" onClick={() => setMobileNav(false)}/>}
    <main className="main">
      <header className="topbar">
        <div className="header-left"><button className="mobile-menu" aria-label="Mở menu" onClick={() => setMobileNav(true)}><Menu size={21}/></button>
          <span className="breadcrumb">Workspace</span><ChevronRight size={15} className="dim"/><strong>{pages.find((p) => p.id === page)?.label}</strong></div>
        <div className="header-right"><span className="read-mode"><LockKeyhole size={14}/> Read-only mặc định</span>
          <span className={"mode-badge " + (!isDesktop ? "demo" : "")}>{isDesktop ? "DESKTOP • LOCAL" : "WEB • DEMO DATA"}</span></div>
      </header>
      <div className="content">
        {!isDesktop && <div className="demo-banner"><ShieldAlert size={18}/><div><strong>Chế độ demo trên trình duyệt.</strong> Tất cả thông số máy, cảnh báo và sửa lỗi đều là dữ liệu mô phỏng. Bản web không thể chẩn đoán hay sửa Windows.</div></div>}
        {message && <div className="feedback" role="status"><Activity size={17}/><span>{message}</span><button aria-label="Đóng thông báo" onClick={() => setMessage(null)}><X size={16}/></button></div>}
        {outcome && <div className="feedback" role="status"><ShieldCheck size={18}/><span>{outcome}</span><button aria-label="Đóng kết quả" onClick={() => setOutcome(null)}><X size={16}/></button></div>}

        {page === "dashboard" && <>
          <div className="heading"><div><div className="eyebrow"><span className="pulse"/> IT SUPPORT COMMAND CENTER</div><h1>Tổng quan hệ thống</h1><p>Chẩn đoán có bằng chứng. Sửa lỗi có xác nhận. Mọi dữ liệu được giữ cục bộ.</p></div>{scanButton}</div>
          <div className="hero"><div className="hero-copy"><div className="hero-tag"><ShieldCheck size={15}/> WORKSTATION STATUS</div>
              <h2>{scan ? "Thiết bị đã có kết quả chẩn đoán" : "Sẵn sàng quét thiết bị"}</h2>
              <p>{scan ? "Xem các chỉ số và cảnh báo. Mỗi thao tác sửa lỗi đều phải được phê duyệt riêng." : "Nhấn Quét máy tính để thu thập trạng thái hệ thống Windows của bạn."}</p>
              <button className="hero-link" onClick={() => changePage("diagnostics")}>Khám phá kết quả <ArrowRight size={17}/></button>
            </div><div className="hero-art"><div className="orbit a"/><div className="orbit b"/><div className="device-illustration"><Monitor size={87} strokeWidth={1.1}/><span className="status-bubble"><CheckCircle2 size={22}/></span></div></div>
          </div>
          <div className="metrics">
            {([{ key: "pass", value: counts.pass, label: "Kiểm tra tốt", icon: CheckCircle2 },
              { key: "warn", value: counts.warn, label: "Cảnh báo", icon: AlertCircle },
              { key: "unknown", value: counts.unknown, label: "Chưa xác định", icon: CircleHelp },
              { key: "all", value: checks.length, label: "Tổng kiểm tra", icon: ScanSearch }] as const).map((s) =>
              <div className="metric" key={s.key}><div className={"metric-icon " + s.key}><s.icon size={20}/></div><b>{s.value.toString().padStart(2, "0")}</b><span>{s.label}</span></div>)}
          </div>
          <div className="columns"><section className="panel"><div className="panel-title"><div><h3>Thiết bị hiện tại</h3><p>Thông tin hệ thống cơ bản</p></div><Monitor size={20}/></div>
            <div className="spec"><span>Hostname</span><strong>{scan?.snapshot.hostname ?? "Chưa thu thập"}</strong></div>
            <div className="spec"><span>Hệ điều hành</span><strong>{scan?.snapshot.os ?? "—"}</strong></div>
            <div className="spec"><span>Vi xử lý</span><strong>{scan?.snapshot.cpu ?? "—"}</strong></div>
            <div className="spec"><span>Bộ nhớ RAM</span><strong>{scan?.snapshot.ramGB != null ? scan.snapshot.ramGB + " GB" : "—"}</strong></div>
            <div className="spec"><span>Lần quét gần nhất</span><strong>{scan ? time(scan.timestamp) : "Chưa quét"}</strong></div>
          </section><section className="panel"><div className="panel-title"><div><h3>Điểm cần chú ý</h3><p>Kết quả được phân loại minh bạch</p></div><button className="text-link" onClick={() => changePage("diagnostics")}>Xem tất cả <ArrowRight size={15}/></button></div>
            {checks.filter((c) => c.status !== "pass").slice(0, 4).map((c, i) => <div className="alert-line" key={c.id + i}><div className={"alert-dot " + c.status}/><div><b>{c.title}</b><small>{c.evidence}</small></div><Pill status={c.status}/></div>)}
            {!checks.length && <div className="empty"><ScanSearch size={26}/><p>Chưa có kết quả. Hãy thực hiện quét.</p></div>}
            {!!checks.length && !checks.some((c) => c.status !== "pass") && <div className="empty">Chưa phát hiện cảnh báo trong các kiểm tra hiện có.</div>}
          </section></div>
          <div className="section-shortcuts"><button onClick={() => changePage("fixes")}><div className="shortcut-icon"><Wrench/></div><span><b>Fix Center</b><small>Các công cụ sửa lỗi được kiểm soát</small></span><ArrowRight size={19}/></button>
          <button onClick={() => changePage("reports")}><div className="shortcut-icon"><FileText/></div><span><b>Xuất báo cáo</b><small>JSON có ẩn thông tin nhận dạng</small></span><ArrowRight size={19}/></button></div>
        </>}

        {page === "diagnostics" && <>
          <div className="heading"><div><div className="eyebrow">DIAGNOSTIC CENTER</div><h1>Chẩn đoán chuyên sâu</h1><p>Kiểm tra trạng thái Windows, mạng và ổ đĩa. Không kết luận “khỏe mạnh” khi thiếu dữ liệu.</p></div>{scanButton}</div>
          <div className="metrics compact">{(["pass","warn","fail","unknown"] as const).map((status) => <div className="metric" key={status}><b>{counts[status]}</b><span>{labels[status]}</span></div>)}</div>
          <div className="panel"><div className="panel-title"><div><h3>Kết quả kiểm tra</h3><p>{checks.length} checks · {scan ? time(scan.timestamp) : "Chưa quét"}</p></div><ScanSearch size={20}/></div>
            <div className="filters"><div className="search-field"><Search size={17}/><input aria-label="Tìm kiểm tra" placeholder="Tìm theo tên hoặc bằng chứng..." value={query} onChange={(e) => setQuery(e.target.value)}/></div>
              <select aria-label="Phân loại" value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">Tất cả module</option><option value="system">Hệ thống</option><option value="network">Mạng</option><option value="windows">Windows</option></select>
              <select aria-label="Trạng thái" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Mọi trạng thái</option>{(["pass","warn","fail","unknown"] as const).map((s) => <option key={s} value={s}>{labels[s]}</option>)}</select></div>
            <div className="check-list">{matches.map((item, i) => <CheckRow key={item.id + i} item={item}/>)}
              {!matches.length && <div className="empty"><Search size={28}/><p>Không có dữ liệu phù hợp. {scan ? "Thử bộ lọc khác." : "Hãy quét thiết bị trước."}</p></div>}</div>
          </div>
        </>}

        {page === "fixes" && <>
          <div className="heading"><div><div className="eyebrow">SAFETY FIRST</div><h1>Fix Center</h1><p>Chỉ chạy recipe trong danh sách cho phép sau khi xác nhận. Không cho nhập lệnh tùy ý.</p></div><div className="protect-chip"><LockKeyhole size={17}/> Approval required</div></div>
          <div className="safety-note"><ShieldCheck size={24}/><div><strong>Mọi thao tác được kiểm soát</strong><p>Hai công cụ đầu được tích hợp trong ứng dụng Windows. Các tính năng còn lại chưa được triển khai. Mã thoát 0 không đồng nghĩa sự cố đã được khắc phục.</p></div></div>
          <div className="recipe-grid">{recipes.map((r) => <div key={r.id} className="recipe-card"><div className="recipe-top"><div className="recipe-icon"><r.icon size={22}/></div><span className={"risk " + r.risk}>{r.risk === "low" ? "RỦI RO THẤP" : r.risk === "medium" ? "RỦI RO VỪA" : "RỦI RO CAO"}</span></div><h3>{r.title}</h3><p>{r.description}</p><div className="recipe-foot"><span>{r.tag}</span><button className="button small" disabled={!r.enabled || busy} onClick={() => void openPreview(r.id)}>Xem trước <ArrowRight size={15}/></button></div></div>)}</div>
        </>}

        {page === "history" && <>
          <div className="heading"><div><div className="eyebrow">LOCAL AUDIT TRAIL</div><h1>Lịch sử hoạt động</h1><p>Lưu lượt quét và thao tác sửa trên SQLite cục bộ. Website chỉ có lịch sử phiên demo.</p></div><button className="button" onClick={() => void refreshHistory()}><RotateCw size={16}/> Tải lại</button></div>
          <div className="panel"><div className="panel-title"><div><h3>Nhật ký gần đây</h3><p>Tối đa 100 mục gần nhất</p></div><History size={20}/></div>
            {history.map((h) => <div className="timeline-row" key={h.id}><div className="timeline-icon">{h.kind === "scan" ? <ScanSearch size={17}/> : <Wrench size={17}/>}</div><div><strong>{h.kind === "scan" ? "Quét hệ thống" : "Thao tác Fix Center"}</strong><p>{h.summary}</p><small>{time(h.timestamp)} · {h.status}</small></div></div>)}
            {!history.length && <div className="empty"><History size={28}/><p>Chưa có hoạt động nào được lưu.</p></div>}
          </div>
        </>}

        {page === "reports" && <>
          <div className="heading"><div><div className="eyebrow">SERVICE REPORT</div><h1>Báo cáo kỹ thuật</h1><p>Xuất JSON mặc định che hostname và không gửi thông tin lên máy chủ.</p></div>
            <button className="button primary" disabled={!scan} onClick={() => scan && downloadReport(scan, isDesktop ? "desktop" : "demo")}><Download size={17}/> Tải báo cáo JSON</button></div>
          <div className="panel report-panel"><div className="report-top"><div className="report-icon"><FileText size={28}/></div><div><span className="eyebrow">FIXIT / SERVICE REPORT</span><h2>Biên bản chẩn đoán</h2><p>Chỉ bao gồm kết quả thu thập trong phiên hiện tại.</p></div></div>
            <div className="report-stats"><div><span>Mã phiên</span><strong>{scan?.id.slice(0, 22) ?? "—"}</strong></div><div><span>Số kiểm tra</span><strong>{checks.length}</strong></div><div><span>Cảnh báo</span><strong>{counts.warn + counts.fail}</strong></div><div><span>Chế độ</span><strong>{isDesktop ? "Windows local" : "Dữ liệu demo"}</strong></div></div>
            <h3>Nội dung xuất (JSON)</h3><pre className="json-preview">{scan ? JSON.stringify(createRedactedReport(scan, isDesktop ? "desktop" : "demo"), null, 2) : "Chưa có lượt quét nào để tạo báo cáo."}</pre>
            <p className="legal-line"><LockKeyhole size={16}/> Chế độ ẩn danh: hostname bị thay bằng [REDACTED]. Chỉ xuất dữ liệu sau khi người dùng nhấn nút.</p>
          </div>
        </>}

        {page === "settings" && <>
          <div className="heading"><div><div className="eyebrow">PREFERENCES</div><h1>Cài đặt và bảo mật</h1><p>MVP ưu tiên cấu hình tối thiểu, bảo mật rõ ràng và quyền ít nhất có thể.</p></div></div>
          <div className="panel settings-panel"><div className="panel-title"><div><h3>Chế độ vận hành</h3><p>Cấu hình an toàn hiện được cố định trong phiên bản MVP</p></div><Settings2 size={20}/></div>
            <div className="setting-row"><div className="setting-icon"><LockKeyhole size={21}/></div><div><strong>Read-only mặc định</strong><p>Chỉ có thể sửa sau khi xem tác động và xác nhận riêng</p></div><span className="setting-state">LUÔN BẬT</span></div>
            <div className="setting-row"><div className="setting-icon"><Database size={21}/></div><div><strong>Dữ liệu offline</strong><p>SQLite lưu trên máy; không kết nối cơ sở dữ liệu cloud</p></div><span className="setting-state">ĐÃ BẬT</span></div>
            <div className="setting-row"><div className="setting-icon"><ShieldCheck size={21}/></div><div><strong>Báo cáo ẩn danh</strong><p>Hostname được che mặc định khi xuất báo cáo</p></div><span className="setting-state">ĐÃ BẬT</span></div>
            <div className="setting-row"><div className="setting-icon"><Network size={21}/></div><div><strong>Kiểm tra Internet chủ động</strong><p>Chưa tự động kiểm tra kết nối ra ngoài hoặc tải dữ liệu lên cloud</p></div><span className="setting-state neutral">CHƯA CÓ</span></div>
          </div>
          <div className="about-card"><Cpu size={23}/><div><strong>FIXIT Commander v0.1.0</strong><p>Windows-first · Tauri 2 + React + Rust · Phát triển theo các giai đoạn, không tuyên bố hỗ trợ toàn bộ lỗi Windows.</p></div></div>
        </>}
        <footer className="footer"><span>© FIXIT Commander · Built for responsible IT support</span><span><Clock3 size={14}/> {scan ? "Scan " + time(scan.timestamp) : "Chưa quét thiết bị"}</span></footer>
      </div>
    </main>
    {preview && <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setPreview(null); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="preview-title"><div className="modal-heading"><div className="preview-icon"><ShieldAlert size={23}/></div><button aria-label="Đóng" disabled={busy} onClick={() => setPreview(null)}><X size={20}/></button></div>
        <div className="eyebrow">APPROVAL REQUIRED</div><h2 id="preview-title">{preview.title}</h2><p>Recipe ID: {preview.id} · Rủi ro: {preview.risk === "low" ? "thấp" : "trung bình"}</p>
        <div className="modal-warning"><strong>Tác động dự kiến</strong><p>{preview.impact}</p>{preview.elevated && <small>Có thể cần mở ứng dụng bằng Administrator. Không tự nâng quyền hoặc vượt UAC.</small>}</div>
        <label className="approval-label"><input type="checkbox" id="approval" key={preview.token} onChange={(e) => { const btn = document.getElementById("approve-submit") as HTMLButtonElement | null; if(btn) btn.disabled = !e.target.checked; }}/><span>Tôi hiểu tác động, đang sử dụng thiết bị mình được quyền quản trị và đồng ý thực hiện.</span></label>
        <div className="modal-actions"><button className="button" disabled={busy} onClick={() => setPreview(null)}>Hủy</button><button id="approve-submit" className="button primary" disabled onClick={() => void applyFix()}>{busy ? "Đang thực hiện..." : isDesktop ? "Đồng ý thực hiện" : "Mô phỏng (không sửa máy)"}</button></div>
      </div>
    </div>}
  </div>;
}
