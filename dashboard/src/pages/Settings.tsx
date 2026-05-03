import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  applyNginxSite,
  applySelfUpdateFromSettings,
  checkSelfUpdateFromSettings,
  enableSelfUpdateFromSettings,
  getInstanceSettings,
  getSelfUpdateSettings,
  getSetupStatus,
  patchInstanceEnv,
  requestCertbotSsl,
  type InstanceSettings,
  type SelfUpdateSettingsResponse,
  type SetupStatus,
} from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DonutChart } from "@/components/charts/DonutChart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Globe } from "lucide-react";

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[minmax(0,200px)_1fr] sm:items-baseline sm:gap-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm text-foreground">{value}</dd>
    </div>
  );
}

function boolBadge(ok: boolean, yes = "Yes", no = "No") {
  return (
    <Badge variant={ok ? "default" : "secondary"} className="font-mono text-xs">
      {ok ? yes : no}
    </Badge>
  );
}

const textareaClass = cn(
  "min-h-[72px] w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm text-foreground shadow-none outline-none",
  "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "disabled:cursor-not-allowed disabled:opacity-50"
);

function normalizeBasePathInput(raw: string): string {
  let p = raw.trim();
  if (!p || p === "/") return "/";
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

function looksLikeIpv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host.trim());
}

export function Settings() {
  const [instance, setInstance] = useState<InstanceSettings | null>(null);
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [envDraft, setEnvDraft] = useState<Record<string, string>>({});
  const [envSaving, setEnvSaving] = useState(false);
  const [selfUpdate, setSelfUpdate] = useState<SelfUpdateSettingsResponse | null>(null);
  const [suOpts, setSuOpts] = useState({ branch: "", pollMs: "", autoApply: "false" });
  const [suBusy, setSuBusy] = useState<"enable" | "check" | "apply" | "saveOpts" | null>(null);
  const [publicDomainDraft, setPublicDomainDraft] = useState("");
  const [publicBasePathDraft, setPublicBasePathDraft] = useState("/");
  const [certbotEmailDraft, setCertbotEmailDraft] = useState("");
  const [publicUrlSaving, setPublicUrlSaving] = useState(false);
  const [nginxApplying, setNginxApplying] = useState(false);
  const [certbotRunning, setCertbotRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [i, s] = await Promise.all([getInstanceSettings(), getSetupStatus()]);
        if (cancelled) return;
        setInstance(i);
        setSetup(s);
        setPublicDomainDraft(i.publicDomain ?? "");
        setPublicBasePathDraft(i.publicBasePath ?? "/");
        setCertbotEmailDraft(i.certbotEmail ?? "");

        try {
          const su = await getSelfUpdateSettings();
          if (cancelled) return;
          setSelfUpdate(su);
          setSuOpts({
            branch: su.branch,
            pollMs: su.pollMs > 0 ? String(su.pollMs) : "",
            autoApply: su.autoApply ? "true" : "false",
          });
        } catch {
          const fallback: SelfUpdateSettingsResponse = {
            configured: i.selfUpdateConfigured,
            branch: i.selfUpdateGitBranch,
            pollMs: i.selfUpdatePollMs,
            autoApply: i.selfUpdateAutoApply,
            git: null,
          };
          if (!cancelled) {
            setSelfUpdate(fallback);
            setSuOpts({
              branch: fallback.branch,
              pollMs: fallback.pollMs > 0 ? String(fallback.pollMs) : "",
              autoApply: fallback.autoApply ? "true" : "false",
            });
          }
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#application-updates") {
      window.requestAnimationFrame(() => {
        document
          .getElementById("application-updates")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  const checkSummary = useMemo(() => {
    if (!instance) return [];
    const checks = [
      instance.databaseUrlInEnvFile,
      instance.databaseUrlLoaded,
      instance.databaseReachable,
      instance.encryptionKeyConfigured,
      instance.geminiConfigured,
      !instance.needsRestart,
    ];
    const pass = checks.filter(Boolean).length;
    return [
      { name: "Pass", value: pass },
      { name: "Attention", value: checks.length - pass },
    ];
  }, [instance]);

  const publicUrlPreview = useMemo(() => {
    const host = publicDomainDraft.trim().toLowerCase();
    const path = normalizeBasePathInput(publicBasePathDraft);
    if (!host) return null;
    const proto = looksLikeIpv4(host) ? "http" : "https";
    const origin = `${proto}://${host}`;
    return path === "/" ? origin : `${origin}${path}`;
  }, [publicDomainDraft, publicBasePathDraft]);

  const setEnvField = (key: string, value: string) => {
    setEnvDraft((d) => ({ ...d, [key]: value }));
  };

  const refreshSelfUpdate = async () => {
    try {
      const su = await getSelfUpdateSettings();
      setSelfUpdate(su);
      setSuOpts({
        branch: su.branch,
        pollMs: su.pollMs > 0 ? String(su.pollMs) : "",
        autoApply: su.autoApply ? "true" : "false",
      });
    } catch {
      const i = await getInstanceSettings();
      setInstance(i);
      const fallback: SelfUpdateSettingsResponse = {
        configured: i.selfUpdateConfigured,
        branch: i.selfUpdateGitBranch,
        pollMs: i.selfUpdatePollMs,
        autoApply: i.selfUpdateAutoApply,
        git: null,
      };
      setSelfUpdate(fallback);
      setSuOpts({
        branch: fallback.branch,
        pollMs: fallback.pollMs > 0 ? String(fallback.pollMs) : "",
        autoApply: fallback.autoApply ? "true" : "false",
      });
      setPublicDomainDraft(i.publicDomain ?? "");
      setPublicBasePathDraft(i.publicBasePath ?? "/");
      setCertbotEmailDraft(i.certbotEmail ?? "");
      return;
    }
    const i = await getInstanceSettings();
    setInstance(i);
    setPublicDomainDraft(i.publicDomain ?? "");
    setPublicBasePathDraft(i.publicBasePath ?? "/");
    setCertbotEmailDraft(i.certbotEmail ?? "");
  };

  const onEnableSelfUpdate = async () => {
    setSuBusy("enable");
    try {
      const r = await enableSelfUpdateFromSettings();
      toast.success(r.message);
      await refreshSelfUpdate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to enable");
    } finally {
      setSuBusy(null);
    }
  };

  const onCheckSelfUpdate = async () => {
    setSuBusy("check");
    try {
      const g = await checkSelfUpdateFromSettings();
      setSelfUpdate((prev) => (prev ? { ...prev, git: g } : prev));
      if (g.message) toast.warning(g.message);
      else if (g.behind) toast.info("A newer revision is available on the remote.");
      else toast.success("Already up to date.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check failed");
    } finally {
      setSuBusy(null);
    }
  };

  const onApplySelfUpdate = async () => {
    if (!window.confirm("Pull latest code, rebuild the dashboard, and reload PM2? The UI may disconnect briefly.")) {
      return;
    }
    setSuBusy("apply");
    try {
      const r = await applySelfUpdateFromSettings();
      if (r.ok) {
        toast.success("Update applied — PM2 reload scheduled. Refresh this page in a few seconds.");
        await refreshSelfUpdate();
      } else {
        toast.error(r.error ?? "Update failed", {
          description: r.steps?.length ? r.steps.slice(-3).join(" → ") : undefined,
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSuBusy(null);
    }
  };

  const onSaveSelfUpdateOpts = async (e: React.FormEvent) => {
    e.preventDefault();
    const env: Record<string, string> = {};
    const b = suOpts.branch.trim();
    const p = suOpts.pollMs.trim();
    if (b) env.SELF_UPDATE_GIT_BRANCH = b;
    if (p !== "") env.SELF_UPDATE_POLL_MS = p;
    env.SELF_UPDATE_AUTO_APPLY = suOpts.autoApply;
    if (Object.keys(env).length === 0) {
      toast.error("Set at least one option.");
      return;
    }
    setSuBusy("saveOpts");
    try {
      const r = await patchInstanceEnv(env);
      toast.success(r.message);
      await refreshSelfUpdate();
      if (suOpts.autoApply === "true") {
        const ms = p === "" ? 0 : Number.parseInt(p, 10);
        if (!Number.isFinite(ms) || ms <= 0) {
          toast.info("Polling is off", {
            description:
              "SELF_UPDATE_AUTO_APPLY only runs after a poll finds commits behind. Set SELF_UPDATE_POLL_MS (e.g. 300000) to enable automatic checks.",
          });
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSuBusy(null);
    }
  };

  const onSavePublicUrlEnv = async (e: React.FormEvent) => {
    e.preventDefault();
    const domain = publicDomainDraft.trim().toLowerCase();
    const basePath = normalizeBasePathInput(publicBasePathDraft);
    const email = certbotEmailDraft.trim();
    const env: Record<string, string> = {};
    if (domain) env.PUBLIC_DOMAIN = domain;
    env.PUBLIC_BASE_PATH = basePath;
    if (email) env.CERTBOT_EMAIL = email;
    if (Object.keys(env).length === 0) {
      toast.error("Enter a public hostname, base path, or Certbot email.");
      return;
    }
    setPublicUrlSaving(true);
    try {
      const r = await patchInstanceEnv(env);
      toast.success(r.message);
      const i = await getInstanceSettings();
      setInstance(i);
      setPublicDomainDraft(i.publicDomain ?? "");
      setPublicBasePathDraft(i.publicBasePath ?? "/");
      setCertbotEmailDraft(i.certbotEmail ?? "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save public URL");
    } finally {
      setPublicUrlSaving(false);
    }
  };

  const onApplyNginxSite = async () => {
    const domain = publicDomainDraft.trim().toLowerCase();
    if (!domain) {
      toast.error("Enter a public hostname (or save PUBLIC_DOMAIN to .env first).");
      return;
    }
    setNginxApplying(true);
    try {
      const r = await applyNginxSite({
        publicDomain: domain,
        publicBasePath: normalizeBasePathInput(publicBasePathDraft),
      });
      toast.success(r.message);
      const i = await getInstanceSettings();
      setInstance(i);
      setPublicDomainDraft(i.publicDomain ?? "");
      setPublicBasePathDraft(i.publicBasePath ?? "/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nginx apply failed");
    } finally {
      setNginxApplying(false);
    }
  };

  const onRunCertbotSsl = async () => {
    const domain = publicDomainDraft.trim().toLowerCase();
    if (looksLikeIpv4(domain)) {
      toast.error("Let's Encrypt needs a DNS hostname, not an IP address.");
      return;
    }
    if (!certbotEmailDraft.trim()) {
      toast.error("Enter a Let's Encrypt contact email (saved with public URL or below).");
      return;
    }
    setCertbotRunning(true);
    try {
      const r = await requestCertbotSsl({ email: certbotEmailDraft.trim() });
      toast.success(r.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Certbot failed");
    } finally {
      setCertbotRunning(false);
    }
  };

  const onSaveEnv = async (e: React.FormEvent) => {
    e.preventDefault();
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(envDraft)) {
      const t = v.trim();
      if (t) env[k] = t;
    }
    if (Object.keys(env).length === 0) {
      toast.error("Enter at least one value to write.");
      return;
    }
    setEnvSaving(true);
    try {
      const r = await patchInstanceEnv(env);
      toast.success(r.message);
      setEnvDraft({});
      const [i, s] = await Promise.all([getInstanceSettings(), getSetupStatus()]);
      setInstance(i);
      setSetup(s);
      setPublicDomainDraft(i.publicDomain ?? "");
      setPublicBasePathDraft(i.publicBasePath ?? "/");
      setCertbotEmailDraft(i.certbotEmail ?? "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update .env");
    } finally {
      setEnvSaving(false);
    }
  };

  if (loading || !instance || !setup) {
    return (
      <div className="w-full max-w-4xl space-y-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const selfUpdateSafe: SelfUpdateSettingsResponse =
    selfUpdate ?? {
      configured: instance.selfUpdateConfigured,
      branch: instance.selfUpdateGitBranch,
      pollMs: instance.selfUpdatePollMs,
      autoApply: instance.selfUpdateAutoApply,
      git: null,
    };

  return (
    <div className="w-full max-w-4xl space-y-10">
      <PageHeader
        title="System settings"
        description="Manage instance configuration, self-update, and environment variables. Secret values are never read back from the API."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/80 bg-card shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle>Instance summary</CardTitle>
            <CardDescription>Engine build, runtime mode, and paths used by the control plane.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-3">
              <Row label="Engine version" value={instance.engineVersion} />
              <Row label="Node environment" value={instance.nodeEnv} />
              <Row label="API listen port" value={String(instance.apiPort)} />
              <Row label="Docker network" value={instance.dockerNetwork} />
              <Row label="Projects root" value={instance.projectsRootPath} />
              <Row label="Nginx config path" value={instance.nginxConfigPath} />
              <Row label="Public hostname" value={instance.publicDomain || "—"} />
              <Row label="Public base path" value={instance.publicBasePath || "/"} />
              <Row
                label="Prisma schema sync"
                value={
                  instance.prismaSchemaSync === "migrate"
                    ? "migrate (migrate deploy with fallback)"
                    : "push (db push only)"
                }
              />
            </dl>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/60 ring-1 ring-border/30">
          <CardHeader>
            <CardTitle className="text-base">Health checks</CardTitle>
            <CardDescription>Six binary signals from the API.</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart data={checkSummary} />
          </CardContent>
        </Card>
      </div>

      <Card id="public-url" className="border-border/50 bg-card/60 ring-1 ring-border/30 scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="size-5 text-muted-foreground" aria-hidden />
            Public URL and HTTPS
          </CardTitle>
          <CardDescription>
            Same options as setup: deploy behind a hostname (and optional path like{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs">/versiongate</code>). Point DNS at this server, then apply nginx and run Certbot for TLS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertTitle>DNS</AlertTitle>
            <AlertDescription>
              Add an <strong>A</strong> record for your hostname to this server&apos;s public IPv4 (cloud panel or{" "}
              <code className="rounded bg-muted px-1 font-mono text-xs">curl -4 ifconfig.me</code> on the host). Propagation must finish before
              Let&apos;s Encrypt can validate.
            </AlertDescription>
          </Alert>

          <form onSubmit={(e) => void onSavePublicUrlEnv(e)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Public hostname</p>
                <Input
                  placeholder="example.com"
                  value={publicDomainDraft}
                  onChange={(e) => setPublicDomainDraft(e.target.value)}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">Hostname or IPv4 for HTTP. TLS requires a hostname.</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">URL base path</p>
                <Input
                  placeholder="/ or /versiongate"
                  value={publicBasePathDraft}
                  onChange={(e) => setPublicBasePathDraft(e.target.value)}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">A leading slash is added if you omit it.</p>
              </div>
            </div>
            <div className="space-y-2 sm:max-w-md">
              <p className="text-sm font-medium text-foreground">Let&apos;s Encrypt contact email</p>
              <Input
                type="email"
                placeholder="you@example.com"
                value={certbotEmailDraft}
                onChange={(e) => setCertbotEmailDraft(e.target.value)}
                autoComplete="email"
              />
            </div>
            {publicUrlPreview ? (
              <p className="text-sm text-muted-foreground">
                Preview:&nbsp;
                <span className="font-mono text-foreground">{publicUrlPreview}</span>
              </p>
            ) : null}
            {normalizeBasePathInput(publicBasePathDraft) !== "/" ? (
              <p className="rounded-md border border-amber-300/80 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                Subpath URLs need the dashboard built with the same Vite <code className="font-mono text-xs">base</code>; otherwise static assets may
                break. Using <code className="font-mono text-xs">/</code> is simplest.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={publicUrlSaving}>
                {publicUrlSaving ? "Saving…" : "Save to .env"}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={nginxApplying} onClick={() => void onApplyNginxSite()}>
                {nginxApplying ? "Applying…" : "Write nginx config & reload"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  certbotRunning ||
                  looksLikeIpv4(publicDomainDraft) ||
                  !publicDomainDraft.trim() ||
                  !certbotEmailDraft.trim()
                }
                onClick={() => void onRunCertbotSsl()}
              >
                {certbotRunning ? "Certbot…" : "Obtain SSL (certbot --nginx)"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Suggested order:</span> save hostname and email → DNS A record → write nginx (HTTP on port 80) →
              Certbot. Certbot reads <code className="rounded bg-muted px-1 font-mono">PUBLIC_DOMAIN</code> from <code className="rounded bg-muted px-1 font-mono">.env</code>
              — use Save or nginx apply first. Requires <code className="rounded bg-muted px-1 font-mono">certbot</code> and permission to reload nginx on the host.
            </p>
          </form>
        </CardContent>
      </Card>

      <Card id="application-updates" className="border-border/50 bg-card/60 ring-1 ring-border/30 scroll-mt-24">
        <CardHeader>
          <CardTitle>Application updates</CardTitle>
          <CardDescription>
            Pull new VersionGate commits from git, install dependencies, run migrations, rebuild the dashboard, and reload PM2.
            No GitHub OAuth — this only updates <span className="font-medium text-foreground">this</span> server&apos;s clone. A random
            webhook token is created when you enable self-update (stored in <code className="rounded bg-muted px-1 font-mono text-xs">.env</code>,
            never shown again). Anyone who can open Settings can trigger an update — protect the dashboard network.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={selfUpdateSafe.configured ? "default" : "secondary"} className="font-mono text-xs">
              {selfUpdateSafe.configured ? "Self-update enabled" : "Not enabled"}
            </Badge>
            {!selfUpdateSafe.configured ? (
              <Button type="button" size="sm" disabled={suBusy !== null} onClick={() => void onEnableSelfUpdate()}>
                {suBusy === "enable" ? "Enabling…" : "Enable in-dashboard updates"}
              </Button>
            ) : null}
          </div>

          {selfUpdateSafe.configured ? (
            <>
              <dl className="space-y-3">
                <Row label="Tracked branch" value={selfUpdateSafe.branch} />
                <Row label="Poll interval (ms)" value={selfUpdateSafe.pollMs > 0 ? String(selfUpdateSafe.pollMs) : "off"} />
                <Row label="Auto-apply on poll" value={boolBadge(selfUpdateSafe.autoApply, "Yes", "No")} />
              </dl>
              {selfUpdateSafe.git ? (
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                  <p className="font-mono text-xs text-muted-foreground">
                    Local{" "}
                    <span className="text-foreground">
                      {selfUpdateSafe.git.currentCommit ? selfUpdateSafe.git.currentCommit.slice(0, 7) : "—"}
                    </span>
                    {selfUpdateSafe.git.remoteCommit ? (
                      <>
                        {" "}
                        · remote <span className="text-foreground">{selfUpdateSafe.git.remoteCommit.slice(0, 7)}</span>
                      </>
                    ) : null}
                  </p>
                  {selfUpdateSafe.git.message ? (
                    <p className="mt-1 text-amber-800">{selfUpdateSafe.git.message}</p>
                  ) : selfUpdateSafe.git.behind ? (
                    <p className="mt-1 text-foreground">Remote is ahead — you can update.</p>
                  ) : selfUpdateSafe.git.isGitRepo ? (
                    <p className="mt-1 text-muted-foreground">Up to date with origin.</p>
                  ) : (
                    <p className="mt-1 text-muted-foreground">Not a git checkout — use your image or package pipeline.</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Run “Check for updates” to compare with origin.</p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={suBusy !== null} onClick={() => void onCheckSelfUpdate()}>
                  {suBusy === "check" ? "Checking…" : "Check for updates"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    suBusy !== null || !selfUpdateSafe.git?.isGitRepo || !selfUpdateSafe.git.behind || Boolean(selfUpdateSafe.git.message)
                  }
                  onClick={() => void onApplySelfUpdate()}
                >
                  {suBusy === "apply" ? "Updating…" : "Update and restart PM2"}
                </Button>
              </div>

              <Separator className="bg-border/50" />

              <form onSubmit={(e) => void onSaveSelfUpdateOpts(e)} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Options are written to <code className="rounded bg-muted px-1 font-mono text-xs">.env</code>.{" "}
                  <strong className="font-medium text-foreground">Auto-apply only runs when polling is on:</strong> set{" "}
                  <code className="rounded bg-muted px-1 font-mono text-xs">SELF_UPDATE_POLL_MS</code> to a positive number
                  (milliseconds), for example <code className="rounded bg-muted px-1 font-mono text-xs">300000</code> for five
                  minutes. <code className="rounded bg-muted px-1 font-mono text-xs">0</code> disables the poll loop (use
                  Check / Update buttons or webhook instead). Polling uses the generated secret; larger intervals mean fewer{" "}
                  <code className="rounded bg-muted px-1 font-mono text-xs">git fetch</code> calls.
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="su-branch">
                      SELF_UPDATE_GIT_BRANCH
                    </label>
                    <Input
                      id="su-branch"
                      value={suOpts.branch}
                      onChange={(e) => setSuOpts((o) => ({ ...o, branch: e.target.value }))}
                      placeholder="main"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="su-poll">
                      SELF_UPDATE_POLL_MS
                    </label>
                    <Input
                      id="su-poll"
                      value={suOpts.pollMs}
                      onChange={(e) => setSuOpts((o) => ({ ...o, pollMs: e.target.value }))}
                      placeholder="0 = off"
                      inputMode="numeric"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="su-auto">
                      SELF_UPDATE_AUTO_APPLY
                    </label>
                    <select
                      id="su-auto"
                      value={suOpts.autoApply}
                      onChange={(e) => setSuOpts((o) => ({ ...o, autoApply: e.target.value }))}
                      className="h-8 w-full rounded-lg border border-input bg-muted/40 px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <option value="false">false</option>
                      <option value="true">true</option>
                    </select>
                  </div>
                </div>
                <Button type="submit" size="sm" variant="secondary" disabled={suBusy !== null}>
                  {suBusy === "saveOpts" ? "Saving…" : "Save self-update options"}
                </Button>
              </form>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Enable to generate <code className="rounded bg-muted px-1 font-mono text-xs">SELF_UPDATE_SECRET</code> and unlock
              check/apply actions. You can still use <code className="rounded bg-muted px-1 font-mono text-xs">bun run self-update</code>{" "}
              from SSH without this.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/60 ring-1 ring-border/30">
        <CardHeader>
          <CardTitle>Environment and database</CardTitle>
          <CardDescription>Connection state is checked live. Values such as DATABASE_URL are stored in the server .env file.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Setup wizard status</h3>
            <dl className="space-y-3">
              <Row label="Configured" value={boolBadge(setup.configured)} />
              <Row label="Database reachable" value={boolBadge(setup.dbConnected)} />
              <Row label="Process needs restart" value={boolBadge(setup.needsRestart, "Yes — restart API", "No")} />
            </dl>
            {setup.needsRestart ? (
              <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-200/90">
                The .env file contains <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">DATABASE_URL</code>, but
                this API process has not loaded it yet. Restart the API and worker (for example{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">pm2 restart versiongate-api versiongate-worker</code>
                ).
              </p>
            ) : null}
          </div>

          <Separator className="bg-border/50" />

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Runtime checks</h3>
            <dl className="space-y-3">
              <Row label="DATABASE_URL in .env file" value={boolBadge(instance.databaseUrlInEnvFile)} />
              <Row label="DATABASE_URL loaded in process" value={boolBadge(instance.databaseUrlLoaded)} />
              <Row label="Database responds" value={boolBadge(instance.databaseReachable)} />
              <Row label="ENCRYPTION_KEY set" value={boolBadge(instance.encryptionKeyConfigured)} />
              <Row label="GEMINI_API_KEY set" value={boolBadge(instance.geminiConfigured)} />
            </dl>
          </div>

          <Separator className="bg-border/50" />

          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p>
              The first-time wizard at <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/setup</code> applies when
              the database is not yet configured.
            </p>
            <p>
              Project-specific variables for deployed apps are configured per project in the database and injected into
              containers at deploy time — not in the server .env editor below.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/60 ring-1 ring-border/30">
        <CardHeader>
          <CardTitle>Update server environment (.env)</CardTitle>
          <CardDescription>
            Merges only the fields you fill in. Existing lines are replaced by key; new keys are appended. A backup is written to{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env.bak</code>. Restart the API and worker after
            saving.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onSaveEnv(e)} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="env-database-url">
                DATABASE_URL
              </label>
              <textarea
                id="env-database-url"
                value={envDraft.DATABASE_URL ?? ""}
                onChange={(e) => setEnvField("DATABASE_URL", e.target.value)}
                className={textareaClass}
                placeholder="postgresql://…"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="env-direct-database-url">
                DIRECT_DATABASE_URL{" "}
                <span className="font-normal text-muted-foreground/80">(optional, Neon unpooled)</span>
              </label>
              <textarea
                id="env-direct-database-url"
                value={envDraft.DIRECT_DATABASE_URL ?? ""}
                onChange={(e) => setEnvField("DIRECT_DATABASE_URL", e.target.value)}
                className={textareaClass}
                placeholder="postgresql://…-direct… or non-pooler host — used only for prisma migrate deploy on startup/self-update"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                When set, migrate runs against this URL so advisory locks work. Keep <code className="rounded bg-muted px-1 font-mono text-[0.7rem]">DATABASE_URL</code> as the
                pooler for the app.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="env-enc">
                  ENCRYPTION_KEY
                </label>
                <Input
                  id="env-enc"
                  type="password"
                  value={envDraft.ENCRYPTION_KEY ?? ""}
                  onChange={(e) => setEnvField("ENCRYPTION_KEY", e.target.value)}
                  placeholder="64-char hex"
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="env-gemini">
                  GEMINI_API_KEY
                </label>
                <Input
                  id="env-gemini"
                  type="password"
                  value={envDraft.GEMINI_API_KEY ?? ""}
                  onChange={(e) => setEnvField("GEMINI_API_KEY", e.target.value)}
                  placeholder="Optional"
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="env-gemini-model">
                GEMINI_MODEL
              </label>
              <Input
                id="env-gemini-model"
                value={envDraft.GEMINI_MODEL ?? ""}
                onChange={(e) => setEnvField("GEMINI_MODEL", e.target.value)}
                placeholder="gemini-2.5-pro"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="env-docker">
                  DOCKER_NETWORK
                </label>
                <Input
                  id="env-docker"
                  value={envDraft.DOCKER_NETWORK ?? ""}
                  onChange={(e) => setEnvField("DOCKER_NETWORK", e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="env-nginx">
                  NGINX_CONFIG_PATH
                </label>
                <Input
                  id="env-nginx"
                  value={envDraft.NGINX_CONFIG_PATH ?? ""}
                  onChange={(e) => setEnvField("NGINX_CONFIG_PATH", e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="env-projects">
                PROJECTS_ROOT_PATH
              </label>
              <Input
                id="env-projects"
                value={envDraft.PROJECTS_ROOT_PATH ?? ""}
                onChange={(e) => setEnvField("PROJECTS_ROOT_PATH", e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="env-prisma">
                  PRISMA_SCHEMA_SYNC
                </label>
                <select
                  id="env-prisma"
                  value={envDraft.PRISMA_SCHEMA_SYNC ?? ""}
                  onChange={(e) => setEnvField("PRISMA_SCHEMA_SYNC", e.target.value)}
                  className="h-8 w-full rounded-lg border border-input bg-muted/40 px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="">Leave unchanged</option>
                  <option value="migrate">migrate</option>
                  <option value="push">push</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="env-log">
                  LOG_LEVEL
                </label>
                <Input
                  id="env-log"
                  value={envDraft.LOG_LEVEL ?? ""}
                  onChange={(e) => setEnvField("LOG_LEVEL", e.target.value)}
                  placeholder="info"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="env-port">
                  PORT
                </label>
                <Input
                  id="env-port"
                  value={envDraft.PORT ?? ""}
                  onChange={(e) => setEnvField("PORT", e.target.value)}
                  placeholder="9090"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="env-monix">
                  MONIX_PORT
                </label>
                <Input
                  id="env-monix"
                  value={envDraft.MONIX_PORT ?? ""}
                  onChange={(e) => setEnvField("MONIX_PORT", e.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2 sm:col-span-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="env-monix-path">
                  MONIX_PATH
                </label>
                <Input
                  id="env-monix-path"
                  value={envDraft.MONIX_PATH ?? ""}
                  onChange={(e) => setEnvField("MONIX_PATH", e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="submit" disabled={envSaving}>
                {envSaving ? "Saving…" : "Save configuration"}
              </Button>
              <Button type="button" variant="secondary" disabled={envSaving} onClick={() => setEnvDraft({})}>
                Discard changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/40 bg-destructive/5 shadow-sm">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            VersionGate does not expose a remote &quot;destroy instance&quot; API. Removing the engine requires SSH access to stop
            PM2, remove files, and optionally drop the database.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="destructive"
            onClick={() =>
              toast.info("Host uninstall is manual", {
                description:
                  "Stop versiongate-api / versiongate-worker, delete the install directory, and clean Docker resources on the server.",
              })
            }
          >
            Uninstall guidance
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
