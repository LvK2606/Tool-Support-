export type CheckStatus = "pass" | "warn" | "fail" | "unknown";
export type Section = "dashboard" | "diagnostics" | "fixes" | "history" | "reports" | "settings";
export interface Check {
  id: string;
  title: string;
  category: "system" | "network" | "windows";
  status: CheckStatus;
  evidence: string;
  recommendation: string;
}
export interface Snapshot {
  hostname?: string;
  os?: string;
  version?: string;
  cpu?: string;
  ramGB?: number;
  uptimeHours?: number;
  disks?: Array<{ name: string; freeGB: number; sizeGB: number; freePct: number }>;
  interfaces?: Array<{ name: string; dhcp: boolean; hasGateway: boolean; hasDns: boolean; hasIPv4: boolean }>;
  services?: Array<{ name: string; state: string; startType: string }>;
  collectedAt?: string;
}
export interface ScanResult {
  id: string;
  timestamp: string;
  snapshot: Snapshot;
  checks: Check[];
}
export interface HistoryItem {
  id: string;
  timestamp: string;
  kind: "scan" | "repair";
  status: string;
  summary: string;
}
export interface RecipePreview {
  token: string;
  id: string;
  title: string;
  risk: string;
  impact: string;
  elevated: boolean;
  expiresInSeconds: number;
}
export interface RepairOutcome {
  id: string;
  recipeId: string;
  state: string;
  detail: string;
  exitCode?: number;
}
