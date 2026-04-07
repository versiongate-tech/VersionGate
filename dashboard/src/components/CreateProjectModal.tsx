import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createProject } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const NAME_PATTERN = /^[a-z0-9-]+$/;

export function CreateProjectModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [buildContext, setBuildContext] = useState(".");
  const [appPort, setAppPort] = useState("3000");
  const [healthPath, setHealthPath] = useState("/health");

  const reset = () => {
    setName("");
    setRepoUrl("");
    setBranch("main");
    setBuildContext(".");
    setAppPort("3000");
    setHealthPath("/health");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim().toLowerCase();
    if (!NAME_PATTERN.test(trimmed)) {
      toast.error("Name must be lowercase letters, numbers, and hyphens only (e.g. my-app).");
      return;
    }
    const port = Number.parseInt(appPort, 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      toast.error("App port must be between 1 and 65535.");
      return;
    }
    setSubmitting(true);
    try {
      const { project } = await createProject({
        name: trimmed,
        repoUrl: repoUrl.trim(),
        branch: branch.trim() || "main",
        buildContext: buildContext.trim() || ".",
        appPort: port,
        healthPath: healthPath.trim() || "/health",
      });
      toast.success("Project created");
      handleOpenChange(false);
      onCreated?.();
      navigate(`/projects/${project.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create project");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Connect a Git repository. Base ports for blue/green deploys are assigned automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-3">
          <div className="grid gap-1.5">
            <label htmlFor="cp-name" className="text-sm font-medium">
              Project name
            </label>
            <Input
              id="cp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-service"
              autoComplete="off"
              required
            />
            <p className="text-xs text-muted-foreground">Lowercase, numbers, hyphens only.</p>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="cp-repo" className="text-sm font-medium">
              Repository URL
            </label>
            <Input
              id="cp-repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/org/repo.git"
              autoComplete="off"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="cp-branch" className="text-sm font-medium">
                Branch
              </label>
              <Input id="cp-branch" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="cp-ctx" className="text-sm font-medium">
                Build context
              </label>
              <Input id="cp-ctx" value={buildContext} onChange={(e) => setBuildContext(e.target.value)} placeholder="." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <label htmlFor="cp-port" className="text-sm font-medium">
                App port
              </label>
              <Input
                id="cp-port"
                inputMode="numeric"
                value={appPort}
                onChange={(e) => setAppPort(e.target.value)}
                placeholder="3000"
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="cp-health" className="text-sm font-medium">
                Health path
              </label>
              <Input id="cp-health" value={healthPath} onChange={(e) => setHealthPath(e.target.value)} placeholder="/health" />
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
