import { useEffect, useMemo, useState } from "react";
import { DonutChart } from "@/components/charts/DonutChart";
import { SimpleBarChart } from "@/components/charts/SimpleBarChart";
import { Link, useNavigate } from "react-router-dom";
import {
  getAllDeployments,
  getProjects,
  listAllJobs,
  listProjectJobs,
  triggerDeploy,
  type Deployment,
  type JobRecord,
  type Project,
} from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { SlotBadge } from "@/components/SlotBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLaunchCreateProject } from "@/create-project-launch";
import { getDisplayDeployment, hostPortForSlot, publicServiceUrl } from "@/lib/deployment-display";
import { DeleteProjectDialog } from "@/components/DeleteProjectDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function projectStatus(projectId: string, deployments: Deployment[]): string {
  const mine = deployments.filter((d) => d.projectId === projectId);
  const active = mine.find((d) => d.status === "ACTIVE");
  if (mine.some((d) => d.status === "DEPLOYING")) return "DEPLOYING";
  if (active) return "ACTIVE";
  const last = mine.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  if (last?.status === "FAILED") return "FAILED";
  if (last?.status === "ROLLED_BACK") return "ROLLED_BACK";
  return "PENDING";
}

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

export function Overview() {
  const launchCreate = useLaunchCreateProject();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [latestJobs, setLatestJobs] = useState<Record<string, JobRecord | undefined>>({});
  const [recentJobs, setRecentJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [p, d, allJobs] = await Promise.all([
        getProjects(),
        getAllDeployments(),
        listAllJobs({ limit: 5 }),
      ]);
      setProjects(p.projects);
      setDeployments(d.deployments);
      setRecentJobs(allJobs.jobs);

      const jobEntries = await Promise.all(
        p.projects.map(async (proj) => {
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
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const stats = useMemo(() => {
    let running = 0;
    let failed = 0;
    let deploying = 0;
    for (const proj of projects) {
      const s = projectStatus(proj.id, deployments);
      if (s === "ACTIVE") running++;
      if (s === "FAILED") failed++;
      if (s === "DEPLOYING") deploying++;
    }
    return { total: projects.length, running, failed, deploying };
  }, [projects, deployments]);

  const projectHealthPie = useMemo(() => {
    const m = new Map<string, number>();
    for (const proj of projects) {
      const s = projectStatus(proj.id, deployments);
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  }, [projects, deployments]);

  const deploymentStatusPie = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of deployments) {
      m.set(d.status, (m.get(d.status) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  }, [deployments]);

  const recentJobTypesBar = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of recentJobs) {
      m.set(j.type, (m.get(j.type) ?? 0) + 1);
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [recentJobs]);

  const onDeploy = async (projectId: string) => {
    try {
      const r = await triggerDeploy(projectId);
      toast.success(`Deploy queued — job ${r.jobId.slice(0, 8)}…`);
      navigate(`/projects/${projectId}/deploy/${r.jobId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Deploy failed");
    }
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Overview</h1>
          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p>
              VersionGate runs each project in Docker with two fixed host ports (blue and green). A new image builds on
              the idle slot; when healthy, traffic switches to that slot so users stay on one URL while the old container
              is retired.
            </p>
            <p>
              Failed builds and disk exhaustion on the host show up in deploy logs. Keep enough free space on the server
              for <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-xs">npm install</code> and image
              layers during builds.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/activity" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Activity
          </Link>
          <Link to="/server" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Host metrics
          </Link>
          <Link to="/settings" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Settings
          </Link>
          <Button onClick={launchCreate}>Add project</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Projects" value={stats.total} hint="Registered in this instance" />
        <StatCard
          label="Live"
          value={stats.running}
          valueClassName="text-emerald-400"
          hint="ACTIVE deployment"
        />
        <StatCard
          label="Failed"
          value={stats.failed}
          valueClassName="text-red-400"
          hint="Last deploy state"
        />
        <StatCard
          label="Deploying"
          value={stats.deploying}
          valueClassName="text-cyan-400"
          hint="Build or rollout in progress"
        />
      </div>

      {projects.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-border/50 bg-card/50 ring-1 ring-border/25">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Projects by status</CardTitle>
              <CardDescription>Derived from the latest deployment per project.</CardDescription>
            </CardHeader>
            <CardContent>
              <DonutChart data={projectHealthPie} emptyLabel="No projects" />
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50 ring-1 ring-border/25">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">All deployments</CardTitle>
              <CardDescription>Every recorded deployment version.</CardDescription>
            </CardHeader>
            <CardContent>
              <DonutChart data={deploymentStatusPie} emptyLabel="No deployments" />
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50 ring-1 ring-border/25">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent jobs by type</CardTitle>
              <CardDescription>Latest five jobs across the instance.</CardDescription>
            </CardHeader>
            <CardContent>
              <SimpleBarChart data={recentJobTypesBar} />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {projects.length === 0 ? (
        <Card className="border-dashed border-border/60 bg-card/40">
          <CardContent className="flex flex-col items-center justify-center gap-6 py-16">
            <div className="space-y-2 text-center">
              <h3 className="text-lg font-semibold">No projects yet</h3>
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                Add a Git-backed project to clone, build, and run behind blue/green routing. You will pick branch, build
                context, app port, and health path before the first deploy.
              </p>
            </div>
            <Button size="lg" onClick={launchCreate}>
              Create your first project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Projects</h2>
              <span className="text-xs text-muted-foreground">{projects.length} total</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((p) => {
                const row = getDisplayDeployment(p.id, deployments);
                const st = projectStatus(p.id, deployments);
                const job = latestJobs[p.id];
                const hostPort = row ? hostPortForSlot(p, row.color) : null;
                const hostUrl = hostPort != null ? publicServiceUrl(hostPort) : null;
                const lastDeploy = deployments
                  .filter((d) => d.projectId === p.id)
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

                return (
                  <Card
                    key={p.id}
                    className="group relative border-border/50 bg-card/60 shadow-none ring-1 ring-border/30 transition-all hover:ring-primary/30 hover:shadow-md hover:shadow-primary/5"
                  >
                    <Link to={`/projects/${p.id}`} className="absolute inset-0 z-10" />
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="truncate text-base font-semibold transition-colors group-hover:text-primary">
                            {p.name}
                          </CardTitle>
                          <CardDescription className="mt-1 truncate font-mono text-xs">Branch: {p.branch}</CardDescription>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <StatusBadge status={st} />
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className="relative z-20 inline-flex size-7 items-center justify-center rounded-md border border-border/60 bg-card/90 text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
                              onPointerDown={(e) => e.stopPropagation()}
                            >
                              <span className="sr-only">Project actions</span>
                              <span className="text-lg leading-none" aria-hidden>
                                ⋯
                              </span>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="z-50 w-44">
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget(p);
                                }}
                              >
                                Delete project
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pb-3">
                      <div className="text-xs text-muted-foreground">
                        <span className="font-mono">{p.repoUrl.replace(/^https?:\/\/(www\.)?/, "")}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {row && <SlotBadge color={row.color} />}
                        {hostUrl ? (
                          <a
                            href={hostUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="relative z-20 truncate font-mono text-xs text-primary underline-offset-2 hover:underline"
                          >
                            {hostUrl.replace(/^https?:\/\//, "")} (open)
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">Not deployed</span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 border-t border-border/30 pt-3 text-xs text-muted-foreground">
                        <span className="font-mono tabular-nums">Container port {p.appPort}</span>
                        {lastDeploy && <span>Last deploy {timeAgo(lastDeploy.createdAt)}</span>}
                        <div className="ml-auto flex items-center gap-1.5">
                          {job && (
                            <Link
                              to={`/projects/${p.id}/deploy/${job.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="relative z-20"
                            >
                              <Badge variant={job.status === "FAILED" ? "destructive" : "secondary"} className="font-mono text-[10px]">
                                {job.status}
                              </Badge>
                            </Link>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="relative z-20 h-7 px-2 text-xs"
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

              <Card
                className="flex min-h-[180px] cursor-pointer items-center justify-center border-dashed border-border/40 bg-card/20 shadow-none ring-1 ring-border/20 transition-all hover:bg-card/40 hover:ring-primary/20"
                onClick={launchCreate}
              >
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <span className="text-sm font-medium">New project</span>
                  <span className="text-center text-xs">Add another repository</span>
                </div>
              </Card>
            </div>
          </div>

          {recentJobs.length > 0 && (
            <Card className="border-border/50 bg-card/50 shadow-none ring-1 ring-border/25">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div>
                  <CardTitle className="text-base">Recent activity</CardTitle>
                  <CardDescription>Latest deploy and rollback jobs across all projects</CardDescription>
                </div>
                <Link to="/activity" className={buttonVariants({ variant: "ghost", size: "sm", className: "text-xs" })}>
                  View all
                </Link>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                <div className="divide-y divide-border/30">
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
                        className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/30"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={`size-2 shrink-0 rounded-full ${
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
                            <span className="text-sm font-medium">{job.project?.name ?? "Unknown"}</span>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-mono">{job.type}</span>
                              <span>{timeAgo(job.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={badgeVar} className="font-mono text-[10px]">
                            {job.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">Open</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
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
            void load();
            setDeleteTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}
