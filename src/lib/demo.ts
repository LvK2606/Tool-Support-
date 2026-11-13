import type { Check, ScanResult, Snapshot } from "./types";

const snapshot: Snapshot = {
  hostname: "FIXIT-DEMO-01",
  os: "Windows 11 Pro (mô phỏng)",
  version: "Demo 24H2",
  cpu: "Intel Core i5 (dữ liệu demo)",
  ramGB: 16,
  uptimeHours: 34.5,
  disks: [
    { name: "C:", freePct: 12.4, freeGB: 31, sizeGB: 250 },
    { name: "D:", freePct: 52.1, freeGB: 260, sizeGB: 500 },
  ],
  interfaces: [{ name: "Ethernet demo", dhcp: true, hasIPv4: true, hasGateway: true, hasDns: true }],
  services: [
    { name: "Dnscache", state: "Running", startType: "Automatic" },
    { name: "Dhcp", state: "Running", startType: "Automatic" },
    { name: "EventLog", state: "Running", startType: "Automatic" },
  ],
};
const checks: Check[] = [
  { id: "SYS_OS", category: "system", title: "Nhận diện hệ điều hành", status: "pass", evidence: "Windows 11 Pro — dữ liệu demo", recommendation: "Không cần hành động." },
  { id: "SYS_DISK_SPACE", category: "system", title: "Ổ C: sắp đầy", status: "warn", evidence: "12,4% dung lượng trống — mô phỏng", recommendation: "Kiểm tra tệp lớn trước khi xóa; không tự động xóa dữ liệu." },
  { id: "SYS_DISK_SPACE_D", category: "system", title: "Dung lượng ổ D:", status: "pass", evidence: "52,1% dung lượng trống — mô phỏng", recommendation: "Không cần hành động." },
  { id: "NET_DEFAULT_GATEWAY", category: "network", title: "Default gateway", status: "pass", evidence: "Adapter có gateway — dữ liệu demo", recommendation: "Không cần hành động." },
  { id: "NET_DNS_CONFIG", category: "network", title: "Cấu hình DNS", status: "pass", evidence: "Đã cấu hình DNS resolver — mô phỏng, chưa thử truy vấn", recommendation: "Chỉ thử phân giải DNS khi được cho phép." },
  { id: "NET_RESOLUTION", category: "network", title: "Khả năng phân giải Internet", status: "unknown", evidence: "Chưa chạy kiểm tra mạng ra ngoài.", recommendation: "Bật bài kiểm tra Internet thủ công ở phiên bản tiếp theo." },
  { id: "WIN_SERVICE_DNS", category: "windows", title: "Dịch vụ DNS Client", status: "pass", evidence: "Running — mô phỏng", recommendation: "Không cần hành động." },
  { id: "WIN_SERVICE_EVENT", category: "windows", title: "Dịch vụ Windows Event Log", status: "pass", evidence: "Running — mô phỏng", recommendation: "Không cần hành động." },
  { id: "WIN_REBOOT", category: "windows", title: "Khởi động lại đang chờ", status: "unknown", evidence: "Chưa triển khai detector trạng thái pending reboot.", recommendation: "Kiểm tra chính sách cập nhật trước khi khởi động lại." },
];
export function demoScan(): ScanResult {
  return {
    id: "demo-" + Date.now(),
    timestamp: new Date().toISOString(),
    snapshot: { ...snapshot, collectedAt: new Date().toISOString() },
    checks: checks.map((c) => ({ ...c })),
  };
}
export const initialDemo = demoScan();
