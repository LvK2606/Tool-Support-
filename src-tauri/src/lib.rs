use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

#[cfg(target_os = "windows")]
use std::process::{Command, Stdio};
#[cfg(target_os = "windows")]
use wait_timeout::ChildExt;

#[derive(Default)]
struct AppState {
    previews: Mutex<HashMap<String, PendingApproval>>,
}

struct PendingApproval {
    recipe_id: String,
    expires_at: Instant,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Check {
    id: String,
    title: String,
    category: String,
    status: String,
    evidence: String,
    recommendation: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanResult {
    id: String,
    timestamp: String,
    snapshot: Value,
    checks: Vec<Check>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistoryItem {
    id: String,
    timestamp: String,
    kind: String,
    status: String,
    summary: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecipePreview {
    token: String,
    id: String,
    title: String,
    risk: String,
    impact: String,
    elevated: bool,
    expires_in_seconds: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepairOutcome {
    id: String,
    recipe_id: String,
    state: String,
    detail: String,
    exit_code: Option<i32>,
}

fn db(app: &AppHandle) -> Result<Connection, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let conn = Connection::open(dir.join("fixit.sqlite")).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS history (
           id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, kind TEXT NOT NULL,
           status TEXT NOT NULL, summary TEXT NOT NULL, payload_json TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_history_time ON history(timestamp DESC);",
    ).map_err(|e| e.to_string())?;
    Ok(conn)
}

fn log_history(app: &AppHandle, event: &HistoryItem, payload: &Value) -> Result<(), String> {
    db(app)?.execute(
        "INSERT INTO history(id,timestamp,kind,status,summary,payload_json) VALUES(?1,?2,?3,?4,?5,?6)",
        params![event.id, event.timestamp, event.kind, event.status, event.summary, payload.to_string()],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(target_os = "windows")]
const INVENTORY_SCRIPT: &str = r#"
$ErrorActionPreference='SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$drives = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object {
  [pscustomobject]@{
    name = $_.DeviceID
    sizeGB = [math]::Round($_.Size / 1GB, 1)
    freeGB = [math]::Round($_.FreeSpace / 1GB, 1)
    freePct = if ($_.Size -gt 0) { [math]::Round(100 * $_.FreeSpace / $_.Size, 1) } else { $null }
  }
})
$interfaces = @(Get-CimInstance Win32_NetworkAdapterConfiguration -Filter 'IPEnabled=True' | ForEach-Object {
  [pscustomobject]@{
    name = $_.Description
    dhcp = [bool]$_.DHCPEnabled
    hasIPv4 = [bool](@($_.IPAddress | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' }).Count)
    hasGateway = [bool](@($_.DefaultIPGateway | Where-Object { $_ -ne $null -and $_ -ne '' }).Count)
    hasDns = [bool](@($_.DNSServerSearchOrder | Where-Object { $_ -ne $null -and $_ -ne '' }).Count)
  }
})
$services = @(Get-Service -Name 'Dnscache','Dhcp','EventLog' | ForEach-Object {
  [pscustomobject]@{name=$_.Name; state=$_.Status.ToString(); startType=$_.StartType.ToString()}
})
[pscustomobject]@{
  hostname = $env:COMPUTERNAME
  os = $os.Caption
  version = $os.Version
  cpu = $cpu.Name
  ramGB = if($os){[math]::Round($os.TotalVisibleMemorySize / 1MB, 1)}else{$null}
  uptimeHours = if($os -and $os.LastBootUpTime){[math]::Round(((Get-Date) - $os.LastBootUpTime).TotalHours, 1)}else{$null}
  disks = $drives
  interfaces = $interfaces
  services = $services
  collectedAt = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json -Depth 6 -Compress
"#;

#[cfg(target_os = "windows")]
fn fixed_command(program: &str, args: &[&str], seconds: u64) -> Result<std::process::Output, String> {
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Không thể chạy tiến trình: {e}"))?;
    let status = child.wait_timeout(Duration::from_secs(seconds)).map_err(|e| e.to_string())?;
    if status.is_none() {
        let _ = child.kill();
        let _ = child.wait();
        return Err("Tiến trình đã vượt thời gian cho phép".into());
    }
    child.wait_with_output().map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn collect() -> Result<Value, String> {
    let output = fixed_command("powershell.exe",
        &["-NoProfile", "-NonInteractive", "-Command", INVENTORY_SCRIPT], 25)?;
    if !output.status.success() {
        return Err("Không thể đọc Windows CIM. Kiểm tra Windows Management Instrumentation.".into());
    }
    let stdout = String::from_utf8(output.stdout).map_err(|_| "PowerShell trả dữ liệu không phải UTF-8")?;
    serde_json::from_str::<Value>(stdout.trim()).map_err(|e| format!("Không thể phân tích dữ liệu Windows: {e}"))
}

#[cfg(not(target_os = "windows"))]
fn collect() -> Result<Value, String> {
    Err("Chẩn đoán thật hiện chỉ hỗ trợ Windows.".into())
}

fn check(id: &str, title: &str, category: &str, status: &str, evidence: String, recommendation: &str) -> Check {
    Check { id: id.into(), title: title.into(), category: category.into(), status: status.into(),
        evidence, recommendation: recommendation.into() }
}

fn evaluate(value: &Value) -> Vec<Check> {
    let mut result = Vec::new();
    let os = value["os"].as_str().unwrap_or("");
    result.push(check("SYS_OS", "Nhận diện Windows", "system",
        if os.is_empty() { "unknown" } else { "pass" },
        if os.is_empty() { "Không đọc được hệ điều hành.".into() } else { os.into() },
        "Kiểm tra quyền truy cập WMI nếu trạng thái không xác định."));

    let disks = value["disks"].as_array();
    match disks {
        Some(items) if !items.is_empty() => {
            for d in items {
                let name = d["name"].as_str().unwrap_or("?");
                let pct = d["freePct"].as_f64();
                let status = match pct { Some(p) if p < 15.0 => "warn", Some(_) => "pass", None => "unknown" };
                result.push(check("SYS_DISK_SPACE", &format!("Dung lượng ổ {name}"), "system",
                    status,
                    match pct {Some(p) => format!("Dung lượng trống: {p:.1}%"), None => "Không có số liệu dung lượng.".into()},
                    "Kiểm tra file lớn, chính sách lưu trữ trước khi xóa dữ liệu."));
            }
        }
        _ => result.push(check("SYS_DISK_SPACE", "Dung lượng ổ đĩa", "system", "unknown",
            "Không đọc được ổ đĩa.".into(), "Kiểm tra lại bằng Disk Management.")),
    }

    let interfaces = value["interfaces"].as_array();
    match interfaces {
        Some(interfaces) if !interfaces.is_empty() => {
            let has_gateway = interfaces.iter().any(|i| i["hasGateway"] == true);
            result.push(check("NET_DEFAULT_GATEWAY", "Default gateway", "network",
                if has_gateway {"pass"} else {"warn"},
                if has_gateway {"Ít nhất một adapter có gateway.".into()} else {"Không thấy gateway trên adapter IPEnabled.".into()},
                "Kiểm tra cấu hình mạng, VPN và mô hình mạng nội bộ trước khi kết luận."));
            result.push(check("NET_DNS_CONFIG", "Cấu hình DNS", "network",
                if interfaces.iter().any(|i| i["hasDns"] == true) {"pass"} else {"unknown"},
                "Đã đọc danh sách DNS resolver; chưa thử truy vấn ra Internet.".into(),
                "Chạy kiểm tra DNS có chủ đích khi được phép truy cập mạng."));
        }
        _ => result.push(check("NET_INTERFACES", "Kết nối mạng", "network", "unknown",
            "Không có adapter IPEnabled. Có thể máy đang offline.".into(),
            "Kiểm tra trạng thái Wi-Fi/Ethernet. Không tự động reset adapter.")),
    }

    let services = value["services"].as_array();
    match services {
        Some(items) if !items.is_empty() => {
            for s in items {
                let service_name = s["name"].as_str().unwrap_or("?");
                let state = s["state"].as_str().unwrap_or("Unknown");
                let start = s["startType"].as_str().unwrap_or("Unknown");
                let status = if state.eq_ignore_ascii_case("running") { "pass" }
                    else if start.eq_ignore_ascii_case("disabled") || start.eq_ignore_ascii_case("manual") { "unknown" }
                    else { "warn" };
                result.push(check("WIN_SERVICE", &format!("Windows service: {service_name}"), "windows",
                    status, format!("State={state}; StartType={start}"),
                    "Xem chính sách khởi động của dịch vụ trước khi thay đổi."));
            }
        }
        _ => result.push(check("WIN_SERVICES", "Dịch vụ Windows", "windows", "unknown",
            "Không đọc được trạng thái dịch vụ.".into(), "Kiểm tra quyền đọc dịch vụ.")),
    }
    result
}

#[tauri::command]
async fn collect_snapshot() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(collect).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn run_diagnostics(app: AppHandle) -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let snapshot = collect()?;
        let checks = evaluate(&snapshot);
        let scan = ScanResult {
            id: Uuid::new_v4().to_string(),
            timestamp: Utc::now().to_rfc3339(),
            snapshot,
            checks,
        };
        let warn = scan.checks.iter().filter(|c| c.status == "warn").count();
        let record = HistoryItem {
            id: scan.id.clone(),
            timestamp: scan.timestamp.clone(),
            kind: "scan".into(),
            status: if warn > 0 {"warn"} else {"pass"}.into(),
            summary: format!("{} kiểm tra, {} cảnh báo", scan.checks.len(), warn),
        };
        log_history(&app, &record, &serde_json::to_value(&scan).map_err(|e| e.to_string())?)?;
        Ok(scan)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn list_history(app: AppHandle) -> Result<Vec<HistoryItem>, String> {
    let conn = db(&app)?;
    let mut stmt = conn.prepare(
        "SELECT id,timestamp,kind,status,summary FROM history ORDER BY timestamp DESC LIMIT 100"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok(HistoryItem {
        id: row.get(0)?, timestamp: row.get(1)?, kind: row.get(2)?,
        status: row.get(3)?, summary: row.get(4)?,
    })).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn preview_recipe(recipe_id: String, state: State<'_, AppState>) -> Result<RecipePreview, String> {
    let (title, risk, impact, elevated) = match recipe_id.as_str() {
        "NET_FLUSH_DNS" => ("Xóa cache DNS", "low",
            "Xóa DNS resolver cache. Không thay đổi DNS server, IP hay firewall.", false),
        "WIN_DISM_CHECK" => ("Kiểm tra DISM Component Store", "medium",
            "Chạy DISM /CheckHealth chỉ để đọc trạng thái. Có thể cần Administrator.", true),
        _ => return Err("Recipe chưa được triển khai trong bản này.".into()),
    };
    let token = Uuid::new_v4().to_string();
    state.previews.lock().map_err(|_| "Approval lock unavailable")?.insert(
        token.clone(), PendingApproval {recipe_id: recipe_id.clone(), expires_at: Instant::now() + Duration::from_secs(120)}
    );
    Ok(RecipePreview {
        token, id: recipe_id, title: title.into(), risk: risk.into(), impact: impact.into(),
        elevated, expires_in_seconds: 120,
    })
}

#[cfg(target_os = "windows")]
fn apply_fixed_recipe(recipe_id: &str) -> Result<(Option<i32>, String), String> {
    let output = match recipe_id {
        "NET_FLUSH_DNS" => fixed_command("ipconfig.exe", &["/flushdns"], 12)?,
        "WIN_DISM_CHECK" => fixed_command("dism.exe", &["/Online", "/Cleanup-Image", "/CheckHealth"], 90)?,
        _ => return Err("Recipe không được phép.".into()),
    };
    let code = output.status.code();
    let detail = if output.status.success() {
        if recipe_id == "NET_FLUSH_DNS" {
            "Lệnh flushdns hoàn tất; không thể xác nhận nguyên nhân mạng đã hết nếu chưa kiểm tra DNS riêng.".to_string()
        } else {
            "DISM CheckHealth hoàn tất; cần kiểm tra kết quả chi tiết bằng công cụ hệ thống.".to_string()
        }
    } else {
        format!("Công cụ Windows trả mã {:?}. Có thể cần chạy ứng dụng với Administrator.", code)
    };
    Ok((code, detail))
}

#[cfg(not(target_os = "windows"))]
fn apply_fixed_recipe(_recipe_id: &str) -> Result<(Option<i32>, String), String> {
    Err("Không hỗ trợ sửa lỗi trên nền tảng này.".into())
}

#[tauri::command]
async fn execute_recipe(
    token: String, approved: bool, state: State<'_, AppState>, app: AppHandle,
) -> Result<RepairOutcome, String> {
    if !approved {return Err("Chưa có xác nhận người dùng.".into());}
    let entry = state.previews.lock().map_err(|_| "Approval lock unavailable")?
        .remove(&token).ok_or("Phiên xác nhận không hợp lệ hoặc đã sử dụng.")?;
    if entry.expires_at < Instant::now() {return Err("Phiên xác nhận đã hết hạn.".into());}
    tauri::async_runtime::spawn_blocking(move || {
        let id = Uuid::new_v4().to_string();
        let timestamp = Utc::now().to_rfc3339();
        let (exit_code, detail, status) = match apply_fixed_recipe(&entry.recipe_id) {
            Ok((code, message)) => (code, message, if code == Some(0) {"unverified"} else {"failed"}),
            Err(message) => (None, message, "failed"),
        };
        let outcome = RepairOutcome {
            id: id.clone(), recipe_id: entry.recipe_id.clone(), state: status.into(),
            detail: detail.clone(), exit_code,
        };
        let log = HistoryItem {
            id, timestamp, kind: "repair".into(), status: status.into(),
            summary: format!("{}: {}", entry.recipe_id, detail),
        };
        log_history(&app, &log, &json!({"recipeId":entry.recipe_id,"result":outcome.state,"exitCode":outcome.exit_code}))?;
        Ok(outcome)
    }).await.map_err(|e| e.to_string())?
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .setup(|app| {
            db(&app.handle()).map_err(std::io::Error::other)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            collect_snapshot, run_diagnostics, list_history, preview_recipe, execute_recipe
        ])
        .run(tauri::generate_context!())
        .expect("Unable to run FIXIT Commander");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_data_is_unknown_not_healthy() {
        let rows = evaluate(&json!({}));
        assert!(rows.iter().any(|row| row.status == "unknown"));
        assert!(!rows.iter().any(|row| row.id == "SYS_DISK_SPACE" && row.status == "pass"));
    }
    #[test]
    fn low_storage_is_warn() {
        let rows = evaluate(&json!({"os":"Windows 11","disks":[{"name":"C:","freePct":4.0}]}));
        assert!(rows.iter().any(|row| row.id == "SYS_DISK_SPACE" && row.status == "warn"));
    }
}
