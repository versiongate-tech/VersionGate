import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { getSetupStatus } from "@/lib/api";

export function SetupGuard() {
  const [status, setStatus] = useState<"loading" | "configured" | "needs-setup">("loading");

  useEffect(() => {
    let cancelled = false;
    getSetupStatus()
      .then((s) => {
        if (!cancelled) setStatus(s.configured && s.dbConnected ? "configured" : "needs-setup");
      })
      .catch(() => {
        if (!cancelled) setStatus("configured");
      });
    return () => { cancelled = true; };
  }, []);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (status === "needs-setup") {
    return <Navigate to="/setup" replace />;
  }

  return <Outlet />;
}
