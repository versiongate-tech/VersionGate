import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isDeploymentColor } from "@/lib/deployment-display";

export function SlotBadge({ color }: { color: string }) {
  const valid = isDeploymentColor(color);
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono text-xs font-semibold uppercase",
        color === "BLUE" && "border-sky-500/50 bg-sky-500/10 text-sky-900",
        color === "GREEN" && "border-emerald-500/45 bg-emerald-500/10 text-emerald-800",
        !valid && "border-muted-foreground/40 text-muted-foreground"
      )}
    >
      {valid ? color : "—"}
    </Badge>
  );
}
