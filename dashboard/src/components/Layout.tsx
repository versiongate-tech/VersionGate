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
import { LayoutDashboard, Plus, Server, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { getServerStats, getSetupStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CreateProjectModal } from "@/components/CreateProjectModal";
import { CreateProjectLaunchContext } from "@/create-project-launch";

const nav = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/server", label: "Server", icon: Server, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

const navBtn =
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm text-sidebar-foreground ring-sidebar-ring outline-hidden transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate";

export function Layout() {
  const navigate = useNavigate();
  const [serverOk, setServerOk] = useState(true);
  const [setupGate, setSetupGate] = useState<"loading" | "ready">("loading");
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
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

  return (
    <TooltipProvider>
      <CreateProjectLaunchContext.Provider value={() => setCreateProjectOpen(true)}>
        <SidebarProvider>
          <Sidebar collapsible="icon" className="border-r border-sidebar-border/80">
            <SidebarHeader className="border-b border-sidebar-border">
              <div className="flex items-center gap-2 px-2 py-1">
                <SidebarTrigger className="-ml-1" />
                <span className="bg-linear-to-br from-primary to-primary/70 bg-clip-text font-semibold tracking-tight text-transparent group-data-[collapsible=icon]:hidden">
                  VersionGate
                </span>
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
                          <item.icon />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuItem>
                    ))}
                    <SidebarMenuItem>
                      <button type="button" className={navBtn} onClick={() => setCreateProjectOpen(true)}>
                        <Plus />
                        <span>New project</span>
                      </button>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarRail />
          </Sidebar>
          <SidebarInset className="bg-background min-h-svh">
            <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-card/30 px-4 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Control</span>
                <Separator orientation="vertical" className="h-6" />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span
                    className={`inline-block size-2.5 rounded-full shadow-[0_0_8px_currentColor] ${serverOk ? "bg-emerald-400 text-emerald-400" : "bg-red-400 text-red-400"}`}
                    title={serverOk ? "API reachable" : "API issue"}
                  />
                  <span className="hidden sm:inline">API</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreateProjectOpen(true)}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
              >
                <Plus className="size-4" />
                <span className="hidden sm:inline">Add project</span>
              </button>
            </header>
            <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
              {setupGate === "loading" ? (
                <div className="flex flex-1 items-center justify-center text-muted-foreground">
                  Loading…
                </div>
              ) : (
                <Outlet />
              )}
            </div>
            <CreateProjectModal open={createProjectOpen} onOpenChange={setCreateProjectOpen} />
          </SidebarInset>
        </SidebarProvider>
      </CreateProjectLaunchContext.Provider>
      <Toaster position="top-center" richColors theme="dark" />
    </TooltipProvider>
  );
}
