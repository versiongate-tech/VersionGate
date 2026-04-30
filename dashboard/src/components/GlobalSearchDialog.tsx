import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { getProjects, type Project } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function GlobalSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    if (!open) {
      setQ("");
      return;
    }
    let cancelled = false;
    void getProjects()
      .then((r) => {
        if (!cancelled) setProjects(r.projects);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(s) || p.repoUrl.toLowerCase().includes(s));
  }, [projects, q]);

  const pick = (p: Project) => {
    onOpenChange(false);
    navigate(`/projects/${p.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>Search resources</DialogTitle>
          <DialogDescription>Jump to a project by name or repository URL.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects…"
            className="h-10 border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
        </div>
        <ul className="max-h-72 overflow-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">No matching projects</li>
          ) : (
            filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => pick(p)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted"
                  )}
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">{p.repoUrl}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          Tip: press <kbd className="rounded border bg-muted px-1">⌘</kbd>{" "}
          <kbd className="rounded border bg-muted px-1">K</kbd> to open from anywhere
        </p>
      </DialogContent>
    </Dialog>
  );
}
