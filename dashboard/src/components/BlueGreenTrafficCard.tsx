import type { Deployment, Project } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SlotBadge } from "@/components/SlotBadge";
import { cn } from "@/lib/utils";
import {
  type DeploymentColor,
  healthCheckUrl,
  latestDeploymentForColor,
  publicServiceUrl,
} from "@/lib/deployment-display";

type SlotPhase = "live" | "deploying" | "idle";

function slotPhase(
  color: DeploymentColor,
  active: Deployment | undefined,
  deploying: Deployment | undefined
): SlotPhase {
  if (active?.color === color) return "live";
  if (deploying?.color === color) return "deploying";
  return "idle";
}

function phaseBadge(phase: SlotPhase): { label: string; className: string } {
  switch (phase) {
    case "live":
      return { label: "Receiving traffic", className: "border-emerald-500/40 bg-emerald-600/15 text-emerald-200" };
    case "deploying":
      return { label: "Deploy in progress", className: "border-amber-500/40 bg-amber-500/15 text-amber-200" };
    default:
      return { label: "Idle slot", className: "border-border/60 bg-muted/25 text-muted-foreground" };
  }
}

function statusLine(d: Deployment | undefined): string | null {
  if (!d) return null;
  if (d.status === "ACTIVE") return `v${d.version} active`;
  if (d.status === "DEPLOYING") return `v${d.version} deploying`;
  if (d.status === "FAILED") return d.errorMessage ? `v${d.version} failed` : `v${d.version} failed`;
  if (d.status === "ROLLED_BACK") return `v${d.version} retired`;
  return `v${d.version} ${d.status.toLowerCase()}`;
}

interface BlueGreenTrafficCardProps {
  project: Project;
  deployments: Deployment[];
  active: Deployment | undefined;
  deploying: Deployment | undefined;
  liveHostPort: number | null;
  liveUrl: string | null;
  onCopy: (text: string, label: string) => void;
}

export function BlueGreenTrafficCard({
  project,
  deployments,
  active,
  deploying,
  liveHostPort,
  liveUrl,
  onCopy,
}: BlueGreenTrafficCardProps) {
  const bluePort = project.basePort;
  const greenPort = project.basePort + 1;
  const blueUrl = publicServiceUrl(bluePort);
  const greenUrl = publicServiceUrl(greenPort);
  const latestBlue = latestDeploymentForColor(deployments, "BLUE");
  const latestGreen = latestDeploymentForColor(deployments, "GREEN");

  const nginxNote =
    "Nginx upstream points at the live slot’s host port. Direct links below hit each slot even when idle.";

  return (
    <Card className="border-border/50 bg-card/60 ring-1 ring-border/25">
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Blue / green slots</CardTitle>
            <CardDescription className="mt-1 max-w-2xl">
              Two fixed host ports per project. A deploy builds into the <span className="font-medium text-foreground">idle</span> slot;
              after the health check passes, traffic switches and the old container is stopped.
            </CardDescription>
          </div>
        </div>

        {/* Traffic flow */}
        <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Traffic flow</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-md border border-border/60 bg-background/80 px-2 py-1 font-mono text-xs">Clients</span>
            <span className="text-muted-foreground" aria-hidden>
              →
            </span>
            <span className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 font-mono text-xs text-violet-200">
              Nginx
            </span>
            <span className="text-muted-foreground" aria-hidden>
              →
            </span>
            {liveHostPort != null && liveUrl ? (
              <span className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2 py-1 font-mono text-xs text-emerald-100">
                :{liveHostPort} ({active?.color ?? "—"})
              </span>
            ) : (
              <span className="rounded-md border border-dashed border-border/60 px-2 py-1 font-mono text-xs text-muted-foreground">
                no active slot yet
              </span>
            )}
            <span className="text-muted-foreground" aria-hidden>
              →
            </span>
            <span className="rounded-md border border-border/60 bg-background/80 px-2 py-1 font-mono text-xs">
              container :{project.appPort}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{nginxNote}</p>
        </div>
      </CardHeader>

      <CardContent className="grid gap-4 sm:grid-cols-2">
        {(
          [
            {
              color: "BLUE" as const,
              port: bluePort,
              url: blueUrl,
              latest: latestBlue,
            },
            {
              color: "GREEN" as const,
              port: greenPort,
              url: greenUrl,
              latest: latestGreen,
            },
          ] as const
        ).map(({ color, port, url, latest }) => {
          const phase = slotPhase(color, active, deploying);
          const pb = phaseBadge(phase);
          const healthUrl = healthCheckUrl(project, port);
          const isLive = phase === "live";
          const isDeploying = phase === "deploying";

          return (
            <div
              key={color}
              className={cn(
                "relative overflow-hidden rounded-xl border p-4 transition-colors",
                color === "BLUE" && "border-sky-500/30 bg-gradient-to-br from-sky-500/[0.07] to-transparent",
                color === "GREEN" && "border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.07] to-transparent",
                isLive && "ring-1 ring-emerald-500/35",
                isDeploying && "ring-1 ring-amber-500/35"
              )}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SlotBadge color={color} />
                  <Badge variant="outline" className={cn("text-[10px] font-semibold uppercase", pb.className)}>
                    {pb.label}
                  </Badge>
                </div>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">host:{port}</span>
              </div>

              <p className="break-all font-mono text-sm text-foreground">{url.replace(/^https?:\/\//, "")}</p>

              <dl className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Docker map</dt>
                  <dd className="font-mono text-right text-foreground">
                    {port} → {project.appPort}
                  </dd>
                </div>
                {latest ? (
                  <>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Last on this slot</dt>
                      <dd className="text-right">
                        <span className="font-mono text-foreground">{statusLine(latest)}</span>
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Container</dt>
                      <dd className="max-w-[min(100%,14rem)] truncate font-mono text-right text-muted-foreground" title={latest.containerName}>
                        {latest.containerName}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Image</dt>
                      <dd className="max-w-[min(100%,14rem)] truncate font-mono text-right text-muted-foreground" title={latest.imageTag}>
                        {latest.imageTag}
                      </dd>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">No deployment has used this slot yet.</p>
                )}
              </dl>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => onCopy(url, "App URL")}>
                  Copy app URL
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => onCopy(healthUrl, "Health URL")}>
                  Copy health URL
                </Button>
                <a href={url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary", size: "sm", className: "h-8 text-xs" })}>
                  Open app
                </a>
                <a
                  href={healthUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ variant: "ghost", size: "sm", className: "h-8 text-xs" })}
                >
                  Health
                </a>
              </div>
            </div>
          );
        })}
      </CardContent>

      {liveUrl && active && (
        <CardContent className="border-t border-border/40 pt-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Live right now:</span>{" "}
            <span className="font-mono text-foreground">{liveUrl}</span>
            <span className="mx-1 text-muted-foreground">·</span>
            slot <SlotBadge color={active.color} />
            <span className="mx-1 text-muted-foreground">·</span>
            host <span className="font-mono">{liveHostPort}</span>
            <span className="mx-1 text-muted-foreground">·</span>
            map <span className="font-mono">{liveHostPort}:{project.appPort}</span>
          </p>
        </CardContent>
      )}
    </Card>
  );
}
