import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getProject } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";

type Crumb = { label: string; to?: string };

function crumbsForPath(pathname: string, projectName: string | null): Crumb[] {
  if (pathname === "/" || pathname === "") return [{ label: "Overview" }];
  if (pathname === "/activity") return [{ label: "Overview", to: "/" }, { label: "Activity" }];
  if (pathname === "/projects") return [{ label: "Overview", to: "/" }, { label: "Projects" }];
  if (pathname === "/system") return [{ label: "Overview", to: "/" }, { label: "System health" }];
  if (pathname === "/settings") return [{ label: "Overview", to: "/" }, { label: "Settings" }];

  const deployM = pathname.match(/^\/projects\/([^/]+)\/deploy\/([^/]+)$/);
  if (deployM) {
    const pid = deployM[1];
    return [
      { label: "Overview", to: "/" },
      { label: "Projects", to: "/projects" },
      { label: projectName ?? "Project", to: `/projects/${pid}` },
      { label: "Deploy log" },
    ];
  }
  const projM = pathname.match(/^\/projects\/([^/]+)$/);
  if (projM) {
    const pid = projM[1];
    return [
      { label: "Overview", to: "/" },
      { label: "Projects", to: "/projects" },
      { label: projectName ?? `Project ${pid.slice(0, 8)}` },
    ];
  }
  return [{ label: "Overview", to: "/" }, { label: pathname }];
}

export function SidebarBreadcrumbs() {
  const { pathname } = useLocation();
  const { state: sidebarState } = useSidebar();
  const [projectName, setProjectName] = useState<string | null>(null);

  useEffect(() => {
    const m = pathname.match(/^\/projects\/([^/]+)/);
    if (!m?.[1]) {
      queueMicrotask(() => setProjectName(null));
      return;
    }
    let cancelled = false;
    void getProject(m[1])
      .then((r) => {
        if (!cancelled) setProjectName(r.project.name);
      })
      .catch(() => {
        if (!cancelled) setProjectName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const crumbs = useMemo(() => crumbsForPath(pathname, projectName), [pathname, projectName]);
  const visible = sidebarState === "collapsed" ? crumbs.slice(-1) : crumbs;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground",
        sidebarState === "collapsed" && "justify-center"
      )}
    >
      {visible.map((c, i) => (
        <span key={`${c.label}-${i}`} className="flex items-center gap-1">
          {i > 0 ? <span className="text-border">/</span> : null}
          {c.to ? (
            <Link
              to={c.to}
              className="truncate text-sidebar-foreground/80 underline-offset-2 hover:text-sidebar-foreground hover:underline"
            >
              {c.label}
            </Link>
          ) : (
            <span className="truncate font-medium text-sidebar-foreground">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
