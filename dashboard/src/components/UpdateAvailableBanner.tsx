import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { applySelfUpdateFromSettings, getSelfUpdateSettings } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";

const POLL_MS = 120_000;
const DISMISS_KEY = "vg-update-banner-dismissed";
const TOAST_PREFIX = "vg-update-toast-remote-";

/**
 * Shows when self-update is enabled and origin is ahead of local (e.g. after merging to the tracked branch).
 * Polls the same endpoint Settings uses; apply matches Settings → Application updates.
 */
export function UpdateAvailableBanner() {
  const [show, setShow] = useState(false);
  const [branch, setBranch] = useState("");
  const [remoteTip, setRemoteTip] = useState("");
  const [localTip, setLocalTip] = useState("");
  const [applying, setApplying] = useState(false);
  const dismissedRef = useRef(sessionStorage.getItem(DISMISS_KEY) === "1");

  const poll = useCallback(async () => {
    try {
      const su = await getSelfUpdateSettings();
      if (!su.configured || !su.git?.isGitRepo || su.git.message) {
        setShow(false);
        return;
      }
      const behind = su.git.behind;
      const remote = su.git.remoteCommit ?? "";
      const local = su.git.currentCommit ?? "";
      setBranch(su.branch);
      setRemoteTip(remote);
      setLocalTip(local);

      if (!behind) {
        sessionStorage.removeItem(DISMISS_KEY);
        dismissedRef.current = false;
        setShow(false);
        return;
      }

      const toastKey = remote ? `${TOAST_PREFIX}${remote.slice(0, 40)}` : "";
      if (toastKey && !sessionStorage.getItem(toastKey)) {
        sessionStorage.setItem(toastKey, "1");
        toast.info("Application update available", {
          description: `New commits on ${su.branch}. You can apply from the banner or Settings.`,
          duration: 10_000,
        });
      }

      setShow(!dismissedRef.current);
    } catch {
      setShow(false);
    }
  }, []);

  useEffect(() => {
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(id);
  }, [poll]);

  const onDismiss = () => {
    dismissedRef.current = true;
    sessionStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  const onApply = async () => {
    if (
      !window.confirm(
        "Pull latest code, rebuild the dashboard, and reload PM2? The UI may disconnect briefly."
      )
    ) {
      return;
    }
    setApplying(true);
    try {
      const r = await applySelfUpdateFromSettings();
      if (r.ok) {
        toast.success("Update applied — PM2 reload scheduled. Refresh this page in a few seconds.");
        dismissedRef.current = false;
        sessionStorage.removeItem(DISMISS_KEY);
        await poll();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setApplying(false);
    }
  };

  if (!show) return null;

  return (
    <div className="border-b border-amber-500/25 bg-amber-500/10 px-4 py-3 md:px-6">
      <Alert className="border-amber-500/35 bg-amber-500/5">
        <AlertTitle className="text-amber-950 dark:text-amber-100">Update available</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 text-amber-950/85 dark:text-amber-100/90">
          <p>
            This server&apos;s clone is behind <span className="font-medium text-foreground">origin/{branch}</span>
            {remoteTip ? (
              <>
                {" "}
                (remote <span className="font-mono text-xs">{remoteTip.slice(0, 7)}</span>
                {localTip ? (
                  <>
                    {" "}
                    vs local <span className="font-mono text-xs">{localTip.slice(0, 7)}</span>
                  </>
                ) : null}
                ).
              </>
            ) : (
              "."
            )}{" "}
            Merge on GitHub is detected after the next check (or open Settings and run &quot;Check for updates&quot;).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={applying} onClick={() => void onApply()}>
              {applying ? "Applying…" : "Apply update now"}
            </Button>
            <Link
              to="/settings#application-updates"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Open Settings
            </Link>
            <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
