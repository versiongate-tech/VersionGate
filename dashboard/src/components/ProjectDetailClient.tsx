"use client";
import { useEffect, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  api,
  type Project,
  type Deployment,
  type ContainerMetrics,
} from "@/lib/api";
import { StatusBadge, RunningDot } from "./StatusBadge";
import { ConfirmModal } from "./ConfirmModal";
import { MetricsChart, type MetricSample } from "./MetricsChart";
import { LogsViewer } from "./LogsViewer";

// ── Constants ─────────────────────────────────────────────────────────────────
const HEALTH_PATH_OPTIONS = [
  { value: "/health",     label: "Standard — /health" },
  { value: "/healthz",    label: "Kubernetes — /healthz" },
  { value: "/api/health", label: "API prefix — /api/health" },
  { value: "/status",     label: "Status — /status" },
  { value: "/ping",       label: "Ping — /ping" },
  { value: "/ready",      label: "Readiness — /ready" },
  { value: "/",           label: "Root — /" },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KiB", "MiB", "GiB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ProjectDetailClient() {
  const pathname = usePathname();
  const router = useRouter();
  const projectId = pathname.split("/").filter(Boolean)[1] ?? "";

  const [project, setProject] = useState<Project | null>(null);
  const [activeDeployment, setActiveDeployment] = useState<Deployment | null>(null);
  const [blueDeployment, setBlueDeployment] = useState<Deployment | null>(null);
  const [greenDeployment, setGreenDeployment] = useState<Deployment | null>(null);
  const [deploymentHistory, setDeploymentHistory] = useState<Deployment[]>([]);
  const [metrics, setMetrics] = useState<ContainerMetrics | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<MetricSample[]>([]);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logsUpdated, setLogsUpdated] = useState<Date | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployStep, setDeployStep] = useState(-1); // -1 = not visible; 0-4 = current step
  const [deployFailed, setDeployFailed] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // AI Pipeline generation
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineYaml, setPipelineYaml] = useState<string | null>(null);
  const [pipelineStep, setPipelineStep] = useState(0);
  const [pipelineModalOpen, setPipelineModalOpen] = useState(false);

  // Settings panel
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ branch: "", buildContext: "", appPort: "", healthPath: "", basePort: "" });
  const [buildContextDirs, setBuildContextDirs] = useState<string[]>([]);
  const [buildContextOpen, setBuildContextOpen] = useState(false);

  // Env editor
  const [envRows, setEnvRows] = useState<{ key: string; value: string }[]>([]);
  const [savingEnv, setSavingEnv] = useState(false);

  // ── Status ─────────────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const [{ project: p }, { deployments }] = await Promise.all([
        api.projects.get(projectId),
        api.deployments.list(),
      ]);
      setProject(p);

      // Seed settings form + env rows on first load (don't overwrite user edits)
      setSettingsForm((prev) =>
        prev.branch === ""
          ? { branch: p.branch, buildContext: p.buildContext ?? ".", appPort: String(p.appPort), healthPath: p.healthPath, basePort: String(p.basePort) }
          : prev
      );
      setEnvRows((prev) =>
        prev.length === 0
          ? Object.entries(p.env ?? {}).map(([key, value]) => ({ key, value }))
          : prev
      );

      const projectDeps = deployments
        .filter((d) => d.projectId === projectId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const active =
        projectDeps.find((d) => d.status === "ACTIVE") ??
        projectDeps.find((d) => d.status === "DEPLOYING") ??
        projectDeps[0] ??
        null;
      setActiveDeployment(active);

      // Track the latest deployment for each slot
      setBlueDeployment(projectDeps.find((d) => d.color === "BLUE") ?? null);
      setGreenDeployment(projectDeps.find((d) => d.color === "GREEN") ?? null);
      setDeploymentHistory(projectDeps.slice(0, 10));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("404") || msg.includes("not found")) {
        toast.error("Project not found");
        router.push("/");
      }
    } finally {
      setInitialLoading(false);
    }
  }, [projectId, router]);

  // ── Metrics ────────────────────────────────────────────────────────────────
  const fetchMetrics = useCallback(async () => {
    try {
      const m = await api.projects.metrics(projectId);
      setMetrics(m);
      if (m.running) {
        const sample: MetricSample = {
          time: new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          cpu: m.cpu,
          memoryPercent: m.memoryPercent,
          memoryMB: m.memoryUsed / (1024 * 1024),
          netInKB:  (m.netIn  ?? 0) / 1024,
          netOutKB: (m.netOut ?? 0) / 1024,
        };
        setMetricsHistory((prev) => [...prev, sample].slice(-60));
      }
    } catch {
      // keep last known state
    }
  }, [projectId]);

  // ── Logs ───────────────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const { lines } = await api.projects.logs(projectId);
      setLogLines(lines);
      setLogsUpdated(new Date());
    } catch {
      // ignore
    } finally {
      setLogsLoading(false);
    }
  }, [projectId]);

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId || projectId === "__placeholder__") return;
    fetchStatus();
    fetchMetrics();
    fetchLogs();
    const statusTimer  = setInterval(fetchStatus,  30_000);
    const metricsTimer = setInterval(fetchMetrics, 30_000);
    const logsTimer    = setInterval(fetchLogs,    15_000);
    return () => {
      clearInterval(statusTimer);
      clearInterval(metricsTimer);
      clearInterval(logsTimer);
    };
  }, [projectId, fetchStatus, fetchMetrics, fetchLogs]);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function handleDeploy() {
    setDeploying(true);
    setDeployStep(0);
    setDeployFailed(false);

    // Simulate step advancement while waiting for the API call
    // Steps: 0=Pulling, 1=Building, 2=Starting, 3=Health check, 4=Traffic switch
    const t1 = setTimeout(() => setDeployStep(1), 4_000);   // →Building
    const t2 = setTimeout(() => setDeployStep(2), 20_000);  // →Starting
    const t3 = setTimeout(() => setDeployStep(3), 24_000);  // →Health check

    const tid = toast.loading("Deploying...");
    try {
      const result = await api.deployments.deploy(projectId);
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      setDeployStep(4); // Traffic switch
      setTimeout(() => setDeployStep(5), 900); // mark all done
      toast.success(result.message, { id: tid });
      await fetchStatus();
    } catch (err) {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      setDeployFailed(true);
      toast.error(err instanceof Error ? err.message : "Deploy failed", { id: tid });
    } finally {
      setDeploying(false);
      // Keep panel visible for 3s after completion/failure, then hide
      setTimeout(() => {
        setDeployStep(-1);
        setDeployFailed(false);
      }, 3_000);
    }
  }

  async function handleCancelDeploy() {
    setCancelling(true);
    const tid = toast.loading("Stopping deployment...");
    try {
      await api.projects.cancelDeploy(projectId);
      toast.success("Deployment cancelled", { id: tid });
      setDeploying(false);
      setDeployStep(-1);
      setDeployFailed(false);
      await fetchStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed", { id: tid });
    } finally {
      setCancelling(false);
    }
  }

  async function handleRollback() {
    setRollbackOpen(false);
    setRollingBack(true);
    const tid = toast.loading("Rolling back...");
    try {
      const result = await api.projects.rollback(projectId);
      toast.success(result.message, { id: tid });
      await fetchStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rollback failed", { id: tid });
    } finally {
      setRollingBack(false);
    }
  }

  async function handleDelete() {
    setDeleteOpen(false);
    setDeleting(true);
    const tid = toast.loading("Deleting project...");
    try {
      await api.projects.delete(projectId);
      toast.success(`Project "${project?.name}" deleted`, { id: tid });
      router.push("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed", { id: tid });
      setDeleting(false);
    }
  }

  function handleRefresh() {
    fetchStatus();
    fetchMetrics();
    fetchLogs();
    toast.success("Refreshed", { duration: 1500 });
  }

  async function handleGeneratePipeline() {
    setPipelineLoading(true);
    setPipelineStep(0);
    const t1 = setTimeout(() => setPipelineStep(1), 900);
    const t2 = setTimeout(() => setPipelineStep(2), 1800);
    const t3 = setTimeout(() => setPipelineStep(3), 2600);
    await new Promise((r) => setTimeout(r, 3200));
    clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
    setPipelineLoading(false);
    setPipelineModalOpen(true);
  }

  // Fetch repo directory tree when settings panel opens
  useEffect(() => {
    if (!settingsOpen || !project?.repoUrl) return;
    const match = project.repoUrl.match(/github\.com\/([^/]+)\/([^/.\s]+?)(?:\.git)?(?:[\/?#].*)?$/);
    if (!match) return;
    const [, owner, repo] = match;
    const branch = settingsForm.branch || project.branch || "main";
    fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`)
      .then((res) => res.ok ? res.json() : null)
      .then((data: { tree: { path: string; type: string }[] } | null) => {
        if (!data) return;
        const dirs = data.tree.filter((item) => item.type === "tree").map((item) => item.path);
        setBuildContextDirs([".", ...dirs]);
      })
      .catch(() => {});
  }, [settingsOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveSettings() {
    setSavingSettings(true);
    const tid = toast.loading("Saving settings...");
    try {
      await api.projects.update(projectId, {
        branch: settingsForm.branch.trim() || undefined,
        buildContext: settingsForm.buildContext.trim() || undefined,
        appPort: settingsForm.appPort ? parseInt(settingsForm.appPort, 10) : undefined,
        healthPath: settingsForm.healthPath.trim() || undefined,
        basePort: settingsForm.basePort ? parseInt(settingsForm.basePort, 10) : undefined,
      });
      toast.success("Settings saved", { id: tid });
      await fetchStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed", { id: tid });
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSaveEnv() {
    setSavingEnv(true);
    const tid = toast.loading("Saving env vars...");
    try {
      const env: Record<string, string> = {};
      for (const row of envRows) {
        if (row.key.trim()) env[row.key.trim()] = row.value;
      }
      await api.projects.updateEnv(projectId, env);
      toast.success("Environment variables saved", { id: tid });
      await fetchStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed", { id: tid });
    } finally {
      setSavingEnv(false);
    }
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (initialLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-4 bg-zinc-800 rounded w-40" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl h-56" />
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl h-56" />
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl h-32" />
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl h-40" />
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl h-80" />
      </div>
    );
  }

  if (!project) return null;

  const isDeploying = activeDeployment?.status === "DEPLOYING";
  const containerRunning = metrics?.running ?? activeDeployment?.status === "ACTIVE";

  const successCount = deploymentHistory.filter(d => d.status === "ACTIVE" || d.status === "ROLLED_BACK").length;
  const failedCount  = deploymentHistory.filter(d => d.status === "FAILED").length;
  const totalFinished = successCount + failedCount;
  const successRate = totalFinished > 0 ? Math.round((successCount / totalFinished) * 100) : null;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/" className="hover:text-zinc-300 transition-colors">Projects</Link>
        <span>/</span>
        <span className="text-zinc-300">{project.name}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Status Panel ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold text-zinc-100">{project.name}</h1>
              <p className="text-xs text-zinc-500 mt-0.5 font-mono">{project.repoUrl}</p>
              <p className="text-xs text-zinc-600 mt-0.5">
                branch: <span className="text-zinc-400 font-mono">{project.branch}</span>
                {project.buildContext !== "." && (
                  <> · context: <span className="text-zinc-400 font-mono">{project.buildContext}</span></>
                )}
              </p>
            </div>
            <RunningDot running={containerRunning} />
          </div>

          {/* Error banner — shown when latest deployment failed */}
          {activeDeployment?.status === "FAILED" && activeDeployment.errorMessage && (
            <DeployErrorBanner message={activeDeployment.errorMessage} />
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Stat label="Status">
              {activeDeployment
                ? <StatusBadge status={activeDeployment.status} />
                : <span className="text-xs text-zinc-600">None</span>}
            </Stat>
            <Stat label="Active Port">
              <span className="text-sm font-mono text-zinc-300">
                {activeDeployment?.port ?? "—"}
              </span>
            </Stat>
            <Stat label="Version">
              <span className="text-sm text-zinc-300">
                {activeDeployment ? `v${activeDeployment.version}` : "—"}
              </span>
            </Stat>
            <Stat label="Last deploy">
              <span className="text-sm text-zinc-300">
                {activeDeployment ? timeAgo(activeDeployment.updatedAt) : "—"}
              </span>
            </Stat>
            <Stat label="App port">
              <span className="text-sm font-mono text-zinc-300">{project.appPort}</span>
            </Stat>
            <Stat label="Health path">
              <span className="text-sm font-mono text-zinc-300">{project.healthPath}</span>
            </Stat>
            <Stat label="Success rate">
              <span className={`text-sm font-medium ${
                successRate === null ? "text-zinc-600" :
                successRate >= 80    ? "text-indigo-400" :
                successRate >= 50    ? "text-amber-400"   : "text-red-400"
              }`}>
                {successRate === null ? "—" : `${successRate}%`}
                {successRate !== null && (
                  <span className="text-xs text-zinc-600 font-normal ml-1.5">
                    ({successCount}/{totalFinished})
                  </span>
                )}
              </span>
            </Stat>
          </div>

          {metrics?.running && (
            <div className="mt-5 pt-4 border-t border-zinc-800 grid grid-cols-3 sm:grid-cols-6 gap-3">
              <MetricTile value={`${metrics.cpu.toFixed(1)}%`} label="CPU" color="text-blue-400" />
              <MetricTile value={formatBytes(metrics.memoryUsed)} label="Memory" color="text-violet-400" />
              <MetricTile value={`${metrics.memoryPercent.toFixed(1)}%`} label="Mem %" color="text-zinc-300" />
              <MetricTile value={formatBytes(metrics.netIn ?? 0)} label="Net RX" color="text-indigo-400" />
              <MetricTile value={formatBytes(metrics.netOut ?? 0)} label="Net TX" color="text-orange-400" />
              <MetricTile value={String(metrics.pids ?? 0)} label="PIDs" color="text-zinc-400" />
            </div>
          )}
        </div>

        {/* ── Actions Panel ────────────────────────────────────────────────── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-400 mb-1">Actions</h2>

          {deploying || isDeploying ? (
            <div className="flex gap-2">
              <div className="flex-1 py-2.5 px-4 rounded-lg bg-zinc-800 text-zinc-400 font-medium text-sm flex items-center justify-center">
                <Spinner label={isDeploying ? "Deploying..." : "Triggering..."} />
              </div>
              <button
                onClick={handleCancelDeploy}
                disabled={cancelling}
                className="py-2.5 px-3 rounded-lg bg-red-950/60 border border-red-800/50 text-red-400 text-sm font-medium hover:bg-red-950 hover:border-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Stop deployment"
              >
                {cancelling ? "..." : "Stop"}
              </button>
            </div>
          ) : (
            <button
              onClick={handleDeploy}
              className="w-full py-2.5 px-4 rounded-lg bg-zinc-100 text-zinc-900 font-medium text-sm hover:bg-white transition-colors"
            >
              Deploy
            </button>
          )}

          <button
            onClick={() => setRollbackOpen(true)}
            disabled={rollingBack || !activeDeployment || isDeploying}
            className="w-full py-2.5 px-4 rounded-lg bg-zinc-800 text-zinc-300 font-medium text-sm hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {rollingBack ? <Spinner label="Rolling back..." /> : "Rollback"}
          </button>

          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className="w-full py-2 px-4 rounded-lg border border-zinc-700 text-zinc-500 text-sm hover:text-zinc-300 hover:border-zinc-600 transition-colors"
          >
            {settingsOpen ? "Hide Settings" : "Settings"}
          </button>

          <button
            onClick={handleRefresh}
            className="w-full py-2 px-4 rounded-lg border border-zinc-700 text-zinc-500 text-sm hover:text-zinc-300 hover:border-zinc-600 transition-colors"
          >
            Refresh
          </button>

          {/* Settings inline form */}
          {settingsOpen && (
            <div className="pt-3 border-t border-zinc-800 space-y-3">
              <p className="text-xs font-medium text-zinc-400">Project Settings</p>
              <SField label="Branch">
                <input
                  type="text"
                  value={settingsForm.branch}
                  onChange={(e) => setSettingsForm((p) => ({ ...p, branch: e.target.value }))}
                  className={sinput}
                />
              </SField>
              <SField label="Build context">
                <div className="relative">
                  <input
                    type="text"
                    value={settingsForm.buildContext}
                    onChange={(e) => {
                      setSettingsForm((p) => ({ ...p, buildContext: e.target.value }));
                      setBuildContextOpen(true);
                    }}
                    onFocus={() => setBuildContextOpen(buildContextDirs.length > 0)}
                    onBlur={() => setTimeout(() => setBuildContextOpen(false), 150)}
                    placeholder="."
                    className={`${sinput} ${buildContextDirs.length > 0 ? "pr-7" : ""}`}
                  />
                  {buildContextDirs.length > 0 && (
                    <button
                      type="button"
                      tabIndex={-1}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setBuildContextOpen((v) => !v);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                    >
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                        <path d="M6 8L1 3h10L6 8z" />
                      </svg>
                    </button>
                  )}
                  {buildContextOpen && buildContextDirs.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-2xl z-20 max-h-40 overflow-y-auto">
                      {buildContextDirs
                        .filter((d) => d === "." || d.toLowerCase().includes(settingsForm.buildContext.toLowerCase().replace(/^\.\//, "")))
                        .map((d) => (
                          <button
                            key={d}
                            type="button"
                            onMouseDown={() => {
                              setSettingsForm((p) => ({ ...p, buildContext: d }));
                              setBuildContextOpen(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs font-mono transition-colors ${
                              d === settingsForm.buildContext
                                ? "bg-zinc-700 text-zinc-100"
                                : "text-zinc-300 hover:bg-zinc-700/60"
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </SField>
              <SField label="App port">
                <input
                  type="number"
                  value={settingsForm.appPort}
                  onChange={(e) => setSettingsForm((p) => ({ ...p, appPort: e.target.value }))}
                  className={sinput}
                />
              </SField>
              <SField label="Health path">
                <input
                  type="text"
                  list="s-health-path-opts"
                  value={settingsForm.healthPath}
                  onChange={(e) => setSettingsForm((p) => ({ ...p, healthPath: e.target.value }))}
                  placeholder="/health"
                  className={sinput}
                />
                <datalist id="s-health-path-opts">
                  {HEALTH_PATH_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value} label={o.label} />
                  ))}
                </datalist>
              </SField>
              <SField label="Base port">
                <input
                  type="number"
                  value={settingsForm.basePort}
                  onChange={(e) => setSettingsForm((p) => ({ ...p, basePort: e.target.value }))}
                  className={sinput}
                />
              </SField>
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="w-full py-1.5 text-xs rounded-lg bg-zinc-700 text-zinc-200 hover:bg-zinc-600 transition-colors disabled:opacity-40"
              >
                {savingSettings ? <Spinner label="Saving..." /> : "Save settings"}
              </button>
            </div>
          )}

          <div className="mt-auto pt-4 border-t border-zinc-800 space-y-2">
            <KV k="Container" v={activeDeployment?.containerName ?? "—"} mono truncate />
            <KV k="Image" v={activeDeployment?.imageTag ?? "—"} mono truncate />
          </div>

          {/* Webhook + AI Pipeline */}
          <div className="pt-3 border-t border-zinc-800 space-y-2">
            <p className="text-xs font-medium text-zinc-400">Auto-Deploy Webhook</p>
            {project.webhookSecret ? (
              <>
                <p className="text-xs text-zinc-500">
                  Add to GitHub → Settings → Webhooks. Content type: <code className="text-zinc-400">application/json</code>, event: <code className="text-zinc-400">push</code>.
                </p>
                <code className="block w-full text-xs bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-zinc-300 font-mono break-all leading-relaxed">
                  {typeof window !== "undefined" ? window.location.origin : ""}/api/v1/webhooks/{project.webhookSecret}
                </code>
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/api/v1/webhooks/${project.webhookSecret}`;
                    navigator.clipboard.writeText(url).then(() => toast.success("Webhook URL copied!"));
                  }}
                  className="w-full py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-zinc-100 text-xs font-medium transition-colors"
                >
                  Copy URL
                </button>

                {/* AI Pipeline Generator */}
                <button
                  onClick={handleGeneratePipeline}
                  disabled={pipelineLoading}
                  className="w-full py-2 rounded-lg bg-gradient-to-r from-violet-600/80 to-indigo-600/80 hover:from-violet-500/90 hover:to-indigo-500/90 text-white text-xs font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 border border-violet-500/30"
                >
                  {pipelineLoading ? (
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>✦</span>
                  )}
                  {pipelineLoading ? "Generating..." : pipelineYaml ? "Regenerate CI Pipeline" : "Generate CI Pipeline with AI"}
                </button>
              </>
            ) : (
              <p className="text-xs text-zinc-600 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2">
                No webhook secret — run <code className="text-zinc-500">bunx prisma migrate deploy</code> then restart the engine.
              </p>
            )}
          </div>

          <div className="pt-4 border-t border-zinc-800">
            <button
              onClick={() => setDeleteOpen(true)}
              disabled={deleting}
              className="w-full py-2 px-4 rounded-lg border border-red-900/50 text-red-500 text-sm hover:bg-red-950/40 hover:border-red-700/50 transition-colors disabled:opacity-40"
            >
              {deleting ? <Spinner label="Deleting..." /> : "Delete project"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Deploy Progress ──────────────────────────────────────────────────── */}
      {deployStep >= 0 && (
        <DeployProgressPanel step={deployStep} failed={deployFailed} />
      )}

      {/* ── AI Pipeline Loading overlay ──────────────────────────────────────── */}
      {pipelineLoading && (
        <AIPipelinePanel
          loading={true}
          step={pipelineStep}
          yaml={null}
          projectName={project.name}
        />
      )}

      {/* ── CI Pipeline Modal ─────────────────────────────────────────────────── */}
      {pipelineModalOpen && (
        <CIPipelineModal
          projectName={project.name}
          webhookSecret={project.webhookSecret ?? ""}
          onClose={() => setPipelineModalOpen(false)}
        />
      )}

      {/* ── Blue / Green Slots ───────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-medium text-zinc-400">Deployment Slots</h2>
          <span className="text-xs text-zinc-600">
            base port {project.basePort} · {project.basePort + 1}
          </span>
        </div>

        {deploymentHistory.length === 0 && (
          <div className="mb-4 rounded-xl border border-dashed border-zinc-700 bg-zinc-950 px-6 py-8 text-center">
            <p className="text-sm font-medium text-zinc-400 mb-1">No deployments yet</p>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Hit <span className="text-zinc-400 font-medium">Deploy</span> above to run the first deployment for this project.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DeploymentSlot
            color="BLUE"
            deployment={blueDeployment}
            basePort={project.basePort}
            isActive={activeDeployment?.color === "BLUE"}
          />
          <DeploymentSlot
            color="GREEN"
            deployment={greenDeployment}
            basePort={project.basePort + 1}
            isActive={activeDeployment?.color === "GREEN"}
          />
        </div>

        {/* Traffic indicator */}
        {activeDeployment && (
          <div className="mt-4 pt-4 border-t border-zinc-800 flex items-center gap-3">
            <span className="text-xs text-zinc-600">Traffic routing</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-500">nginx upstream</span>
              <span className="text-xs text-zinc-700">→</span>
              <span className={`text-xs font-semibold font-mono ${activeDeployment.color === "BLUE" ? "text-blue-400" : "text-indigo-400"}`}>
                {activeDeployment.containerName}
              </span>
              <span className="text-xs text-zinc-600">:{activeDeployment.port}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Deployment History ───────────────────────────────────────────────── */}
      {deploymentHistory.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-zinc-400">Deployment History</h2>
            <span className="text-xs text-zinc-600">last {deploymentHistory.length} deployments</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  {["Version", "Slot", "Container", "Status", "Port", "Deployed", "Error"].map((h) => (
                    <th key={h} className="text-left text-zinc-600 font-medium pb-2 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {deploymentHistory.map((d) => (
                  <tr key={d.id} className={`hover:bg-zinc-800/30 transition-colors ${d.status === "FAILED" ? "bg-red-950/10" : ""}`}>
                    <td className="py-2 pr-4 font-mono text-zinc-300">v{d.version}</td>
                    <td className="py-2 pr-4">
                      <span className={`font-semibold ${d.color === "BLUE" ? "text-blue-400" : "text-indigo-400"}`}>
                        {d.color}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-zinc-500 max-w-[140px] truncate">{d.containerName}</td>
                    <td className="py-2 pr-4"><StatusBadge status={d.status} /></td>
                    <td className="py-2 pr-4 font-mono text-zinc-500">{d.port}</td>
                    <td className="py-2 pr-4 text-zinc-500">{timeAgo(d.updatedAt)}</td>
                    <td className="py-2 max-w-[200px]">
                      {d.errorMessage ? (
                        <span
                          className="text-xs text-red-400/70 font-mono truncate block"
                          title={d.errorMessage}
                        >
                          {d.errorMessage}
                        </span>
                      ) : (
                        <span className="text-zinc-700">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Environment Variables ────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-zinc-400">Environment Variables</h2>
          <button
            type="button"
            onClick={() => setEnvRows((prev) => [...prev, { key: "", value: "" }])}
            className="text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 rounded px-2 py-0.5 transition-colors"
          >
            + Add
          </button>
        </div>

        {envRows.length === 0 ? (
          <p className="text-xs text-zinc-700 py-2">No env vars set. Click Add to inject variables into the next deployment.</p>
        ) : (
          <div className="space-y-2">
            {envRows.map((row, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  type="text"
                  value={row.key}
                  onChange={(e) => setEnvRows((prev) => prev.map((r, idx) => idx === i ? { ...r, key: e.target.value } : r))}
                  placeholder="KEY"
                  className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                />
                <input
                  type="text"
                  value={row.value}
                  onChange={(e) => setEnvRows((prev) => prev.map((r, idx) => idx === i ? { ...r, value: e.target.value } : r))}
                  placeholder="value"
                  className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                />
                <button
                  type="button"
                  onClick={() => setEnvRows((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-zinc-600 hover:text-red-400 transition-colors text-sm px-1"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSaveEnv}
            disabled={savingEnv}
            className="px-4 py-1.5 text-xs rounded-lg bg-zinc-700 text-zinc-200 hover:bg-zinc-600 transition-colors disabled:opacity-40"
          >
            {savingEnv ? <Spinner label="Saving..." /> : "Save env vars"}
          </button>
        </div>
      </div>

      {/* ── Resource Metrics ─────────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-zinc-400">Resource Metrics</h2>
          <span className="text-xs text-zinc-600">{metricsHistory.length}/60 samples · polls every 30s</span>
        </div>
        <MetricsChart data={metricsHistory} />
      </div>

      {/* ── Logs ─────────────────────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <LogsViewer lines={logLines} loading={logsLoading} updatedAt={logsUpdated} />
      </div>

      <ConfirmModal
        open={rollbackOpen}
        title="Rollback deployment?"
        description={`This will restore the previous deployment for "${project.name}" and stop the current container.`}
        confirmLabel="Rollback"
        danger
        onConfirm={handleRollback}
        onCancel={() => setRollbackOpen(false)}
      />

      <ConfirmModal
        open={deleteOpen}
        title="Delete project?"
        description={`This will permanently delete "${project.name}" and all its deployment records. Running containers will not be stopped automatically.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}

// ── Deploy Error Banner ───────────────────────────────────────────────────────

function DeployErrorBanner({ message }: { message: string }) {
  const [expanded, setExpanded] = useState(false);
  const sep = message.indexOf("\n\n--- Container output ---\n");
  const summary = sep >= 0 ? message.slice(0, sep) : message;
  const containerLog = sep >= 0 ? message.slice(sep + "\n\n--- Container output ---\n".length) : null;

  return (
    <div className="mb-5 rounded-lg bg-red-950/30 border border-red-800/40 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-red-400 text-sm shrink-0">✕</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-red-400 mb-0.5">Deployment failed</p>
          <p className="text-xs text-red-300/70 font-mono break-words">{summary}</p>
        </div>
        {containerLog && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-xs text-red-500 hover:text-red-300 border border-red-800/60 rounded px-2 py-0.5 transition-colors"
          >
            {expanded ? "Hide logs" : "Show logs"}
          </button>
        )}
      </div>

      {/* Container output */}
      {containerLog && expanded && (
        <div className="border-t border-red-900/40 px-4 py-3">
          <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider mb-2">
            Container output
          </p>
          <pre className="text-xs text-red-200/60 font-mono whitespace-pre-wrap break-words max-h-64 overflow-y-auto leading-relaxed">
            {containerLog}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Deploy Progress Panel ─────────────────────────────────────────────────────

const DEPLOY_STEPS = [
  { label: "Pulling source",     description: "Cloning / updating git repository" },
  { label: "Building image",     description: "Running docker build" },
  { label: "Starting container", description: "Running new container" },
  { label: "Health check",       description: "Waiting for app to respond" },
  { label: "Switching traffic",  description: "Updating nginx upstream" },
];

function DeployProgressPanel({ step, failed }: { step: number; failed: boolean }) {
  const done = step >= DEPLOY_STEPS.length;
  return (
    <div className={`bg-zinc-900 border rounded-xl p-5 transition-colors duration-500 ${
      failed ? "border-red-800/60" : done ? "border-indigo-900/40" : "border-zinc-800"
    }`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-zinc-400">Deploy Progress</h2>
        {done && !failed && (
          <span className="text-xs font-semibold text-indigo-400 flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px]">✓</span>
            Complete
          </span>
        )}
        {failed && (
          <span className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center text-[10px]">✕</span>
            Failed
          </span>
        )}
        {!done && !failed && (
          <span className="text-xs text-zinc-600">
            Step {Math.min(step + 1, DEPLOY_STEPS.length)} of {DEPLOY_STEPS.length}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {DEPLOY_STEPS.map((s, i) => {
          const isActive  = i === step && !done && !failed;
          const isDone    = i < step || done;
          const isFailed  = failed && i === step;
          const isPending = !isDone && !isActive && !isFailed;

          return (
            <div key={i} className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
              isActive ? "bg-zinc-800/70" : "bg-transparent"
            }`}>
              {/* Step icon */}
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold transition-colors ${
                isDone    ? "bg-indigo-500/20 text-indigo-400" :
                isFailed  ? "bg-red-500/20 text-red-400" :
                isActive  ? "bg-blue-500/20 text-blue-400" :
                            "bg-zinc-800 text-zinc-600"
              }`}>
                {isDone   ? "✓" :
                 isFailed ? "✕" :
                 isActive ? (
                   <span className="w-2.5 h-2.5 border border-blue-400 border-t-transparent rounded-full animate-spin block" />
                 ) : String(i + 1)}
              </div>

              {/* Step text */}
              <div className="flex-1 min-w-0">
                <span className={`text-sm font-medium ${
                  isDone    ? "text-zinc-400 line-through" :
                  isFailed  ? "text-red-400" :
                  isActive  ? "text-zinc-100" :
                              "text-zinc-600"
                }`}>
                  {s.label}
                </span>
                {isActive && (
                  <span className="block text-xs text-zinc-500 mt-0.5">{s.description}</span>
                )}
              </div>

              {/* Duration indicator */}
              {isDone && (
                <span className="text-xs text-zinc-600 shrink-0">done</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      {!failed && (
        <div className="mt-4 h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${done ? "bg-indigo-500" : "bg-blue-500"}`}
            style={{ width: `${done ? 100 : (Math.min(step, DEPLOY_STEPS.length) / DEPLOY_STEPS.length) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ── Blue/Green Slot Card ──────────────────────────────────────────────────────

function DeploymentSlot({
  color,
  deployment,
  basePort,
  isActive,
}: {
  color: "BLUE" | "GREEN";
  deployment: Deployment | null;
  basePort: number;
  isActive: boolean;
}) {
  const isBlue = color === "BLUE";

  const activeRing = isBlue
    ? "border-blue-500/50 shadow-[0_0_24px_rgba(59,130,246,0.12)] bg-blue-500/[0.03]"
    : "border-indigo-500/50 shadow-[0_0_24px_rgba(16,185,129,0.12)] bg-indigo-500/[0.03]";

  const dotColor    = isBlue ? "bg-blue-400" : "bg-indigo-400";
  const labelColor  = isBlue ? "text-blue-400" : "text-indigo-400";
  const badgeColor  = isBlue ? "bg-blue-500 text-white" : "bg-indigo-500 text-white";

  return (
    <div className={`relative rounded-xl border p-5 transition-all duration-500 ${isActive ? activeRing : "border-zinc-800 bg-zinc-950"}`}>

      {/* LIVE pill */}
      {isActive && (
        <span className={`absolute -top-2.5 left-4 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ${badgeColor}`}>
          LIVE
        </span>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3 w-3">
            {isActive && deployment?.status === "ACTIVE" && (
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-50`} />
            )}
            <span className={`relative inline-flex h-3 w-3 rounded-full ${dotColor} ${!isActive ? "opacity-30" : ""}`} />
          </span>
          <span className={`text-sm font-bold tracking-wide ${labelColor}`}>{color}</span>
        </div>
        <span className="text-xs font-mono text-zinc-500">:{basePort}</span>
      </div>

      {/* Body */}
      {deployment ? (
        <div className="space-y-2">
          <Row k="Version" v={`v${deployment.version}`} mono />
          <Row k="Container" v={deployment.containerName} mono truncate />
          <Row k="Image" v={deployment.imageTag} mono truncate />
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-600">Status</span>
            <StatusBadge status={deployment.status} />
          </div>
          <Row k="Deployed" v={timeAgo(deployment.updatedAt)} />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-4 gap-1">
          <span className="text-xs text-zinc-700">No deployment in this slot</span>
        </div>
      )}
    </div>
  );
}

// ── Presentational helpers ────────────────────────────────────────────────────

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-950 rounded-lg p-3">
      <p className="text-xs text-zinc-500 mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function MetricTile({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="text-center">
      <p className={`text-lg font-semibold ${color}`}>{value}</p>
      <p className="text-xs text-zinc-600">{label}</p>
    </div>
  );
}

function KV({ k, v, mono = false, truncate = false }: { k: string; v: string; mono?: boolean; truncate?: boolean }) {
  return (
    <div className="flex justify-between text-xs gap-2">
      <span className="text-zinc-600 shrink-0">{k}</span>
      <span className={`text-zinc-400 ${mono ? "font-mono" : ""} ${truncate ? "truncate max-w-[120px]" : ""}`}>{v}</span>
    </div>
  );
}

function Row({ k, v, mono = false, truncate = false }: { k: string; v: string; mono?: boolean; truncate?: boolean }) {
  return (
    <div className="flex justify-between items-center text-xs gap-2">
      <span className="text-zinc-600 shrink-0">{k}</span>
      <span className={`text-zinc-300 ${mono ? "font-mono" : ""} ${truncate ? "truncate max-w-[140px]" : ""}`}>{v}</span>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <span className="w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
      {label}
    </span>
  );
}

// ── CI Pipeline Modal ─────────────────────────────────────────────────────────

const NEXTJS_CI_YAML = (webhookSecret: string) => `name: CI / Deploy

on:
  push:
    branches: [main]

concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    name: Build & Deploy
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint --if-present

      - name: Build
        run: npm run build

      - name: Trigger VersionGate deploy
        run: |
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" \\
            -X POST "\${{ secrets.VERSIONGATE_WEBHOOK_URL }}")
          echo "Webhook status → \$STATUS"
          [ "\$STATUS" = "200" ] || exit 1
`;

function CIPipelineModal({
  projectName,
  webhookSecret,
  onClose,
}: {
  projectName: string;
  webhookSecret: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const yaml = NEXTJS_CI_YAML(webhookSecret);

  function copy() {
    navigator.clipboard.writeText(yaml).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-violet-800/40 rounded-xl w-full max-w-2xl shadow-2xl shadow-violet-950/30 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-800 bg-gradient-to-r from-violet-950/40 to-indigo-950/30 rounded-t-xl">
          <div className="w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400 text-sm shrink-0">
            ✦
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-100">Generated CI Pipeline</p>
            <p className="text-xs text-zinc-500">
              Next.js · GitHub Actions · <span className="text-violet-400 font-mono">{projectName}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors text-lg leading-none">✕</button>
        </div>

        {/* Instructions */}
        <div className="px-6 py-3 bg-zinc-950/40 border-b border-zinc-800 text-xs text-zinc-500 space-y-1">
          <p>1. Save as <code className="text-violet-400">.github/workflows/ci.yml</code> in your repo.</p>
          <p>2. Add a GitHub secret named <code className="text-violet-400">VERSIONGATE_WEBHOOK_URL</code> with your webhook URL.</p>
        </div>

        {/* File bar */}
        <div className="flex items-center gap-2 px-5 py-2 bg-zinc-950/60 border-b border-zinc-800">
          <span className="text-zinc-600 text-xs">📄</span>
          <span className="text-xs font-mono text-zinc-400">.github/workflows/ci.yml</span>
          <span className="ml-auto text-xs text-zinc-600">{yaml.split("\n").length} lines</span>
        </div>

        {/* YAML */}
        <pre className="flex-1 px-5 py-4 text-xs font-mono text-zinc-300 leading-relaxed overflow-y-auto bg-zinc-950/20 whitespace-pre">
          {yaml}
        </pre>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-zinc-800">
          <button
            onClick={copy}
            className="flex-1 py-2 rounded-lg bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/30 text-violet-300 hover:text-violet-100 text-sm font-medium transition-colors"
          >
            {copied ? "✓ Copied!" : "Copy YAML"}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg bg-zinc-100 text-zinc-900 text-sm font-medium hover:bg-white transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AI Pipeline Panel ─────────────────────────────────────────────────────────

const AI_STEPS = [
  { icon: "⬡", label: "Analyzing project structure", sub: "Reading repo config, runtime and dependencies..." },
  { icon: "⬡", label: "Designing pipeline stages",   sub: "Planning CI steps: install → build → test → deploy..." },
  { icon: "⬡", label: "Generating workflow YAML",    sub: "Crafting GitHub Actions syntax and job definitions..." },
  { icon: "⬡", label: "Wiring VersionGate webhook",    sub: "Injecting auto-deploy trigger into the pipeline..." },
];

function AIPipelinePanel({
  loading,
  step,
  yaml,
  projectName,
}: {
  loading: boolean;
  step: number;
  yaml: string | null;
  projectName: string;
}) {
  const [copied, setCopied] = useState(false);

  function copyYaml() {
    if (!yaml) return;
    navigator.clipboard.writeText(yaml).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="bg-zinc-900 border border-violet-800/40 rounded-xl overflow-hidden shadow-[0_0_40px_rgba(139,92,246,0.08)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-violet-800/20 bg-gradient-to-r from-violet-950/40 to-indigo-950/40">
        <div className="w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400 text-sm">
          ✦
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-100">AI CI Pipeline</p>
          <p className="text-xs text-zinc-500">
            {loading ? "Generating GitHub Actions workflow for " : "Generated for "}
            <span className="text-violet-400 font-mono">{projectName}</span>
          </p>
        </div>
        {loading && (
          <div className="ml-auto flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        )}
        {!loading && yaml && (
          <button
            onClick={copyYaml}
            className="ml-auto px-3 py-1.5 rounded-lg bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/30 text-violet-300 hover:text-violet-100 text-xs font-medium transition-colors"
          >
            {copied ? "✓ Copied!" : "Copy YAML"}
          </button>
        )}
      </div>

      {/* Loading state — step-by-step progress */}
      {loading && (
        <div className="px-6 py-5 space-y-3">
          {AI_STEPS.map((s, i) => {
            const done    = i < step;
            const active  = i === step;
            const pending = i > step;
            return (
              <div key={i} className={`flex items-start gap-3 transition-opacity duration-500 ${pending ? "opacity-25" : "opacity-100"}`}>
                <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] transition-colors ${
                  done   ? "bg-indigo-500/20 text-indigo-400" :
                  active ? "bg-violet-500/20 text-violet-400" :
                           "bg-zinc-800 text-zinc-600"
                }`}>
                  {done ? "✓" : active ? (
                    <span className="w-2.5 h-2.5 border border-violet-400 border-t-transparent rounded-full animate-spin block" />
                  ) : s.icon}
                </div>
                <div>
                  <p className={`text-sm font-medium ${done ? "text-zinc-500" : active ? "text-zinc-100" : "text-zinc-600"}`}>
                    {s.label}
                  </p>
                  {active && (
                    <p className="text-xs text-zinc-500 mt-0.5">{s.sub}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Result — generated YAML */}
      {!loading && yaml && (
        <div className="relative">
          {/* File path bar */}
          <div className="flex items-center gap-2 px-4 py-2 bg-zinc-950/60 border-b border-zinc-800">
            <span className="text-zinc-600 text-xs">📄</span>
            <span className="text-xs font-mono text-zinc-400">.github/workflows/ci.yml</span>
            <span className="ml-auto text-xs text-zinc-600">{yaml.split("\n").length} lines</span>
          </div>
          <pre className="px-5 py-4 text-xs font-mono text-zinc-300 leading-relaxed overflow-x-auto max-h-[520px] overflow-y-auto bg-zinc-950/40 whitespace-pre">
            {yaml}
          </pre>
        </div>
      )}
    </div>
  );
}

const sinput = "w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500";

function SField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
