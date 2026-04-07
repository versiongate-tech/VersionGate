import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getDeployments,
  getProject,
  listProjectJobs,
  rollback,
  triggerDeploy,
  type Deployment,
  type JobRecord,
  type Project,
} from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { SlotBadge } from "@/components/SlotBadge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { hostPortForSlot, publicServiceUrl } from "@/lib/deployment-display";

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
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [p, d, j] = await Promise.all([
        getProject(id),
        getDeployments(id),
        listProjectJobs(id, { limit: 25 }),
      ]);
      setProject(p.project);
      setDeployments(d.deployments);
      setJobs(j.jobs);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load project");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load only when project id changes
  }, [id]);

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

  if (loading || !project) {
    return (
      <div className="w-full space-y-6">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  const active = deployments.find((d) => d.status === "ACTIVE");
  const deploying = deployments.find((d) => d.status === "DEPLOYING");
  const displayStatus = deploying
    ? "DEPLOYING"
    : active
      ? "ACTIVE"
      : deployments[0]?.status === "FAILED"
        ? "FAILED"
        : deployments[0]?.status === "ROLLED_BACK"
          ? "ROLLED_BACK"
          : "PENDING";

  const liveHostPort = active ? hostPortForSlot(project, active.color) : null;
  const liveUrl = liveHostPort != null ? publicServiceUrl(liveHostPort) : null;
  const blueUrl = publicServiceUrl(project.basePort);
  const greenUrl = publicServiceUrl(project.basePort + 1);
  const totalDeploys = deployments.length;
  const lastDeploy = deployments[0];

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
          <Button onClick={() => void onDeploy()} className="shadow-lg shadow-primary/10">
            Deploy
          </Button>
          <Button variant="secondary" onClick={() => void onRollback()}>
            Rollback
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

      <Card className="border-border/50 bg-card/60 ring-1 ring-border/25">
        <CardHeader>
          <CardTitle>Traffic slots</CardTitle>
          <CardDescription>
            Blue uses host port <span className="font-mono">{project.basePort}</span>, green uses{" "}
            <span className="font-mono">{project.basePort + 1}</span>. Public traffic follows whichever deployment is{" "}
            <span className="font-medium text-foreground">ACTIVE</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <SlotBadge color="BLUE" />
              {active?.color === "BLUE" && <Badge className="bg-emerald-600/90 text-white hover:bg-emerald-600">LIVE</Badge>}
            </div>
            <p className="font-mono text-sm text-foreground">{blueUrl?.replace(/^https?:\/\//, "")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => blueUrl && copyText(blueUrl, "URL")}>
                Copy URL
              </Button>
              {blueUrl && (
                <a href={blueUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary", size: "sm", className: "h-7 text-xs" })}>
                  Open
                </a>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <SlotBadge color="GREEN" />
              {active?.color === "GREEN" && <Badge className="bg-emerald-600/90 text-white hover:bg-emerald-600">LIVE</Badge>}
            </div>
            <p className="font-mono text-sm text-foreground">{greenUrl?.replace(/^https?:\/\//, "")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => greenUrl && copyText(greenUrl, "URL")}>
                Copy URL
              </Button>
              {greenUrl && (
                <a href={greenUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary", size: "sm", className: "h-7 text-xs" })}>
                  Open
                </a>
              )}
            </div>
          </div>
        </CardContent>
        {liveUrl && active && (
          <CardContent className="border-t border-border/40 pt-4">
            <p className="text-sm text-muted-foreground">
              Current traffic: <SlotBadge color={active.color} /> pointing to{" "}
              <span className="font-mono text-foreground">{liveUrl}</span> (host port{" "}
              <span className="font-mono">{liveHostPort}</span> mapped to container port{" "}
              <span className="font-mono">{project.appPort}</span>).
            </p>
          </CardContent>
        )}
      </Card>

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
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No deployments yet. Run Deploy above.
                  </TableCell>
                </TableRow>
              ) : (
                deployments.map((d) => {
                  const hp = hostPortForSlot(project, d.color);
                  const u = publicServiceUrl(hp);
                  return (
                    <TableRow key={d.id} className="border-border/40">
                      <TableCell className="pl-6 font-mono">v{d.version}</TableCell>
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
      <Link to="/" className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}>
        Back to overview
      </Link>
    </div>
  );
}
