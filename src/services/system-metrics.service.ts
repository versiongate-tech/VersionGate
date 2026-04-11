import { readFileSync } from "fs";
import os from "os";
import { execFileAsync } from "../utils/exec";
import { logger } from "../utils/logger";

export interface SystemStats {
  status: "ok";
  cpu_percent: number;
  memory_percent: number;
  memory_used: number;
  memory_total: number;
  disk_percent: number;
  disk_used: number;
  disk_total: number;
  network_sent: number;
  network_recv: number;
  network_sent_rate: number; // bytes/sec since last sample
  network_recv_rate: number; // bytes/sec since last sample
  uptime: number;
  load_avg: [number, number, number];
  process_count: number;
  timestamp: string;
}

export interface Connection {
  local_address: string;
  remote_address: string;
  state: string;
}

/** TCP ports in LISTEN state (from `ss -tln` on Linux). */
export interface ListeningPort {
  address: string;
  port: number;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_percent: number;
}

export interface SystemDashboard {
  status: "ok";
  system_stats: SystemStats;
  connections: Connection[];
  listening_ports: ListeningPort[];
  top_processes: ProcessInfo[];
  alerts: Alert[];
}

export interface Alert {
  type: string;
  message: string;
  severity: "low" | "medium" | "high";
}

// ── /proc/stat CPU sample ─────────────────────────────────────────────────────

interface CpuSample {
  total: number;
  idle: number;
}

function readCpuSample(): CpuSample {
  const line = readFileSync("/proc/stat", "utf8").split("\n")[0];
  // cpu  user nice system idle iowait irq softirq steal guest guest_nice
  const parts = line.replace(/^cpu\s+/, "").split(/\s+/).map(Number);
  const idle  = parts[3] + (parts[4] ?? 0); // idle + iowait
  const total = parts.reduce((s, v) => s + v, 0);
  return { total, idle };
}

function calcCpuPercent(a: CpuSample, b: CpuSample): number {
  const dTotal = b.total - a.total;
  const dIdle  = b.idle  - a.idle;
  if (dTotal === 0) return 0;
  return Math.max(0, Math.min(100, ((dTotal - dIdle) / dTotal) * 100));
}

// ── /proc/meminfo ─────────────────────────────────────────────────────────────

interface MemInfo {
  total: number;
  available: number;
  used: number;
  percent: number;
}

function readMemInfo(): MemInfo {
  const text = readFileSync("/proc/meminfo", "utf8");
  const get  = (key: string) => {
    const m = text.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"));
    return m ? parseInt(m[1], 10) * 1024 : 0; // kB → bytes
  };
  const total     = get("MemTotal");
  const available = get("MemAvailable");
  const used      = total - available;
  const percent   = total > 0 ? (used / total) * 100 : 0;
  return { total, available, used, percent };
}

// ── /proc/net/dev ─────────────────────────────────────────────────────────────

interface NetIO {
  recv: number;
  sent: number;
}

function readNetIO(): NetIO {
  const text = readFileSync("/proc/net/dev", "utf8");
  let recv = 0, sent = 0;
  for (const line of text.split("\n").slice(2)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 10) continue;
    const iface = parts[0].replace(":", "");
    if (iface === "lo") continue; // skip loopback
    recv += parseInt(parts[1], 10) || 0;
    sent += parseInt(parts[9], 10) || 0;
  }
  return { recv, sent };
}

// ── df for disk ───────────────────────────────────────────────────────────────

async function readDisk(): Promise<{ used: number; total: number; percent: number }> {
  try {
    const { stdout } = await execFileAsync("df", ["-B1", "--output=size,used,pcent", "/"]);
    const lines = stdout.trim().split("\n");
    const parts = lines[lines.length - 1].trim().split(/\s+/);
    const total   = parseInt(parts[0], 10) || 0;
    const used    = parseInt(parts[1], 10) || 0;
    const percent = parseFloat((parts[2] ?? "0").replace("%", "")) || 0;
    return { used, total, percent };
  } catch {
    return { used: 0, total: 0, percent: 0 };
  }
}

// ── ss for connections ────────────────────────────────────────────────────────

function parseListenLine(line: string): ListeningPort | null {
  const parts = line.trim().split(/\s+/);
  const listenIdx = parts.indexOf("LISTEN");
  if (listenIdx < 0) return null;
  // With Netid: tcp LISTEN 0 4096 0.0.0.0:9090 … — local is 4th after LISTEN
  // Without: LISTEN 0 4096 0.0.0.0:9090 … — local is 3rd after LISTEN
  const local = parts[listenIdx + 3] ?? "";
  const idx = local.lastIndexOf(":");
  if (idx < 0) return null;
  const addr = local.slice(0, idx);
  const port = parseInt(local.slice(idx + 1), 10);
  if (!Number.isFinite(port)) return null;
  return { address: addr.length > 0 ? addr : "*", port };
}

async function readListeningPorts(): Promise<ListeningPort[]> {
  try {
    const { stdout } = await execFileAsync("ss", ["-tln"]);
    const lines = stdout.trim().split("\n");
    const out: ListeningPort[] = [];
    for (const line of lines) {
      const p = parseListenLine(line);
      if (p) out.push(p);
    }
    out.sort((a, b) => a.port - b.port || a.address.localeCompare(b.address));
    return out;
  } catch {
    return [];
  }
}

async function readConnections(): Promise<Connection[]> {
  try {
    const { stdout } = await execFileAsync("ss", ["-tn", "state", "established"]);
    const lines = stdout.trim().split("\n").slice(1); // skip header
    return lines
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 4) return null;
        return {
          state:          "ESTABLISHED",
          local_address:  parts[2] ?? "",
          remote_address: parts[3] ?? "",
        };
      })
      .filter(Boolean) as Connection[];
  } catch {
    return [];
  }
}

// ── ps for top processes ──────────────────────────────────────────────────────

async function readTopProcesses(limit = 10): Promise<ProcessInfo[]> {
  try {
    const { stdout } = await execFileAsync("ps", [
      "--no-headers", "-eo", "pid,comm,%cpu,%mem", "--sort=-%cpu",
    ]);
    return stdout
      .trim()
      .split("\n")
      .slice(0, limit)
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        return {
          pid:            parseInt(parts[0], 10) || 0,
          name:           parts[1] ?? "",
          cpu_percent:    parseFloat(parts[2] ?? "0") || 0,
          memory_percent: parseFloat(parts[3] ?? "0") || 0,
        };
      });
  } catch {
    return [];
  }
}

// ── Process count ─────────────────────────────────────────────────────────────

async function readProcessCount(): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ps", ["--no-headers", "-e"]);
    return stdout.trim().split("\n").length;
  } catch {
    return 0;
  }
}

// ── Alert generation ──────────────────────────────────────────────────────────

function generateAlerts(stats: Omit<SystemStats, "status" | "timestamp">): Alert[] {
  const alerts: Alert[] = [];
  if (stats.cpu_percent >= 90)
    alerts.push({ type: "High CPU",    message: `CPU at ${stats.cpu_percent.toFixed(1)}%`,    severity: "high" });
  else if (stats.cpu_percent >= 70)
    alerts.push({ type: "Elevated CPU", message: `CPU at ${stats.cpu_percent.toFixed(1)}%`,   severity: "medium" });

  if (stats.memory_percent >= 90)
    alerts.push({ type: "High Memory",  message: `Memory at ${stats.memory_percent.toFixed(1)}%`, severity: "high" });
  else if (stats.memory_percent >= 80)
    alerts.push({ type: "Elevated Memory", message: `Memory at ${stats.memory_percent.toFixed(1)}%`, severity: "medium" });

  if (stats.disk_percent >= 90)
    alerts.push({ type: "Disk Critical", message: `Disk at ${stats.disk_percent.toFixed(1)}%`, severity: "high" });
  else if (stats.disk_percent >= 80)
    alerts.push({ type: "Disk Warning",  message: `Disk at ${stats.disk_percent.toFixed(1)}%`, severity: "medium" });

  return alerts;
}

// ── Service ───────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5_000;

export class SystemMetricsService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private cachedStats:     SystemStats     | null = null;
  private cachedDashboard: SystemDashboard | null = null;
  private prevCpu: CpuSample | null = null;
  private prevNet: { sent: number; recv: number; time: number } | null = null;

  start(): void {
    this.collect(); // first sample (CPU baseline — result discarded)
    setTimeout(() => {
      this.collect(); // second sample — now CPU% is meaningful
      this.timer = setInterval(() => this.collect(), POLL_INTERVAL_MS);
    }, 1000);
    logger.info({ intervalMs: POLL_INTERVAL_MS }, "SystemMetrics: started");
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info("SystemMetrics: stopped");
  }

  getStats(): SystemStats | null     { return this.cachedStats; }
  getDashboard(): SystemDashboard | null { return this.cachedDashboard; }

  private async collect(): Promise<void> {
    try {
      const cpuNow = readCpuSample();
      const cpuPct = this.prevCpu ? calcCpuPercent(this.prevCpu, cpuNow) : 0;
      this.prevCpu = cpuNow;

      const [mem, disk, connections, listeningPorts, processes, procCount] = await Promise.all([
        Promise.resolve(readMemInfo()),
        readDisk(),
        readConnections(),
        readListeningPorts(),
        readTopProcesses(),
        readProcessCount(),
      ]);

      const net     = readNetIO();
      const now     = Date.now();
      let sentRate = 0, recvRate = 0;
      if (this.prevNet) {
        const elapsed = (now - this.prevNet.time) / 1000;
        if (elapsed > 0) {
          sentRate = Math.max(0, (net.sent - this.prevNet.sent) / elapsed);
          recvRate = Math.max(0, (net.recv - this.prevNet.recv) / elapsed);
        }
      }
      this.prevNet = { sent: net.sent, recv: net.recv, time: now };

      const loadAvg = os.loadavg() as [number, number, number];

      const stats: SystemStats = {
        status:          "ok",
        cpu_percent:     parseFloat(cpuPct.toFixed(2)),
        memory_percent:  parseFloat(mem.percent.toFixed(2)),
        memory_used:     mem.used,
        memory_total:    mem.total,
        disk_percent:    disk.percent,
        disk_used:       disk.used,
        disk_total:      disk.total,
        network_sent:      net.sent,
        network_recv:      net.recv,
        network_sent_rate: Math.round(sentRate),
        network_recv_rate: Math.round(recvRate),
        uptime:          os.uptime(),
        load_avg:        [
          parseFloat(loadAvg[0].toFixed(2)),
          parseFloat(loadAvg[1].toFixed(2)),
          parseFloat(loadAvg[2].toFixed(2)),
        ],
        process_count:   procCount,
        timestamp:       new Date().toISOString(),
      };

      this.cachedStats = stats;
      this.cachedDashboard = {
        status:       "ok",
        system_stats: stats,
        connections,
        listening_ports: listeningPorts,
        top_processes: processes,
        alerts:       generateAlerts(stats),
      };
    } catch (err) {
      logger.warn({ err }, "SystemMetrics: collection error");
    }
  }
}
