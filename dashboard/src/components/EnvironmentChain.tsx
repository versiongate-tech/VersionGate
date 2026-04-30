import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import {
  promoteEnvironment,
  type EnvironmentSummary,
} from "@/lib/api";

function ChainArrow() {
  return (
    <div className="flex shrink-0 items-center justify-center text-muted-foreground/60" aria-hidden>
      <svg width="28" height="24" viewBox="0 0 28 24" className="hidden sm:block">
        <path
          d="M4 12h16m-4-4 4 4-4 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="sm:hidden text-lg leading-none">↓</span>
    </div>
  );
}

export interface EnvironmentChainProps {
  projectId: string;
  environments: EnvironmentSummary[];
  onRefresh: () => Promise<void>;
  /** Deploy/build for the leftmost environment in the chain (not always named “development”). */
  onDeployToEnvironment: (environmentId: string) => Promise<void>;
}

export function EnvironmentChain({
  projectId,
  environments,
  onRefresh,
  onDeployToEnvironment,
}: EnvironmentChainProps) {
  const navigate = useNavigate();
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const sorted = [...environments].sort((a, b) => a.chainOrder - b.chainOrder);

  const onPromote = async (targetEnvId: string, sourceEnvId: string) => {
    setPromotingId(targetEnvId);
    try {
      const r = await promoteEnvironment(projectId, targetEnvId, sourceEnvId);
      toast.success(`Promotion queued — job ${r.jobId.slice(0, 8)}…`);
      await onRefresh();
      navigate(`/projects/${projectId}/deploy/${r.jobId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Promotion failed");
    } finally {
      setPromotingId(null);
    }
  };

  if (sorted.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        <strong className="text-foreground/80">Promote</strong> reuses the upstream Docker image (no rebuild).{" "}
        <span className="font-mono text-[0.7rem] opacity-80">POST /projects/…/environments/:id/promote</span>
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-stretch">
        {sorted.map((env, index) => {
          const upstream = index > 0 ? sorted[index - 1] : null;
          const upstreamActive = upstream?.activeDeployment?.status === "ACTIVE";
          const active = env.activeDeployment;
          const showPromote = index > 0;
          const promoteDisabled = !upstreamActive || promotingId !== null;

          return (
            <div key={env.id} className="flex flex-1 min-w-[200px] flex-col gap-3 sm:flex-row sm:items-stretch">
              {index > 0 ? <ChainArrow /> : null}
              <Card className="flex-1 border-border/40 bg-background/40">
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-sm font-medium">{env.name}</CardTitle>
                    {active ? <StatusBadge status={active.status} /> : <StatusBadge status="PENDING" />}
                  </div>
                  <CardDescription className="font-mono text-xs">
                    Branch {env.branch} · host ports {env.basePort}–{env.basePort + 1}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {active ? (
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>
                        <span className="text-foreground/80">Version</span>{" "}
                        <span className="font-mono tabular-nums">v{active.version}</span>
                      </p>
                      <p className="truncate font-mono" title={active.imageTag}>
                        {active.imageTag}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No deployment yet.</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {index === 0 ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void onDeployToEnvironment(env.id)}
                      >
                        Deploy to {env.name}
                      </Button>
                    ) : null}
                    {showPromote ? (
                      <Button
                        size="sm"
                        disabled={promoteDisabled}
                        onClick={() => upstream && void onPromote(env.id, upstream.id)}
                        title={
                          !upstreamActive
                            ? `Wait until ${upstream?.name ?? "upstream"} has an ACTIVE deployment`
                            : undefined
                        }
                      >
                        {promotingId === env.id ? (
                          <>
                            <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
                            Promoting…
                          </>
                        ) : (
                          "Promote"
                        )}
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
