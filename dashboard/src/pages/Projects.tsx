import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAllDeployments, getInstanceSettings, getProjects, listAllJobs, listProjectDomains, type Deployment, type JobRecord, type Project } from "@/lib/api";
import { projectDeploymentStatus } from "@/lib/project-deployment-status";
import { getActiveDeployment, getDisplayDeployment, guessEnvironmentLabel, publicProjectLiveUrl, setConfiguredPublicHost } from "@/lib/deployment-display";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteProjectDialog } from "@/components/modals/DeleteProjectDialog";
import { toast } from "sonner";
import { useLaunchCreateProject } from "@/create-project-launch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const PAGE_SIZE = 6;

function formatUptime(projectId: string, deployments: Deployment[]): string {
  const active = getActiveDeployment(projectId, deployments);
  if (!active) return "—";
  const sec = Math.max(0, (Date.now() - new Date(active.updatedAt).getTime()) / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function Projects() {
  const launchCreate = useLaunchCreateProject();
  const [projects, setProjects] = useState<Project[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [domainsByProject, setDomainsByProject] = useState<Record<string, { hostname: string; sslStatus: string }[]>>({});
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [page, setPage] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const [p, d, jobs, inst] = await Promise.all([
        getProjects(),
        getAllDeployments(),
        listAllJobs({ limit: 120 }).catch(() => ({ jobs: [] as JobRecord[], total: 0 })),
        getInstanceSettings().catch(() => null),
      ]);
      setConfiguredPublicHost(inst?.publicDomain);
      setProjects(p.projects);
      setDeployments(d.deployments);
      const domainEntries = await Promise.all(
        p.projects.map(async (proj) => {
          try {
            const r = await listProjectDomains(proj.id);
            return [proj.id, r.domains] as const;
          } catch {
            return [proj.id, []] as const;
          }
        })
      );
      setDomainsByProject(Object.fromEntries(domainEntries));
      const m = new Map<string, string>();
      for (const j of jobs.jobs) {
        if (!m.has(j.projectId)) m.set(j.projectId, j.id);
      }
      
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const [searchTerm, setSearchTerm] = useState("");
  const [envFilter, setEnvFilter] = useState("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchName = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.repoUrl.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchName) return false;
      if (envFilter === "ALL") return true;
      const disp = getDisplayDeployment(p.id, deployments);
      const envLabel = disp ? guessEnvironmentLabel(p, disp) : "production";
      return envLabel.toLowerCase() === envFilter.toLowerCase();
    });
  }, [projects, deployments, searchTerm, envFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredProjects.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount - 1);
  const slice = useMemo(() => {
    const start = pageSafe * PAGE_SIZE;
    return filteredProjects.slice(start, start + PAGE_SIZE);
  }, [filteredProjects, pageSafe]);

  useEffect(() => {
    if (page > pageCount - 1) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  return (
    <div className="w-full space-y-8 font-sans">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 border-b border-neutral-800 pb-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Projects</h1>
          <p className="text-sm text-neutral-400">
            Manage your Git-backed zero-downtime application deployments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => launchCreate()} className="bg-white text-black font-semibold hover:bg-neutral-200 text-xs">
            + Deploy Project
          </Button>
        </div>
      </div>

      {/* Toolbar: Search, Filter, View Mode */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative max-w-xs flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500 font-sans">Search</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search projects or repo..."
              className="h-9 w-full rounded-lg border border-neutral-800 bg-black pl-16 pr-3 font-sans text-xs text-white placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none"
            />
          </div>

          <select
            value={envFilter}
            aria-label="Filter projects by environment"
            onChange={(e) => setEnvFilter(e.target.value)}
            className="h-9 rounded-lg border border-neutral-800 bg-[#0a0a0a] px-3 font-sans text-xs text-neutral-300 focus:border-neutral-500 focus:outline-none"
          >
            <option value="ALL">All Environments</option>
            <option value="production">Production</option>
            <option value="staging">Staging</option>
            <option value="development">Development</option>
          </select>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-neutral-800 bg-[#0a0a0a] p-1">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              viewMode === "grid" ? "bg-neutral-900 text-white" : "text-neutral-400 hover:text-white"
            )}
          >
            Grid
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              viewMode === "table" ? "bg-neutral-900 text-white" : "text-neutral-400 hover:text-white"
            )}
          >
            Table
          </button>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl bg-neutral-900" />
      ) : filteredProjects.length === 0 ? (
        <Card className="border-dashed border-neutral-800 bg-[#0a0a0a] rounded-xl">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <p className="font-sans text-sm text-neutral-400">
              No projects found matching your search.
            </p>
            <Button type="button" size="sm" className="bg-white text-black font-semibold hover:bg-neutral-200 text-xs" onClick={() => launchCreate()}>
              Create First Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {viewMode === "grid" ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {slice.map((proj) => {
                const state = projectDeploymentStatus(proj.id, deployments);
                const disp = getDisplayDeployment(proj.id, deployments);
                const port = disp ? disp.port : proj.basePort;
                const envLabel = disp ? guessEnvironmentLabel(proj, disp) : "production";
                const domains = domainsByProject[proj.id] ?? [];
                const url = publicProjectLiveUrl(proj, domains, port);
                return (
                  <Link key={proj.id} to={`/projects/${proj.id}`} className="block group">
                    <Card className="h-full border border-neutral-800 bg-[#0a0a0a] rounded-xl shadow-sm transition-all hover:border-neutral-700">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-base font-semibold text-white group-hover:text-neutral-200">{proj.name}</CardTitle>
                          <StatusBadge status={state} />
                        </div>
                        <CardDescription className="text-xs truncate font-mono text-neutral-400">
                          {url ? url.replace(/^https?:\/\//, "") : "Not deployed"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="mt-4 flex items-center justify-between text-xs text-neutral-500 font-sans">
                          <span>{formatUptime(proj.id, deployments)} uptime</span>
                          <span className="rounded bg-neutral-900 px-2 py-0.5 font-mono text-[10px] text-neutral-400 capitalize">{envLabel}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-neutral-800 bg-[#0a0a0a]">
              <table className="w-full text-left font-sans text-xs">
                <thead className="border-b border-neutral-800 bg-neutral-950 font-mono text-[11px] uppercase text-neutral-400">
                  <tr>
                    <th className="px-4 py-3">Project</th>
                    <th className="px-4 py-3">Environment</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Live URL</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
                  {slice.map((proj) => {
                    const state = projectDeploymentStatus(proj.id, deployments);
                    const disp = getDisplayDeployment(proj.id, deployments);
                    const port = disp ? disp.port : proj.basePort;
                    const envLabel = disp ? guessEnvironmentLabel(proj, disp) : "production";
                    const domains = domainsByProject[proj.id] ?? [];
                    const url = publicProjectLiveUrl(proj, domains, port);
                    return (
                      <tr key={proj.id} className="transition-colors hover:bg-neutral-900/60">
                        <td className="px-4 py-3 font-semibold text-white">
                          <Link to={`/projects/${proj.id}`} className="hover:underline">{proj.name}</Link>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] capitalize text-neutral-400">{envLabel}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={state} />
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px]">
                          {url ? (
                            <a href={url} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
                              {url.replace(/^https?:\/\//, "")}
                            </a>
                          ) : (
                            <span className="text-neutral-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link to={`/projects/${proj.id}`} className={cn(buttonVariants({ variant: "outline", size: "xs" }), "border-neutral-800 font-sans text-xs")}>
                            Manage
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-400">
            <span>Showing {slice.length ? pageSafe * PAGE_SIZE + 1 : 0}–{pageSafe * PAGE_SIZE + slice.length} of {filteredProjects.length}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" className="border-neutral-800 text-xs" disabled={pageSafe <= 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button type="button" variant="outline" size="sm" className="border-neutral-800 text-xs" disabled={pageSafe >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
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
