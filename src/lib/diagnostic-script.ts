export const MODULES = [
  { id: "system", title: "Máy tính & lưu trữ", description: "Windows, CPU, RAM, uptime và dung lượng ổ." },
  { id: "network", title: "Cấu hình mạng", description: "Adapter, IPv4, DHCP, DNS, Gateway; không thu IP." },
  { id: "windows", title: "Dịch vụ & nhật ký", description: "Trạng thái dịch vụ, mẫu số lỗi Event Log 24 giờ." },
  { id: "printer", title: "Máy in", description: "Print Spooler và số lượng máy in, không thu tên." },
] as const;
export type ModuleId = (typeof MODULES)[number]["id"];
const allowed = new Set<string>(MODULES.map((m) => m.id));

const header = String.raw`# FIXIT Commander - READ ONLY Windows diagnostics
# Review each command; use only on a device you own or are authorized to support.
# No elevation, system setting changes, external requests, account or password collection.
Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'
$report = [ordered]@{
  schema = 'fixit-commander-diagnostics'
  schemaVersion = 1
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  modules = @(__MODULES__)
  system = $null
  network = $null
  windows = $null
  printer = $null
  errors = @()
}
`;
const parts: Record<ModuleId,string> = {
system: String.raw`
# MODULE: system
try {
  $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
  $cpu = Get-CimInstance Win32_Processor -ErrorAction Stop | Select-Object -First 1
  $disks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' -ErrorAction Stop | ForEach-Object {
    $total = [double]$_.Size
    $free = [double]$_.FreeSpace
    [ordered]@{
      drive = [string]$_.DeviceID
      totalGB = [math]::Round($total / 1GB, 1)
      freeGB = [math]::Round($free / 1GB, 1)
      freePct = $(if ($total -gt 0) { [math]::Round(100 * $free / $total, 1) } else { $null })
    }
  })
  $report.system = [ordered]@{
    osCaption = [string]$os.Caption
    osVersion = [string]$os.Version
    cpuName = [string]$cpu.Name
    ramGB = [math]::Round([double]$os.TotalVisibleMemorySize / 1MB, 1)
    uptimeHours = $(if ($null -ne $os.LastBootUpTime) { [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalHours, 1) } else { $null })
    disks = $disks
  }
} catch {
  $report.errors += 'system: unavailable (CIM query failed)'
}
`,
network: String.raw`
# MODULE: network (configuration only: NO ping or outside network requests)
try {
  $adapters = @(Get-CimInstance Win32_NetworkAdapterConfiguration -Filter 'IPEnabled=True' -ErrorAction Stop | ForEach-Object {
    $ip = @($_.IPAddress | Where-Object { $_ -match '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' })
    $gw = @($_.DefaultIPGateway | Where-Object { $_ -ne $null -and $_ -ne '' })
    $dns = @($_.DNSServerSearchOrder | Where-Object { $_ -ne $null -and $_ -ne '' })
    [ordered]@{
      name = [string]$_.Description
      ipv4Configured = ($ip.Count -gt 0)
      dhcpEnabled = [bool]$_.DHCPEnabled
      hasGateway = ($gw.Count -gt 0)
      hasDns = ($dns.Count -gt 0)
    }
  })
  $report.network = [ordered]@{ adapters = $adapters }
} catch {
  $report.errors += 'network: unavailable (adapter query failed)'
}
`,
windows: String.raw`
# MODULE: windows (service states and limited event counts, NEVER event messages)
try {
  $services = @(@('Dnscache','Dhcp','EventLog','Spooler') | ForEach-Object {
    $name = $_
    try {
      $svc = Get-Service -Name $name -ErrorAction Stop
      [ordered]@{ name = $name; status = [string]$svc.Status; startType = [string]$svc.StartType }
    } catch {
      [ordered]@{ name = $name; status = 'Unknown'; startType = 'Unknown' }
    }
  })
  $countSampled = $null
  try {
    $events = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Level = 2; StartTime = (Get-Date).AddHours(-24) } -MaxEvents 20 -ErrorAction Stop)
    $countSampled = $events.Count
  } catch {
    if ($_.FullyQualifiedErrorId -match 'NoMatchingEventsFound') { $countSampled = 0 }
  }
  $report.windows = [ordered]@{
    services = $services
    systemErrorCountSampled = $countSampled
    systemErrorSampleLimit = 20
  }
} catch {
  $report.errors += 'windows: unavailable (service query failed)'
}
`,
printer: String.raw`
# MODULE: printer (NO print job titles, printer names or document data)
try {
  $spooler = Get-Service -Name Spooler -ErrorAction Stop
  $printerCount = $null
  try { $printerCount = @(Get-Printer -ErrorAction Stop).Count }
  catch { $report.errors += 'printer: number of printers unavailable' }
  $report.printer = [ordered]@{
    spoolerStatus = [string]$spooler.Status
    printerCount = $printerCount
  }
} catch {
  $report.errors += 'printer: unavailable (spooler query failed)'
}
`,
};
const footer = String.raw`
# Output is local. NOTHING is transmitted to a website or API by this script.
$dest = [Environment]::GetFolderPath('Desktop')
if ([string]::IsNullOrWhiteSpace($dest) -or -not (Test-Path -LiteralPath $dest -PathType Container)) {
  $dest = [Environment]::GetFolderPath('MyDocuments')
}
if ([string]::IsNullOrWhiteSpace($dest) -or -not (Test-Path -LiteralPath $dest -PathType Container)) {
  throw 'FIXIT: Desktop/Documents not found. No file saved.'
}
$fileName = 'FIXIT-Report-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json'
$path = Join-Path -Path $dest -ChildPath $fileName
$json = ConvertTo-Json -InputObject $report -Depth 8 -Compress
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ('FIXIT: Report saved locally at ' + $path) -ForegroundColor Green
Write-Host 'Open fixit-commander.vercel.app and select this local JSON file.'
`;
export function buildDiagnosticScript(selected: readonly ModuleId[]): string {
  if (!selected.length || selected.some((m) => !allowed.has(m))) {
    throw new Error("Chọn ít nhất một module hợp lệ.");
  }
  const unique = [...new Set(selected)];
  return header.replace("__MODULES__", unique.map((id) => "'" + id + "'").join(", ")) +
    unique.map((m) => parts[m]).join("\n") + footer;
}
export const REPAIR_RECIPES = [
  { id: "flush-dns", title: "Xóa DNS cache", risk: "Thấp", kind: "Sửa lỗi",
    command: "ipconfig /flushdns",
    description: "Xóa DNS cache cục bộ. Không thay đổi IP, DNS server hoặc firewall.",
    note: "Mã thoát thành công không có nghĩa toàn bộ lỗi mạng đã được giải quyết." },
  { id: "dism-check", title: "Kiểm tra Windows Component Store", risk: "Trung bình", kind: "Chẩn đoán",
    command: "DISM.exe /Online /Cleanup-Image /CheckHealth",
    description: "Kiểm tra DISM; không dùng RestoreHealth, không tự sửa file hệ thống.",
    note: "Có thể cần Administrator hợp lệ. Không vượt qua UAC hay chính sách công ty." },
  { id: "dns-config", title: "Xem DNS hiện tại", risk: "Chỉ đọc", kind: "Chẩn đoán",
    command: "Get-DnsClientServerAddress -AddressFamily IPv4 | Format-Table InterfaceAlias, ServerAddresses -AutoSize",
    description: "Hiển thị máy chủ DNS trực tiếp trên Windows; không gửi dữ liệu này lên web.",
    note: "Địa chỉ DNS có thể là thông tin nội bộ; hạn chế chia sẻ kết quả." },
  { id: "spooler-check", title: "Kiểm tra Print Spooler", risk: "Chỉ đọc", kind: "Chẩn đoán",
    command: "Get-Service -Name Spooler | Format-List Name, Status, StartType",
    description: "Kiểm tra trạng thái dịch vụ in, không tự restart và không xóa hàng đợi.",
    note: "Nếu Spooler đang dừng, hãy kiểm tra chính sách trước khi thao tác." },
] as const;
