const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "/api/v1";

export class ApiError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const data = await parseJsonSafe(res);
    const msg =
      typeof data === "object" && data !== null && "message" in data
        ? String((data as { message?: unknown }).message)
        : `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, data);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type DeploymentStatus =
  | "PENDING"
  | "DEPLOYING"
  | "ACTIVE"
  | "FAILED"
  | "ROLLED_BACK";

export interface Project {
  id: string;
  name: string;
  repoUrl: string;
  branch: string;
  localPath: string;
  buildContext: string;
  appPort: number;
  healthPath: string;
  basePort: number;
  webhookSecret?: string | null;
  env: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface Deployment {
  id: string;
  version: number;
  imageTag: string;
  containerName: string;
  port: number;
  color: string;
  status: DeploymentStatus;
  errorMessage?: string | null;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobRecord {
  id: string;
  type: string;
  status: string;
  projectId: string;
  deploymentId: string | null;
  payload: unknown;
  result: unknown;
  logs: string[];
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present on `GET /jobs` list */
  project?: { id: string; name: string };
}

export interface ServerStats {
  status: string;
  cpu_percent: number;
  memory_percent: number;
  memory_used: number;
  memory_total: number;
  disk_percent: number;
  disk_used: number;
  disk_total: number;
  network_sent: number;
  network_recv: number;
  uptime: number;
  load_avg: [number, number, number];
  process_count: number;
  timestamp: string;
}

export function getProjects(): Promise<{ projects: Project[] }> {
  return request("GET", "/projects");
}

export function getProject(id: string): Promise<{ project: Project }> {
  return request("GET", `/projects/${id}`);
}

export function createProject(data: {
  name: string;
  repoUrl: string;
  branch?: string;
  buildContext?: string;
  appPort: number;
  healthPath?: string;
  env?: Record<string, string>;
}): Promise<{ project: Project }> {
  return request("POST", "/projects", data);
}

export function deleteProject(id: string): Promise<void> {
  return request("DELETE", `/projects/${id}`);
}

export function triggerDeploy(projectId: string): Promise<{ jobId: string; status: string }> {
  return request("POST", "/deploy", { projectId });
}

export function rollback(projectId: string): Promise<{ jobId: string; status: string }> {
  return request("POST", `/projects/${projectId}/rollback`);
}

export function getDeployments(projectId: string): Promise<{ deployments: Deployment[] }> {
  return request("GET", `/projects/${projectId}/deployments`);
}

export function getAllDeployments(): Promise<{ deployments: Deployment[] }> {
  return request("GET", "/deployments");
}

export function getServerStats(): Promise<ServerStats> {
  return request("GET", "/server/stats");
}

export type PreflightSeverity = "required" | "recommended" | "informational";

export interface PreflightCheck {
  id: string;
  label: string;
  severity: PreflightSeverity;
  ok: boolean;
  message: string;
  detail?: string;
}

export interface PreflightReport {
  ok: boolean;
  checkedAt: string;
  checks: PreflightCheck[];
}

export function getPreflight(): Promise<PreflightReport> {
  return request("GET", "/system/preflight");
}

export interface DashboardAlert {
  type: string;
  message: string;
  severity: "low" | "medium" | "high";
}

export interface SystemDashboardResponse {
  status: string;
  system_stats: ServerStats;
  connections: { local_address: string; remote_address: string; state: string }[];
  listening_ports: { address: string; port: number }[];
  top_processes: { pid: number; name: string; cpu_percent: number; memory_percent: number }[];
  alerts: DashboardAlert[];
}

export function getServerDashboard(): Promise<SystemDashboardResponse> {
  return request("GET", "/system/server-dashboard");
}

export interface SetupStatus {
  configured: boolean;
  dbConnected: boolean;
  /** True when `.env` exists but this process has not loaded DATABASE_URL — restart the API. */
  needsRestart: boolean;
}

export function getSetupStatus(): Promise<SetupStatus> {
  return request("GET", "/setup/status");
}

export interface InstanceSettings {
  engineVersion: string;
  nodeEnv: string;
  apiPort: number;
  dockerNetwork: string;
  projectsRootPath: string;
  nginxConfigPath: string;
  prismaSchemaSync: "migrate" | "push";
  databaseUrlInEnvFile: boolean;
  databaseUrlLoaded: boolean;
  databaseReachable: boolean;
  needsRestart: boolean;
  encryptionKeyConfigured: boolean;
  geminiConfigured: boolean;
}

export function getInstanceSettings(): Promise<InstanceSettings> {
  return request("GET", "/settings/instance");
}

export function patchInstanceEnv(env: Record<string, string>): Promise<{
  message: string;
  keysWritten: string[];
}> {
  return request("PATCH", "/settings/env", { env });
}

export function applySetup(body: {
  domain: string;
  databaseUrl: string;
  geminiApiKey?: string;
}): Promise<{ configured: boolean }> {
  return request("POST", "/setup/apply", body);
}

export function getJobStatus(jobId: string): Promise<{ job: JobRecord }> {
  return request("GET", `/jobs/${jobId}`);
}

export function listProjectJobs(
  projectId: string,
  opts?: { limit?: number; offset?: number }
): Promise<{ jobs: JobRecord[]; total: number; limit: number; offset: number }> {
  const q = new URLSearchParams();
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  if (opts?.offset != null) q.set("offset", String(opts.offset));
  const qs = q.toString();
  return request("GET", `/projects/${projectId}/jobs${qs ? `?${qs}` : ""}`);
}

/** All deploy/rollback jobs across projects (newest first). */
export function listAllJobs(opts?: { limit?: number; offset?: number }): Promise<{
  jobs: JobRecord[];
  total: number;
  limit: number;
  offset: number;
}> {
  const q = new URLSearchParams();
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  if (opts?.offset != null) q.set("offset", String(opts.offset));
  const qs = q.toString();
  return request("GET", `/jobs${qs ? `?${qs}` : ""}`);
}

export function createWebSocket(jobId: string): WebSocket {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (envUrl && /^https?:\/\//i.test(envUrl)) {
    const u = new URL(envUrl);
    const wsProto = u.protocol === "https:" ? "wss:" : "ws:";
    return new WebSocket(`${wsProto}//${u.host}/api/v1/logs/${jobId}`);
  }
  if (typeof window !== "undefined") {
    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return new WebSocket(`${wsProto}//${window.location.host}/api/v1/logs/${jobId}`);
  }
  return new WebSocket(`ws://localhost:9090/api/v1/logs/${jobId}`);
}
