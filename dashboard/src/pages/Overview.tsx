import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertCircle, FolderKanban, Loader2, Plus } from "lucide-react";
import { getAllDeployments, getProjects, triggerDeploy, type Deployment, type Project } from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLaunchCreateProject } from "@/create-project-launch";

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

function lastDeployed(projectId: string, deployments: Deployment[]): string {
  const mine = deployments
    .filter((d) => d.projectId === projectId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const top = mine[0];
  if (!top) return "—";
  return new Date(top.createdAt).toLocaleString();
}

export function Overview() {
  const launchCreate = useLaunchCreateProject();
  const [projects, setProjects] = useState<Project[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [p, d] = await Promise.all([getProjects(), getAllDeployments()]);
      setProjects(p.projects);
      setDeployments(d.deployments);
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
    return {
      total: projects.length,
      running,
      failed,
      deploying,
    };
  }, [projects, deployments]);

  const onDeploy = async (projectId: string) => {
    try {
      const r = await triggerDeploy(projectId);
      toast.success(`Deploy queued — job ${r.jobId}`);
      void load();
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
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Overview"
        description="Fleet status and deployments. Connect a repo to get started."
        actions={
          <Button onClick={launchCreate} className="gap-2 shadow-lg shadow-primary/10">
            <Plus className="size-4" />
            Add project
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total projects" value={stats.total} icon={FolderKanban} />
        <StatCard
          label="Running"
          value={stats.running}
          icon={Activity}
          valueClassName="text-emerald-400"
          iconClassName="text-emerald-400/80"
        />
        <StatCard
          label="Failed"
          value={stats.failed}
          icon={AlertCircle}
          valueClassName="text-red-400"
          iconClassName="text-red-400/80"
        />
        <StatCard
          label="Deploying"
          value={stats.deploying}
          icon={Loader2}
          valueClassName="text-cyan-400"
          iconClassName="text-cyan-400/80"
        />
      </div>

      {projects.length === 0 ? (
        <Card className="border-dashed border-border/60 bg-card/40">
          <CardHeader className="text-center sm:text-left">
            <CardTitle>No projects yet</CardTitle>
            <CardDescription>
              Add a Git repository to deploy with blue/green rollouts and zero-downtime swaps.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center gap-4 pb-10 sm:flex-row sm:pb-8">
            <Button size="lg" onClick={launchCreate} className="gap-2">
              <Plus className="size-5" />
              Create your first project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50 bg-card/60 shadow-none ring-1 ring-border/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle>Projects</CardTitle>
              <CardDescription>Latest status per service</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="pl-6">Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last deployed</TableHead>
                  <TableHead className="pr-6 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p) => (
                  <TableRow key={p.id} className="border-border/40">
                    <TableCell className="pl-6 font-medium">{p.name}</TableCell>
                    <TableCell>
                      <StatusBadge status={projectStatus(p.id, deployments)} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{lastDeployed(p.id, deployments)}</TableCell>
                    <TableCell className="pr-6 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => void onDeploy(p.id)}>
                          Deploy
                        </Button>
                        <Link
                          to={`/projects/${p.id}`}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          View
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
