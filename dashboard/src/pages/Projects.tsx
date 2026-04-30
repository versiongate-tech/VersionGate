import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAllDeployments, getProjects, getServerStats, listAllJobs, type Deployment, type JobRecord, type Project, type ServerStats } from "@/lib/api";
import { projectDeploymentStatus } from "@/lib/project-deployment-status";
import { getDisplayDeployment, publicServiceUrl } from "@/lib/deployment-display";
import { PageHeader } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteProjectDialog } from "@/components/DeleteProjectDialog";
import { toast } from "sonner";
import { useLaunchCreateProject } from "@/create-project-launch";
import { AggregateJobLogStream } from "@/components/AggregateJobLogStream";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const PAGE_SIZE = 6;

function formatUptime(projectId: string, deployments: Deployment[]): string {
  const active = deployments.find((d) => d.projectId === projectId && d.status === "ACTIVE");
  if (!active) return "—";
  const sec = Math.max(0, (Date.now() - new Date(active.updatedAt).getTime()) / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function regionLabel(p: Project): string {
  const r = p.env?.AWS_REGION ?? p.env?.REGION ?? p.env?.FLY_REGION;
  if (typeof r === "string" && r.trim()) return r.trim();
  return typeof window !== "undefined" && window.location.hostname ? window.location.hostname : "local";
}

export function Projects() {
  const launchCreate = useLaunchCreateProject();
  const [projects, setProjects] = useState<Project[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [latestJobByProject, setLatestJobByProject] = useState<Map<string, string>>(new Map());
  const [hostStats, setHostStats] = useState<ServerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [page, setPage] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const [p, d, jobs] = await Promise.all([
        getProjects(),
        getAllDeployments(),
        listAllJobs({ limit: 120 }).catch(() => ({ jobs: [] as JobRecord[], total: 0 })),
      ]);
      setProjects(p.projects);
      setDeployments(d.deployments);
      const m = new Map<string, string>();
      for (const j of jobs.jobs) {
        if (!m.has(j.projectId)) m.set(j.projectId, j.id);
      }
      setLatestJobByProject(m);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await getServerStats();
        if (!cancelled) setHostStats(s);
      } catch {
        if (!cancelled) setHostStats(null);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const pageCount = Math.max(1, Math.ceil(projects.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount - 1);
  const slice = useMemo(() => {
    const start = pageSafe * PAGE_SIZE;
    return projects.slice(start, start + PAGE_SIZE);
  }, [projects, pageSafe]);

  useEffect(() => {
    if (page > pageCount - 1) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  return (
    <div className="w-full space-y-8">
      <PageHeader
        title="Projects"
        description="Manage registered applications, rollout state, service links, and host capacity at a glance."
        actions={
          <Button type="button" size="sm" onClick={() => launchCreate()}>
            New project
          </Button>
        }
      />

      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No projects yet.{" "}
          <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => launchCreate()}>
            Create one
          </button>
          .
        </p>
      ) : (
        <>
          <Card className="overflow-hidden border-border/80 bg-card shadow-sm">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border/60 py-4">
              <div>
                <CardTitle className="text-lg">Active clusters</CardTitle>
                <CardDescription>Projects on this VersionGate node.</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Name</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Uptime</TableHead>
                    <TableHead>Service link</TableHead>
                    <TableHead className="pr-6 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slice.map((proj) => {
                    const state = projectDeploymentStatus(proj.id, deployments);
                    const disp = getDisplayDeployment(proj.id, deployments);
                    const url =
                      disp && (disp.status === "ACTIVE" || disp.status === "DEPLOYING")
                        ? publicServiceUrl(disp.port)
                        : null;
                    const jobId = latestJobByProject.get(proj.id);
                    return (
                      <TableRow key={proj.id}>
                        <TableCell className="pl-6 font-medium">
                          <Link to={`/projects/${proj.id}`} className="text-primary hover:underline">
                            {proj.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{regionLabel(proj)}</TableCell>
                        <TableCell>
                          <StatusBadge status={state} />
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-muted-foreground">
                          {formatUptime(proj.id, deployments)}
                        </TableCell>
                        <TableCell>
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                            >
                              {url.replace(/^https?:\/\//, "")}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          <div className="flex justify-end gap-2">
                            {jobId ? (
                              <Link
                                to={`/projects/${proj.id}/deploy/${jobId}`}
                                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                              >
                                View log
                              </Link>
                            ) : null}
                            <Link to={`/projects/${proj.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                              Open
                            </Link>
                            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget(proj)}>
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
                <span>
                  Showing {slice.length ? pageSafe * PAGE_SIZE + 1 : 0}–{pageSafe * PAGE_SIZE + slice.length} of {projects.length}{" "}
                  projects
                </span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={pageSafe <= 0} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pageSafe >= pageCount - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <AggregateJobLogStream title="System live logs" pollMs={7000} />
            <Card className="border-border/80 bg-card shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Resource usage</CardTitle>
                <CardDescription>Host running VersionGate API + worker.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {hostStats ? (
                  <>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">CPU</p>
                      <p className="text-2xl font-semibold tabular-nums">{hostStats.cpu_percent.toFixed(1)}%</p>
                      <Progress value={Math.min(100, hostStats.cpu_percent)} className="mt-1 h-2" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Memory</p>
                      <p className="text-2xl font-semibold tabular-nums">{hostStats.memory_percent.toFixed(1)}%</p>
                      <Progress value={Math.min(100, hostStats.memory_percent)} className="mt-1 h-2" />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Loading host metrics…</p>
                )}
                <Link to="/system" className={cn(buttonVariants({ variant: "link", className: "h-auto px-0 text-xs" }))}>
                  Open system health
                </Link>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {deleteTarget ? (
        <DeleteProjectDialog
          open
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          projectId={deleteTarget.id}
          projectName={deleteTarget.name}
          navigateTo="/projects"
          onDeleted={() => void load()}
        />
      ) : null}
    </div>
  );
}
