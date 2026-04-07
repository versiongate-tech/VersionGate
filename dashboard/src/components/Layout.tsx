import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
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
import { LayoutDashboard, Server, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { getServerStats, getSetupStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/server", label: "Server", icon: Server, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

const navBtn =
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm text-sidebar-foreground ring-sidebar-ring outline-hidden transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate";

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [serverOk, setServerOk] = useState(true);
  const [setupGate, setSetupGate] = useState<"loading" | "ready">("loading");

  useEffect(() => {
    if (location.pathname === "/setup") {
      setSetupGate("ready");
      return;
    }
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
  }, [location.pathname, navigate]);

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
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b border-sidebar-border">
            <div className="flex items-center gap-2 px-2 py-1">
              <SidebarTrigger className="-ml-1" />
              <span className="font-semibold tracking-tight group-data-[collapsible=icon]:hidden">VG</span>
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
                              "bg-sidebar-accent font-medium text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent"
                          )
                        }
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </NavLink>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
            <span className="text-lg font-bold tracking-tight">VERSIONGATE</span>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span
                className={`inline-block size-2.5 rounded-full ${serverOk ? "bg-emerald-500" : "bg-red-500"}`}
                title={serverOk ? "Server reachable" : "Server issue"}
              />
              <span className="hidden sm:inline">API</span>
            </div>
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4">
            {setupGate === "loading" && location.pathname !== "/setup" ? (
              <div className="flex flex-1 items-center justify-center text-muted-foreground">
                Loading…
              </div>
            ) : (
              <Outlet />
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
      <Toaster />
    </TooltipProvider>
  );
}
