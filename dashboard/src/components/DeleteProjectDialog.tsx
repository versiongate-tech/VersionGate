import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteProject } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  /** Runs after a successful delete (e.g. refresh list). */
  onDeleted?: () => void;
  /** Where to navigate after delete. Use `false` to stay on the current route. */
  navigateTo?: string | false;
};

export function DeleteProjectDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  onDeleted,
  navigateTo = "/",
}: Props) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    setBusy(true);
    try {
      await deleteProject(projectId);
      toast.success("Project deleted");
      onDeleted?.();
      onOpenChange(false);
      if (navigateTo !== false) {
        navigate(navigateTo);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete project");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent showCloseButton={!busy} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete project?</DialogTitle>
          <DialogDescription>
            This removes <span className="font-medium text-foreground">{projectName}</span>, its deploy history, and stops
            any running containers for this project. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void handleDelete()}>
            {busy ? "Deleting…" : "Delete project"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
