import { useEffect, useMemo, useState } from "react";
import { DonutChart } from "@/components/charts/DonutChart";
import { DeleteProjectDialog } from "@/components/DeleteProjectDialog";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getDeployments,
  getProject,
  getProjectEnvironments,
  listProjectJobs,
  rollback,
  triggerDeploy,
  type Deployment,
  type EnvironmentSummary,
  type JobRecord,
  type Project,
} from "@/lib/api";
import { EnvironmentChain } from "@/components/EnvironmentChain";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { SlotBadge } from "@/components/SlotBadge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { BlueGreenTrafficCard } from "@/components/BlueGreenTrafficCard";
import { getDeployingDeployment, publicServiceUrl } from "@/lib/deployment-display";

function copyText(text: string, label: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} copied`),
    () => toast.error("Copy failed")
  );
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

export function ProjectDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = async () => {
    if (!id) {
      setLoading(false);
      setProject(null);
      return;
    }
    setLoading(true);
    try {
      const [p, d, j] = await Promise.all([
        getProject(id),
        getDeployments(id),
        listProjectJobs(id, { limit: 25 }),
      ]);
      const envData = await getProjectEnvironments(id).catch(() => ({ environments: [] as EnvironmentSummary[] }));
      setProject(p.project ?? null);
      setDeployments(d.deployments);
      setEnvironments(envData.environments ?? []);
      setJobs(j.jobs);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load project");
      setProject(null);
      setDeployments([]);
      setEnvironments([]);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load only when project id changes
  }, [id]);

  const deploymentPie = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of deployments) {
      m.set(d.status, (m.get(d.status) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  }, [deployments]);

  const jobsByStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of jobs) {
      m.set(j.status, (m.get(j.status) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  }, [jobs]);

  const prodChainOrder = useMemo(() => {
    if (environments.length === 0) return null;
    return Math.max(...environments.map((e) => e.chainOrder));
  }, [environments]);

  const prodEnvId = useMemo(() => {
    if (prodChainOrder == null) return null;
    return environments.find((e) => e.chainOrder === prodChainOrder)?.id ?? null;
  }, [environments, prodChainOrder]);

  const productionDeployments = useMemo(() => {
    if (!prodEnvId) return deployments;
    return deployments.filter((d) => d.environmentId === prodEnvId || d.environmentId === undefined);
  }, [deployments, prodEnvId]);

  const onDeploy = async () => {
    if (!id) return;
    try {
      const r = await triggerDeploy(id);
      toast.success(`Deploy queued — job ${r.jobId.slice(0, 8)}…`);
      navigate(`/projects/${id}/deploy/${r.jobId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Deploy failed");
    }
  };

  const onRollback = async () => {
    if (!id) return;
    try {
      const r = await rollback(id);
      toast.success(`Rollback queued — job ${r.jobId.slice(0, 8)}…`);
      navigate(`/projects/${id}/deploy/${r.jobId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rollback failed");
    }
  };

  const onDeployToDev = async () => {
    if (!id) return;
    const dev = [...environments].sort((a, b) => a.chainOrder - b.chainOrder)[0];
    if (!dev) {
      toast.error("No development environment configured");
      return;
    }
    try {
      const r = await triggerDeploy(id, dev.id);
      toast.success(`Dev deploy queued — job ${r.jobId.slice(0, 8)}…`);
      navigate(`/projects/${id}/deploy/${r.jobId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Deploy failed");
    }
  };

  if (loading) {
    return (
      <div className="w-full space-y-6">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="w-full space-y-4">
        <p className="text-sm text-muted-foreground">This project could not be loaded. It may have been removed or the response was invalid.</p>
        <Link
          to="/"
          className="inline-flex min-w-[2.25rem] items-center justify-center rounded-lg border border-border/50 bg-card/60 px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Back to overview
        </Link>
      </div>
    );
  }

  const active = productionDeployments.find((d) => d.status === "ACTIVE");
  const deploying = id ? getDeployingDeployment(id, productionDeployments) : undefined;
  const displayStatus = deploying
    ? "DEPLOYING"
    : active
      ? "ACTIVE"
      : productionDeployments[0]?.status === "FAILED"
        ? "FAILED"
        : productionDeployments[0]?.status === "ROLLED_BACK"
          ? "ROLLED_BACK"
          : "PENDING";

  const liveHostPort = active ? active.port : null;
  const liveUrl = liveHostPort != null ? publicServiceUrl(liveHostPort) : null;
  const totalDeploys = productionDeployments.length;
  const lastDeploy = productionDeployments[0];

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Link
            to="/"
            className="mt-1 inline-flex min-w-[2.25rem] items-center justify-center rounded-lg border border-border/50 bg-card/60 px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Back
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
              <StatusBadge status={displayStatus} />
            </div>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <a
                href={project.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="block font-mono text-xs text-primary hover:underline"
              >
                {project.repoUrl.replace(/^https?:\/\/(www\.)?/, "")} (open in new tab)
              </a>
              <p className="font-mono text-xs">
                Branch <code className="rounded bg-muted/50 px-1.5 py-0.5">{project.branch}</code>
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void onDeploy()}>Deploy</Button>
          <Button variant="secondary" onClick={() => void onRollback()}>
            Rollback
          </Button>
          <Button type="button" variant="outline" className="border-destructive/35 text-destructive hover:bg-destructive/10" onClick={() => setDeleteOpen(true)}>
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/50 bg-card/60 ring-1 ring-border/25">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Live URL</p>
            {liveUrl ? (
              <a href={liveUrl} target="_blank" rel="noreferrer" className="mt-1 block truncate font-mono text-sm text-primary hover:underline">
                {liveUrl.replace(/^https?:\/\//, "")}
              </a>
            ) : (
              <span className="mt-1 block text-sm text-muted-foreground/60">Not deployed</span>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/60 ring-1 ring-border/25">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">App port (container)</p>
            <p className="mt-1 font-mono text-sm tabular-nums">{project.appPort}</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/60 ring-1 ring-border/25">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Total deploys</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">{totalDeploys}</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/60 ring-1 ring-border/25">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Last deploy</p>
            <p className="mt-1 text-sm">{lastDeploy ? timeAgo(lastDeploy.createdAt) : "Never"}</p>
          </CardContent>
        </Card>
      </div>

      {deployments.length > 0 || jobs.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-border/50 bg-card/50 ring-1 ring-border/25">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Deployments by status</CardTitle>
              <CardDescription>Version history for this project.</CardDescription>
            </CardHeader>
            <CardContent>
              <DonutChart data={deploymentPie} emptyLabel="No deployments" />
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50 ring-1 ring-border/25">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Jobs by status</CardTitle>
              <CardDescription>Recent runs (up to 25 loaded).</CardDescription>
            </CardHeader>
            <CardContent>
              {jobs.length > 0 ? (
                <DonutChart data={jobsByStatus} emptyLabel="No jobs" />
              ) : (
                <div className="flex h-52 items-center justify-center rounded-lg border border-dashed border-border/50 text-sm text-muted-foreground">
                  No jobs yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {environments.length > 0 ? (
        <EnvironmentChain
          projectId={project.id}
          environments={environments}
          onRefresh={async () => {
            await load();
          }}
          onDeployToDev={async () => {
            await onDeployToDev();
          }}
        />
      ) : null}

      <BlueGreenTrafficCard
        project={project}
        deployments={productionDeployments}
        active={active}
        deploying={deploying}
        liveHostPort={liveHostPort}
        liveUrl={liveUrl}
        onCopy={copyText}
      />

      <Card className="border-border/50 bg-card/60 ring-1 ring-border/25">
        <CardHeader>
          <CardTitle className="text-base">Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <span className="text-xs text-muted-foreground">Health path</span>
              <p className="mt-0.5 font-mono text-sm">
                <code className="rounded bg-muted/50 px-1.5 py-0.5">{project.healthPath}</code>
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Build context</span>
              <p className="mt-0.5 font-mono text-sm">
                <code className="rounded bg-muted/50 px-1.5 py-0.5">{project.buildContext}</code>
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Host port range</span>
              <p className="mt-0.5 font-mono text-sm">
                <code className="rounded bg-muted/50 px-1.5 py-0.5">
                  {project.basePort}–{project.basePort + 1}
                </code>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 ring-1 ring-border/30">
        <CardHeader>
          <CardTitle>Jobs</CardTitle>
          <CardDescription>Deploy and rollback runs. Open a row for streamed logs.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="pl-6">Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="pr-6 text-right">Logs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No jobs yet. Deploy to generate logs.
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((job) => (
                  <TableRow key={job.id} className="border-border/40">
                    <TableCell className="pl-6 font-mono text-sm">{job.type}</TableCell>
                    <TableCell>
                      <Badge variant={job.status === "FAILED" ? "destructive" : "secondary"} className="font-mono text-xs">
                        {job.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{job.startedAt ? timeAgo(job.startedAt) : "—"}</TableCell>
                    <TableCell className="pr-6 text-right">
                      <Link to={`/projects/${project.id}/deploy/${job.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                        View log
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 ring-1 ring-border/30">
        <CardHeader>
          <CardTitle>Deployments</CardTitle>
          <CardDescription>Each row is one version. The host port is what you open in the browser for that color slot.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="pl-6">Ver</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Slot</TableHead>
                <TableHead>Host port</TableHead>
                <TableHead>App port</TableHead>
                <TableHead>Container</TableHead>
                <TableHead className="pr-6">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deployments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No deployments yet. Run Deploy above.
                  </TableCell>
                </TableRow>
              ) : (
                deployments.map((d) => {
                  const hp = d.port;
                  const u = publicServiceUrl(hp);
                  return (
                    <TableRow key={d.id} className="border-border/40">
                      <TableCell className="pl-6 font-mono">v{d.version}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.environment?.name ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <StatusBadge status={d.status} />
                          {d.errorMessage ? (
                            <span className="max-w-[200px] truncate text-xs text-red-400" title={d.errorMessage ?? ""}>
                              {d.errorMessage}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <SlotBadge color={d.color} />
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        <a href={u} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          {hp}
                        </a>
                      </TableCell>
                      <TableCell className="font-mono text-sm tabular-nums">{project.appPort}</TableCell>
                      <TableCell className="max-w-[180px] truncate font-mono text-xs text-muted-foreground">{d.containerName}</TableCell>
                      <TableCell className="pr-6 text-sm text-muted-foreground">{timeAgo(d.createdAt)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Separator className="opacity-40" />

      <DeleteProjectDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        projectId={project.id}
        projectName={project.name}
        navigateTo="/"
      />

      <Link to="/" className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}>
        Back to overview
      </Link>
    </div>
  );
}
