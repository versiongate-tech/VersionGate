import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAllDeployments, getProjects, type Deployment, type Project } from "@/lib/api";
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

export function Projects() {
  const launchCreate = useLaunchCreateProject();
  const [projects, setProjects] = useState<Project[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [p, d] = await Promise.all([getProjects(), getAllDeployments()]);
      setProjects(p.projects);
      setDeployments(d.deployments);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Projects"
        description="All registered applications, current rollout state, service URL, and delete."
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
        <div className="rounded-xl border border-border/60 bg-card/40 ring-1 ring-border/25">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Service link</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((proj) => {
                const state = projectDeploymentStatus(proj.id, deployments);
                const disp = getDisplayDeployment(proj.id, deployments);
                const url =
                  disp && (disp.status === "ACTIVE" || disp.status === "DEPLOYING")
                    ? publicServiceUrl(disp.port)
                    : null;
                return (
                  <TableRow key={proj.id}>
                    <TableCell className="font-medium">
                      <Link to={`/projects/${proj.id}`} className="text-primary hover:underline">
                        {proj.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={state} />
                    </TableCell>
                    <TableCell>
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                        >
                          {url}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          to={`/projects/${proj.id}`}
                          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                        >
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
        </div>
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
