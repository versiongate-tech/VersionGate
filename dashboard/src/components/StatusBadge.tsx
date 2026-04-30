import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ProjectStatus =
  | "ACTIVE"
  | "DEPLOYING"
  | "FAILED"
  | "ROLLED_BACK"
  | "PENDING";

const styles: Record<
  ProjectStatus,
  { className: string; pulse?: boolean }
> = {
  ACTIVE: { className: "bg-emerald-600/12 text-emerald-800 border-emerald-600/35" },
  DEPLOYING: {
    className: "bg-sky-600/12 text-sky-800 border-sky-600/35 animate-pulse",
    pulse: true,
  },
  FAILED: { className: "bg-red-600/12 text-red-800 border-red-600/35" },
  ROLLED_BACK: { className: "bg-muted text-muted-foreground border-border" },
  PENDING: { className: "bg-amber-500/15 text-amber-900 border-amber-500/35" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const key = (status in styles ? status : "PENDING") as ProjectStatus;
  const s = styles[key];
  return (
    <Badge variant="outline" className={cn("font-medium", s.className, className)}>
      {status}
    </Badge>
  );
}
