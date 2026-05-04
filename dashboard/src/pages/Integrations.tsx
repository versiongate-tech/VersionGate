import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Cable, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ApiError,
  getGithubInstallation,
  getGithubIntegrationStatus,
  type GithubInstallationSummary,
} from "@/lib/api";
import { Separator } from "@/components/ui/separator";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const MANAGE_APP_HREF = "https://github.com/apps/VersionGate-App/installations";
const INSTALL_HREF = "/api/auth/github/install";
/** Central relay — GitHub App "Callback URL" (fixed for all self-hosted instances). */
const GITHUB_APP_RELAY_CALLBACK = "https://versiongate.tech/api/github/callback";

export function Integrations() {
  const [searchParams, setSearchParams] = useSearchParams();

  /** Until first `/api/github/installation` response — avoid flashing Connect vs Connected. */
  const [gateReady, setGateReady] = useState(false);
  const [primaryInstallation, setPrimaryInstallation] = useState<GithubInstallationSummary | null>(null);
  const [installationsList, setInstallationsList] = useState<GithubInstallationSummary[]>([]);
  const [gateError, setGateError] = useState<string | null>(null);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setGateReady(false);
      setGateError(null);
      try {
        const r = await getGithubInstallation();
        if (cancelled) return;
        setPrimaryInstallation(r.installation);
        setInstallationsList(r.installations);
      } catch (e) {
        if (!cancelled) {
          setGateError(e instanceof ApiError ? e.message : "Failed to load GitHub installation.");
          setPrimaryInstallation(null);
          setInstallationsList([]);
        }
      } finally {
        if (!cancelled) setGateReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Optional avatar when GitHub App credentials exist on the server (does not affect connected/disconnected). */
  useEffect(() => {
    if (!primaryInstallation) {
      setAvatarUrl(null);
      return;
    }
    let cancelled = false;
    void getGithubIntegrationStatus()
      .then((s) => {
        if (cancelled) return;
        setAvatarUrl(s.installation?.avatarUrl ?? null);
      })
      .catch(() => {
        if (!cancelled) setAvatarUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [primaryInstallation?.installationId]);

  const githubQuery = useMemo(() => {
    const g = searchParams.get("github");
    return g ? g.trim().toLowerCase() : null;
  }, [searchParams]);

  const webhookUrlHint = useMemo(
    () => (typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/github` : ""),
    []
  );

  useEffect(() => {
    if (!githubQuery) return;
    const messages: Record<string, { type: "success" | "error"; text: string }> = {
      connected: { type: "success", text: "GitHub App connected successfully." },
      auth_required: {
        type: "error",
        text: "Could not link the installation — sign in to VersionGate and try again.",
      },
      config: { type: "error", text: "GitHub App is not configured on this server." },
      missing_installation: { type: "error", text: "Missing installation from GitHub redirect." },
      bad_installation: { type: "error", text: "Could not read installation details from GitHub." },
      bad_state: {
        type: "error",
        text: "Install state does not match this instance — check PUBLIC_URL and GITHUB_STATE_SECRET match the relay.",
      },
    };
    const m = messages[githubQuery];
    if (m) {
      if (m.type === "success") toast.success(m.text);
      else toast.error(m.text);
    }
    setSearchParams({}, { replace: true });
  }, [githubQuery, setSearchParams]);

  const connected = primaryInstallation !== null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <PageHeader
        title="Integrations"
        description="Connect external services to streamline project setup and automation."
      />

      <Alert className="border-border/80 bg-muted/20">
        <AlertTitle>GitHub App URLs (self-hosted)</AlertTitle>
        <AlertDescription className="space-y-2 text-muted-foreground [&_p]:text-sm">
          <p>
            The GitHub App <strong className="text-foreground">Callback URL</strong> is fixed for every instance — register this relay on GitHub → App → General:
          </p>
          <code className="block max-w-full overflow-x-auto break-all rounded-md bg-background px-2 py-1.5 font-mono text-xs text-foreground">
            {GITHUB_APP_RELAY_CALLBACK}
          </code>
          <p>
            Set <strong className="text-foreground">Webhook URL</strong> to your instance (same host as{" "}
            <span className="font-mono text-xs">PUBLIC_URL</span> in <span className="font-mono text-xs">.env</span>), for example:
          </p>
          {webhookUrlHint ? (
            <code className="block max-w-full overflow-x-auto break-all rounded-md bg-background px-2 py-1.5 font-mono text-xs text-foreground">
              {webhookUrlHint}
            </code>
          ) : null}
          <p>
            Use <strong className="text-foreground">Connect GitHub</strong> below while signed in so the installation is linked to your account when GitHub sends you back via the relay.
          </p>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Cable className="size-5 opacity-80" aria-hidden />
                GitHub
              </CardTitle>
              <CardDescription>
                Install the VersionGate GitHub App to list repositories and deploy on push.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {!gateReady ? (
            <div className="space-y-4" aria-busy="true" aria-label="Loading GitHub integration">
              <div className="flex items-center gap-4">
                <Skeleton className="size-14 shrink-0 rounded-full" />
                <div className="grid min-w-0 flex-1 gap-2">
                  <Skeleton className="h-5 w-48 max-w-full" />
                  <Skeleton className="h-4 w-72 max-w-full" />
                  <Skeleton className="h-4 w-40 max-w-full" />
                </div>
              </div>
              <Skeleton className="h-9 w-full max-w-xs rounded-lg" />
            </div>
          ) : gateError ? (
            <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {gateError}
            </div>
          ) : connected && primaryInstallation ? (
            <>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  <Avatar size="lg" className="size-14 border border-border">
                    {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
                    <AvatarFallback className="bg-muted text-lg font-semibold">
                      {primaryInstallation.githubAccountLogin.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-mono text-base font-semibold text-foreground">
                        {primaryInstallation.githubAccountLogin}
                      </p>
                      <Badge className="font-normal">Connected</Badge>
                      <Badge variant="outline" className="font-normal capitalize">
                        {primaryInstallation.githubAccountType}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Installation ID <span className="font-mono">{primaryInstallation.installationId}</span>
                    </p>
                    {installationsList.length > 1 ? (
                      <p className="text-xs text-muted-foreground">
                        + {installationsList.length - 1} other installation
                        {installationsList.length > 2 ? "s" : ""} linked to your account
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <a
                    href={MANAGE_APP_HREF}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "inline-flex gap-1.5")}
                  >
                    <ExternalLink className="size-3.5" />
                    Manage on GitHub
                  </a>
                  <a href={INSTALL_HREF} className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
                    Add another org
                  </a>
                </div>
              </div>
              {installationsList.length > 1 ? (
                <>
                  <Separator />
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      All installations
                    </p>
                    <ul className="grid gap-2 text-sm">
                      {installationsList.map((i) => (
                        <li
                          key={i.installationId}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
                        >
                          <span className="font-mono font-medium">{i.githubAccountLogin}</span>
                          <span className="text-xs capitalize text-muted-foreground">{i.githubAccountType}</span>
                          <span className="font-mono text-xs text-muted-foreground">{i.installationId}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Connect your GitHub account or organization so VersionGate can read repositories you grant access to.
              </p>
              <a href={INSTALL_HREF} className={cn(buttonVariants())}>
                Connect GitHub
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        After connecting, use{" "}
        <Link className="text-primary underline-offset-2 hover:underline" to="/projects">
          New project
        </Link>{" "}
        to pick a repository and branch.
      </p>
    </div>
  );
}
