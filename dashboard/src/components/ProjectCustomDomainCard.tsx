import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  attachProjectDomain,
  issueProjectDomainSsl,
  listProjectDomains,
  removeProjectDomain,
  type ProjectDomain,
} from "@/lib/api";
import { toast } from "sonner";

interface ProjectCustomDomainCardProps {
  projectId: string;
  onUpdated?: () => void;
}

export function ProjectCustomDomainCard({ projectId, onUpdated }: ProjectCustomDomainCardProps) {
  const [domains, setDomains] = useState<ProjectDomain[]>([]);
  const [expectedIpv4, setExpectedIpv4] = useState<string | null>(null);
  const [resolvedPort, setResolvedPort] = useState<number | null>(null);
  const [hostnameDraft, setHostnameDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sslRunning, setSslRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listProjectDomains(projectId);
      setDomains(data.domains);
      setExpectedIpv4(data.expectedIpv4);
      setResolvedPort(data.resolvedPort);
      setHostnameDraft(data.domains[0]?.hostname ?? "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load custom domains");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const primary = domains[0];

  const onSave = async () => {
    const host = hostnameDraft.trim().toLowerCase();
    if (!host) {
      toast.error("Enter a hostname");
      return;
    }
    if (primary) {
      toast.error("Remove the current domain before attaching a different hostname");
      return;
    }
    setSaving(true);
    try {
      await attachProjectDomain(projectId, host);
      toast.success("Custom domain attached — point DNS A record to this server");
      await load();
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not attach domain");
    } finally {
      setSaving(false);
    }
  };

  const onRemove = async () => {
    if (!primary) return;
    setSaving(true);
    try {
      await removeProjectDomain(projectId, primary.id);
      toast.success("Custom domain removed");
      setHostnameDraft("");
      await load();
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove domain");
    } finally {
      setSaving(false);
    }
  };

  const onSsl = async () => {
    if (!primary) return;
    setSslRunning(true);
    try {
      await issueProjectDomainSsl(projectId, primary.id);
      toast.success("TLS certificate issued");
      await load();
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Certbot failed");
      await load();
    } finally {
      setSslRunning(false);
    }
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs uppercase tracking-wider">Custom domain (production)</CardTitle>
        <CardDescription className="text-xs">
          Point your hostname at this server with an A record. Works before the first deploy (503 until live).
          Staging domains come later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {expectedIpv4 ? (
          <p className="font-mono text-[11px] text-muted-foreground">
            DNS A record target: <span className="text-foreground">{expectedIpv4}</span>
          </p>
        ) : null}
        {resolvedPort ? (
          <p className="font-mono text-[11px] text-muted-foreground">
            Production container port: <span className="text-foreground">{resolvedPort}</span>
          </p>
        ) : (
          <p className="font-mono text-[11px] text-amber-600 dark:text-amber-400">
            No ACTIVE production deploy yet — domain will return 503 until the first healthy deploy.
          </p>
        )}
        <div className="space-y-2">
          <Input
            placeholder="app.example.com"
            value={hostnameDraft}
            onChange={(e) => setHostnameDraft(e.target.value)}
            disabled={loading || saving || Boolean(primary)}
            autoComplete="off"
          />
          {primary ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px]">{primary.sslStatus}</Badge>
              {primary.dnsOk ? (
                <span className="font-mono text-[10px] text-emerald-600">DNS OK</span>
              ) : (
                <span className="font-mono text-[10px] text-muted-foreground">DNS pending</span>
              )}
              {primary.lastError ? (
                <span className="max-w-full truncate text-[10px] text-red-600" title={primary.lastError}>
                  {primary.lastError}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {!primary ? (
            <Button type="button" size="sm" disabled={saving || loading} onClick={() => void onSave()}>
              {saving ? "Saving…" : "Attach domain"}
            </Button>
          ) : null}
          {primary ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={sslRunning || !primary.dnsOk || primary.sslStatus === "issued"}
                onClick={() => void onSsl()}
              >
                {sslRunning ? "Certbot…" : primary.sslStatus === "issued" ? "SSL active" : "Obtain SSL"}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => void onRemove()}>
                Remove
              </Button>
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
