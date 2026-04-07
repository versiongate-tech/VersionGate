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
  basePort: number;
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

export interface SetupStatus {
  configured: boolean;
  dbConnected: boolean;
  /** True when `.env` exists but this process has not loaded DATABASE_URL — restart the API. */
  needsRestart: boolean;
}

export function getSetupStatus(): Promise<SetupStatus> {
  return request("GET", "/setup/status");
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
