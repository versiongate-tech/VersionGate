import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { useEffect, useState } from "react";
import { getProjects, getServerStats, getSetupStatus, type Project } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CreateProjectModal } from "@/components/CreateProjectModal";
import { CreateProjectLaunchContext } from "@/create-project-launch";
import { SidebarBreadcrumbs } from "@/components/SidebarBreadcrumbs";

const nav = [
  { to: "/", label: "Overview", end: true },
  { to: "/projects", label: "Projects", end: true },
  { to: "/activity", label: "Activity", end: false },
  { to: "/system", label: "System health", end: false },
  { to: "/settings", label: "Settings", end: false },
] as const;

const navBtn =
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm text-sidebar-foreground ring-sidebar-ring outline-hidden transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground [&>span:last-child]:truncate";

export function Layout() {
  const navigate = useNavigate();
  const [serverOk, setServerOk] = useState(true);
  const [setupGate, setSetupGate] = useState<"loading" | "ready">("loading");
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getSetupStatus()
      .then((s) => {
        if (cancelled) return;
        const incomplete = !s.configured || !s.dbConnected || (s.needsRestart ?? false);
        if (incomplete) {
          navigate("/setup", { replace: true });
        }
        setSetupGate("ready");
      })
      .catch(() => {
        if (!cancelled) setSetupGate("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await getServerStats();
        if (!cancelled) setServerOk(s.status === "ok" || s.status === "unavailable");
      } catch {
        if (!cancelled) setServerOk(false);
      }
    };
    void tick();
    const id = window.setInterval(tick, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadProjects = async () => {
      try {
        const r = await getProjects();
        if (!cancelled) setProjects(r.projects);
      } catch {
        /* sidebar project list is non-critical */
      }
    };
    void loadProjects();
    const id = window.setInterval(() => void loadProjects(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <TooltipProvider>
      <CreateProjectLaunchContext.Provider value={() => setCreateProjectOpen(true)}>
        <SidebarProvider>
          <Sidebar collapsible="icon" className="border-r border-sidebar-border/80">
            <SidebarHeader className="border-b border-sidebar-border">
              <div className="space-y-2 px-3 py-3">
                <span className="font-semibold tracking-tight text-sidebar-foreground group-data-[collapsible=icon]:hidden">
                  VersionGate
                </span>
                <SidebarBreadcrumbs />
              </div>
            </SidebarHeader>
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Navigate</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {nav.map((item) => (
                      <SidebarMenuItem key={item.to}>
                        <NavLink
                          to={item.to}
                          end={item.end}
                          className={({ isActive }) =>
                            cn(
                              navBtn,
                              isActive &&
                                "bg-sidebar-accent font-medium text-sidebar-primary data-[active=true]:bg-sidebar-accent"
                            )
                          }
                        >
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuItem>
                    ))}
                    <SidebarMenuItem>
                      <button type="button" className={navBtn} onClick={() => setCreateProjectOpen(true)}>
                        <span>New project</span>
                      </button>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {projects.length > 0 && (
                <SidebarGroup>
                  <SidebarGroupLabel>Projects</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {projects.map((p) => (
                        <SidebarMenuItem key={p.id}>
                          <NavLink
                            to={`/projects/${p.id}`}
                            className={({ isActive }) =>
                              cn(
                                navBtn,
                                isActive && "bg-sidebar-accent font-medium text-sidebar-primary"
                              )
                            }
                          >
                            <span className="truncate">{p.name}</span>
                            <span className="ml-auto text-[10px] uppercase text-muted-foreground">Open</span>
                          </NavLink>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              )}
            </SidebarContent>
            <SidebarRail />
          </Sidebar>
          <SidebarInset className="min-h-svh bg-background">
            <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background px-4">
              <div className="flex items-center gap-3">
                <SidebarTrigger className="lg:hidden" />
                <span className="text-sm font-medium tracking-wide text-muted-foreground">Control plane</span>
                <Separator orientation="vertical" className="h-5" />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span
                    className={cn(
                      "inline-block size-2 rounded-full shadow-[0_0_6px_currentColor]",
                      serverOk ? "bg-emerald-400 text-emerald-400" : "bg-red-400 text-red-400"
                    )}
                    title={serverOk ? "API reachable" : "API issue"}
                  />
                  <span className="hidden text-xs sm:inline">{serverOk ? "Connected" : "Disconnected"}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreateProjectOpen(true)}
                className="inline-flex h-8 items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              >
                <span className="hidden sm:inline">New project</span>
                <span className="sm:hidden">Add</span>
              </button>
            </header>
            <div className="flex w-full min-w-0 flex-1 flex-col gap-4 px-4 py-4 md:px-6 md:py-6 lg:px-8">
              {setupGate === "loading" ? (
                <div className="flex flex-1 items-center justify-center text-muted-foreground">Loading…</div>
              ) : (
                <Outlet />
              )}
            </div>
            <CreateProjectModal
              open={createProjectOpen}
              onOpenChange={setCreateProjectOpen}
              onCreated={() => {
                void getProjects()
                  .then((r) => setProjects(r.projects))
                  .catch(() => {
                    /* sidebar project list is non-critical */
                  });
              }}
            />
          </SidebarInset>
        </SidebarProvider>
      </CreateProjectLaunchContext.Provider>
      <Toaster position="top-center" richColors theme="dark" />
    </TooltipProvider>
  );
}
