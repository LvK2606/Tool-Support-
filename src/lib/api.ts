import { invoke } from "@tauri-apps/api/core";
import { demoScan } from "./demo";
import type { HistoryItem, RecipePreview, RepairOutcome, ScanResult } from "./types";

export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function scanDevice(): Promise<ScanResult> {
  if (!isDesktop) return demoScan();
  return invoke<ScanResult>("run_diagnostics");
}

export async function loadHistory(): Promise<HistoryItem[]> {
  if (!isDesktop) return [];
  return invoke<HistoryItem[]>("list_history");
}

export async function previewFix(recipeId: string): Promise<RecipePreview> {
  if (!isDesktop) return {
    token: "web-demo", id: recipeId,
    title: recipeId === "NET_FLUSH_DNS" ? "Xóa cache DNS" : "Kiểm tra DISM Component Store",
    risk: recipeId === "NET_FLUSH_DNS" ? "low" : "medium",
    impact: "Trang web chỉ mô phỏng; không có quyền sửa máy tính.",
    elevated: recipeId === "WIN_DISM_CHECK", expiresInSeconds: 120,
  };
  return invoke<RecipePreview>("preview_recipe", { recipeId });
}

export async function executeFix(token: string): Promise<RepairOutcome> {
  if (!isDesktop) throw Error("Trình duyệt không thể thực hiện thao tác Windows. Hãy dùng ứng dụng .exe.");
  return invoke<RepairOutcome>("execute_recipe", { token, approved: true });
}
