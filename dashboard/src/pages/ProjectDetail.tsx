import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getDeployments,
  getProject,
  rollback,
  triggerDeploy,
  type Deployment,
  type Project,
} from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/PageHeader";
import { ExternalLink } from "lucide-react";

export function ProjectDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [p, d] = await Promise.all([getProject(id), getDeployments(id)]);
      setProject(p.project);
      setDeployments(d.deployments);
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

  const active = deployments.find((d) => d.status === "ACTIVE");
  const displayStatus = deployments.some((d) => d.status === "DEPLOYING")
    ? "DEPLOYING"
    : active
      ? "ACTIVE"
      : deployments[0]?.status === "FAILED"
        ? "FAILED"
        : deployments[0]?.status === "ROLLED_BACK"
          ? "ROLLED_BACK"
          : "PENDING";

  const onDeploy = async () => {
    if (!id) return;
    try {
      const r = await triggerDeploy(id);
      toast.success(`Deploy queued — job ${r.jobId}`);
      navigate(`/projects/${id}/deploy/${r.jobId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Deploy failed");
    }
  };

  const onRollback = async () => {
    if (!id) return;
    try {
      const r = await rollback(id);
      toast.success(`Rollback queued — job ${r.jobId}`);
      navigate(`/projects/${id}/deploy/${r.jobId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rollback failed");
    }
  };

  if (loading || !project) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title={project.name}
        description={project.repoUrl}
        actions={
          <>
            <a
              href={project.repoUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5" })}
            >
              <ExternalLink className="size-3.5" />
              Repo
            </a>
            <Button onClick={() => void onDeploy()}>Deploy</Button>
            <Button variant="secondary" onClick={() => void onRollback()}>
              Rollback
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">Branch</span>
        <code className="rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 font-mono text-xs">{project.branch}</code>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">Ports</span>
        <code className="rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 font-mono text-xs">
          {project.basePort}–{project.basePort + 1}
        </code>
        <StatusBadge status={displayStatus} />
      </div>

      <Card className="border-border/50 bg-card/50 ring-1 ring-border/30">
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
          <CardDescription>Environment progression (visual only).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 text-sm">
          {(["dev", "staging", "prod"] as const).map((env, i) => (
            <span key={env} className="flex items-center gap-2">
              {i > 0 ? <span className="text-muted-foreground">→</span> : null}
              <span className="rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 font-medium capitalize text-muted-foreground">
                {env}
              </span>
            </span>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 ring-1 ring-border/30">
        <CardHeader>
          <CardTitle>Deployment history</CardTitle>
          <CardDescription>Recent builds and rollouts for this project.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="pl-6">Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Container</TableHead>
                <TableHead>Port</TableHead>
                <TableHead className="pr-6">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deployments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No deployments yet. Run a deploy to see history here.
                  </TableCell>
                </TableRow>
              ) : (
                deployments.map((d) => (
                  <TableRow key={d.id} className="border-border/40">
                    <TableCell className="pl-6 font-mono">v{d.version}</TableCell>
                    <TableCell>
                      <StatusBadge status={d.status} />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{d.containerName}</TableCell>
                    <TableCell>{d.port}</TableCell>
                    <TableCell className="pr-6 text-sm text-muted-foreground">
                      {new Date(d.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Separator className="opacity-40" />
      <Link to="/" className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}>
        ← Back to overview
      </Link>
    </div>
  );
}
