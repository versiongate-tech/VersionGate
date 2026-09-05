import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getAllDeployments,
  getInstanceSettings,
  getProjects,
  listAllJobs,
  listProjectDomains,
  listProjectJobs,
  triggerDeploy,
  type Deployment,
  type JobRecord,
  type Project,
} from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { SlotBadge } from "@/components/badges/SlotBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { useLaunchCreateProject } from "@/create-project-launch";
import {
  getActiveDeployment,
  getDeployingDeployment,
  getDisplayDeployment,
  latestDeploymentForColor,
  publicProjectLiveUrl,
  publicServiceUrl,
  setConfiguredPublicHost,
} from "@/lib/deployment-display";
import { projectDeploymentStatus } from "@/lib/project-deployment-status";
import { DeleteProjectDialog } from "@/components/modals/DeleteProjectDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AggregateJobLogStream } from "@/components/AggregateJobLogStream";

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function regionLabel(p: Project): string {
  const r = p.env?.AWS_REGION ?? p.env?.REGION ?? p.env?.FLY_REGION;
  if (typeof r === "string" && r.trim()) return r.trim();
  return typeof window !== "undefined" && window.location.hostname ? window.location.hostname : "local";
}

export function Overview() {
  const launchCreate = useLaunchCreateProject();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [domainsByProject, setDomainsByProject] = useState<Record<string, { hostname: string; sslStatus: string }[]>>({});
  const [latestJobs, setLatestJobs] = useState<Record<string, JobRecord | undefined>>({});
  const [recentJobs, setRecentJobs] = useState<JobRecord[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent && projects.length === 0) {
      setInitialLoading(true);
    }
    try {
      const [p, d, allJobs, inst] = await Promise.all([
        getProjects(),
        getAllDeployments(),
        listAllJobs({ limit: 6 }),
        getInstanceSettings().catch(() => null),
      ]);
      setProjects(p.projects);
      setDeployments(d.deployments);
      setRecentJobs(allJobs.jobs);
      setConfiguredPublicHost(inst?.publicDomain);

      const domainEntries = await Promise.all(
        p.projects.map(async (proj: Project) => {
          try {
            const r = await listProjectDomains(proj.id);
            return [proj.id, r.domains] as const;
          } catch {
            return [proj.id, []] as const;
          }
        })
      );
      setDomainsByProject(Object.fromEntries(domainEntries));

      const jobEntries = await Promise.all(
        p.projects.map(async (proj: Project) => {
          try {
            const r = await listProjectJobs(proj.id, { limit: 1 });
            return [proj.id, r.jobs[0]] as const;
          } catch {
            return [proj.id, undefined] as const;
          }
        })
      );
      setLatestJobs(Object.fromEntries(jobEntries));
    } catch (e) {
      if (!isSilent) {
        toast.error(e instanceof Error ? e.message : "Failed to load dashboard state");
      }
    } finally {
      setInitialLoading(false);
    }
  }, [projects.length]);

  useEffect(() => {
    void loadData(false);
    const interval = window.setInterval(() => void loadData(true), 12000);
    return () => window.clearInterval(interval);
  }, [loadData]);

  const stats = useMemo(() => {
    let running = 0;
    let failed = 0;
    let deploying = 0;
    for (const proj of projects) {
      const s = projectDeploymentStatus(proj.id, deployments);
      if (s === "ACTIVE") running++;
      if (s === "FAILED") failed++;
      if (s === "DEPLOYING") deploying++;
    }
    return { total: projects.length, running, failed, deploying };
  }, [projects, deployments]);

  const onDeploy = async (projectId: string) => {
    try {
      const r = await triggerDeploy(projectId);
      toast.success(`Deploy queued — job ${r.jobId.slice(0, 8)}…`);
      navigate(`/projects/${projectId}/deploy/${r.jobId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Deploy failed");
    }
  };

  if (initialLoading && projects.length === 0) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="flex w-full divide-x divide-border border border-border bg-background rounded-md overflow-hidden">
          <StatCard borderless label="Projects" value={0} />
          <StatCard borderless label="Active" value={0} />
          <StatCard borderless label="Deploys" value={0} />
          <StatCard borderless label="Failed" value={0} />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8 font-sans">
      {/* Hero Welcome Header & Quick Action CTAs */}
      <div className="flex flex-col gap-4 border-b border-neutral-800 pb-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl font-sans">
            Overview
          </h1>
          <p className="text-sm text-neutral-400 font-sans">
            Zero-downtime Docker deployments, blue/green traffic routing, and live telemetry.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={launchCreate}
            className="gap-1.5 bg-white font-sans text-xs font-semibold text-black hover:bg-neutral-200"
          >
            <span>+</span>
            Deploy Project
          </Button>
          <a
            href="https://github.com/dineshkorukonda/VersionGate/blob/main/docs/SETUP.md"
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "font-sans text-xs border-neutral-800 text-neutral-300 hover:text-white")}
          >
            Documentation
          </a>
        </div>
      </div>

      {/* Telemetry Hero Matrix Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-neutral-800 bg-[#0a0a0a] rounded-xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="font-sans text-xs font-medium text-neutral-400">Total Projects</span>
              <span className="rounded-full bg-neutral-900 px-2 py-0.5 font-mono text-[10px] text-neutral-300">Active</span>
            </div>
            <div className="mt-3 font-mono text-3xl font-bold text-white tracking-tight">
              {stats.total}
            </div>
            <p className="mt-1 font-sans text-[11px] text-neutral-500">Configured project deployments</p>
          </CardContent>
        </Card>

        <Card className="border-neutral-800 bg-[#0a0a0a] rounded-xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="font-sans text-xs font-medium text-neutral-400">Active Containers</span>
              <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </div>
            <div className="mt-3 font-mono text-3xl font-bold text-white tracking-tight">
              {stats.running}
            </div>
            <p className="mt-1 font-sans text-[11px] text-neutral-500">Upstream Docker slots serving traffic</p>
          </CardContent>
        </Card>

        <Card className="border-neutral-800 bg-[#0a0a0a] rounded-xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="font-sans text-xs font-medium text-neutral-400">Pipeline Active</span>
              <span className="font-mono text-[10px] text-sky-400">Building</span>
            </div>
            <div className="mt-3 font-mono text-3xl font-bold text-white tracking-tight">
              {stats.deploying}
            </div>
            <p className="mt-1 font-sans text-[11px] text-neutral-500">Deployments in build & warm-swap</p>
          </CardContent>
        </Card>

        <Card className="border-neutral-800 bg-[#0a0a0a] rounded-xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="font-sans text-xs font-medium text-neutral-400">Cluster Health</span>
              <span className="font-mono text-[10px] text-emerald-400">99.9%</span>
            </div>
            <div className="mt-3 font-mono text-3xl font-bold text-emerald-400 tracking-tight">
              {stats.failed > 0 ? `${stats.failed} Alerts` : "Optimal"}
            </div>
            <p className="mt-1 font-sans text-[11px] text-neutral-500">Zero downtime routing active</p>
          </CardContent>
        </Card>
      </div>

      {projects.length === 0 ? (
        <Card className="border-dashed border-border/60 bg-card/40">
          <CardContent className="flex flex-col items-center justify-center gap-6 py-16">
            <div className="space-y-2 text-center">
              <h3 className="font-mono text-base font-semibold">No active projects</h3>
              <p className="max-w-md font-mono text-xs leading-relaxed text-muted-foreground">
                Deploy your first Git-backed project with zero-downtime blue/green routing and instant rollback support.
              </p>
            </div>
            <Button size="sm" onClick={launchCreate} className="font-mono text-xs">
              + Create First Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold tracking-tight">Active Projects</span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {projects.length}
                </Badge>
              </div>
              <Link
                to="/projects"
                className="font-mono text-xs text-primary underline-offset-2 hover:underline"
              >
                View Full Table
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((p) => {
                const mine = deployments.filter((d) => d.projectId === p.id);
                const row = getDisplayDeployment(p.id, deployments);
                const st = projectDeploymentStatus(p.id, deployments);
                const job = latestJobs[p.id];
                const hostPort = row?.port ?? null;
                const domains = domainsByProject[p.id] ?? [];
                const hostUrl =
                  hostPort != null || domains.length > 0
                    ? publicProjectLiveUrl(p, domains, hostPort)
                    : null;
                const active = getActiveDeployment(p.id, deployments);
                const deploying = getDeployingDeployment(p.id, deployments);
                const bluePort = p.basePort;
                const greenPort = p.basePort + 1;
                const prodMine = mine.filter((d) => d.port === p.basePort || d.port === p.basePort + 1);
                const blueLatest = latestDeploymentForColor(prodMine, "BLUE");
                const greenLatest = latestDeploymentForColor(prodMine, "GREEN");
                const lastDeploy = mine.sort(
                  (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                )[0];

                return (
                  <Card
                    key={p.id}
                    className="border border-neutral-800 bg-[#0a0a0a] rounded-xl shadow-sm transition-all hover:border-neutral-700"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="truncate font-mono text-sm font-semibold transition-colors hover:text-primary">
                            <Link to={`/projects/${p.id}`}>{p.name}</Link>
                          </CardTitle>
                          <CardDescription className="mt-1 space-y-0.5 font-mono text-[11px]">
                            <div className="truncate text-muted-foreground">Branch: {p.branch}</div>
                            <div className="truncate text-muted-foreground/70">Host: {regionLabel(p)}</div>
                          </CardDescription>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <StatusBadge status={st} />
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className="relative z-20 inline-flex size-7 items-center justify-center rounded-md border border-border/60 bg-card/90 font-mono text-muted-foreground hover:bg-muted hover:text-foreground"
                              onPointerDown={(e) => e.stopPropagation()}
                            >
                              <span className="sr-only">Project actions</span>
                              <span className="text-xs leading-none">...</span>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="z-50 w-44 font-mono text-xs">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/projects/${p.id}`);
                                }}
                              >
                                Project Settings
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget(p);
                                }}
                              >
                                Delete Project
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3 pb-3">
                      {st === "DEPLOYING" && (
                        <div className="relative z-20 space-y-1">
                          <p className="font-mono text-[10px] uppercase text-sky-400">
                            Pipeline Active · Deploying container...
                          </p>
                          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full w-2/5 animate-pulse rounded-full bg-sky-500" />
                          </div>
                        </div>
                      )}

                      <div className="font-mono text-xs text-muted-foreground truncate">
                        <a
                          href={/^https?:\/\//i.test(p.repoUrl) ? p.repoUrl : `https://${p.repoUrl}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-primary hover:underline"
                        >
                          {p.repoUrl.replace(/^https?:\/\/(www\.)?/, "")}
                        </a>
                      </div>

                      {/* Blue / Green Slots */}
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {row && <SlotBadge color={row.color} />}
                          {hostUrl ? (
                            <a
                              href={hostUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={cn(
                                buttonVariants({ variant: "default", size: "xs" }),
                                "bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-[10px]"
                              )}
                            >
                              Open Live App
                            </a>
                          ) : (
                            <span className="font-mono text-xs text-muted-foreground/60">Not deployed</span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[10px] leading-tight">
                          {(["BLUE", "GREEN"] as const).map((c) => {
                            const port = c === "BLUE" ? bluePort : greenPort;
                            const u = publicServiceUrl(port);
                            const isLive = active?.color === c;
                            const isDeploy = deploying?.color === c;
                            const latest = c === "BLUE" ? blueLatest : greenLatest;
                            return (
                              <div
                                key={c}
                                className={`rounded-md border p-2 font-mono ${
                                  c === "BLUE"
                                    ? "border-sky-500/25 bg-sky-500/[0.05]"
                                    : "border-emerald-500/25 bg-emerald-500/[0.05]"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-semibold text-foreground">
                                    {c === "BLUE" ? "Slot A" : "Slot B"}
                                  </span>
                                  {isLive ? (
                                    <Badge className="h-4 bg-emerald-600 px-1 py-0 text-[8px] font-bold text-white">
                                      LIVE
                                    </Badge>
                                  ) : isDeploy ? (
                                    <Badge variant="outline" className="h-4 border-amber-500/40 px-1 py-0 text-[8px] text-amber-300">
                                      DEPLOY
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground/60">idle</span>
                                  )}
                                </div>
                                <a
                                  href={u}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="relative z-20 mt-1 block truncate font-mono text-muted-foreground hover:text-primary hover:underline"
                                >
                                  :{port}
                                </a>
                                {latest ? (
                                  <p className="mt-0.5 truncate text-muted-foreground" title={latest.containerName}>
                                    v{latest.version} ({latest.status.toLowerCase()})
                                  </p>
                                ) : (
                                  <p className="mt-0.5 text-muted-foreground/50">—</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="flex items-center gap-3 border-t border-border/30 pt-3 font-mono text-[11px] text-muted-foreground">
                        <span>Port {p.appPort}</span>
                        {lastDeploy && <span>{timeAgo(lastDeploy.createdAt)}</span>}
                        <div className="ml-auto flex items-center gap-2">
                          {job && (
                            <Link
                              to={`/projects/${p.id}/deploy/${job.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="relative z-20"
                            >
                              <Badge
                                variant={job.status === "FAILED" ? "destructive" : "secondary"}
                                className="font-mono text-[10px]"
                              >
                                {job.status}
                              </Badge>
                            </Link>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="relative z-20 h-7 px-2 font-mono text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              void onDeploy(p.id);
                            }}
                          >
                            Deploy
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Recent Activity Stream */}
          {recentJobs.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div>
                  <CardTitle className="font-mono text-sm font-semibold">Recent Pipeline Executions</CardTitle>
                  <CardDescription className="font-mono text-xs">
                    Latest deployment and rollback runs across all project environments
                  </CardDescription>
                </div>
                <Link
                  to="/activity"
                  className={buttonVariants({ variant: "ghost", size: "sm", className: "font-mono text-xs" })}
                >
                  View All Activity
                </Link>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                <div className="divide-y divide-border/40 font-mono text-xs">
                  {recentJobs.map((job) => {
                    const badgeVar =
                      job.status === "COMPLETE"
                        ? ("default" as const)
                        : job.status === "FAILED" || job.status === "CANCELLED"
                          ? ("destructive" as const)
                          : ("secondary" as const);

                    return (
                      <Link
                        key={job.id}
                        to={`/projects/${job.projectId}/deploy/${job.id}`}
                        className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/40"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={`inline-block size-2 shrink-0 rounded-full ${
                              job.status === "COMPLETE"
                                ? "bg-emerald-500"
                                : job.status === "FAILED"
                                  ? "bg-red-500"
                                  : job.status === "RUNNING"
                                    ? "animate-pulse bg-cyan-500"
                                    : "bg-amber-500"
                            }`}
                          />
                          <div className="min-w-0">
                            <span className="font-semibold text-foreground">
                              {job.project?.name ?? "Unknown Project"}
                            </span>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="uppercase">{job.type}</span>
                              <span>·</span>
                              <span>{timeAgo(job.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={badgeVar} className="font-mono text-[10px]">
                            {job.status}
                          </Badge>
                          <span className="text-muted-foreground">View Log</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <section className="space-y-2">
            <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Aggregate Real-Time Cluster Logs
            </h2>
            <AggregateJobLogStream title="Live deployment tail" pollMs={8000} />
          </section>
        </div>
      )}

      {deleteTarget ? (
        <DeleteProjectDialog
          open
          onOpenChange={(o) => {
            if (!o) setDeleteTarget(null);
          }}
          projectId={deleteTarget.id}
          projectName={deleteTarget.name}
          navigateTo={false}
          onDeleted={() => {
            void loadData(false);
            setDeleteTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}
