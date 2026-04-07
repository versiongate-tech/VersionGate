import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  valueClassName,
  hint,
}: {
  label: string;
  value: number | string;
  valueClassName?: string;
  /** Short secondary line (no icons). */
  hint?: string;
}) {
  return (
    <Card className="relative overflow-hidden border-border/50 bg-card/70 shadow-none ring-1 ring-border/30 transition-all hover:ring-primary/20 hover:shadow-md hover:shadow-primary/5">
      <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-primary/[0.03]" />
      <div className="pointer-events-none absolute -right-2 -top-2 size-12 rounded-full bg-primary/[0.04]" />
      <CardHeader className="space-y-0 pb-1">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/80">{label}</span>
        {hint ? <p className="text-[11px] font-normal normal-case text-muted-foreground/70">{hint}</p> : null}
      </CardHeader>
      <CardContent>
        <div className={cn("text-3xl font-bold tabular-nums tracking-tight", valueClassName)}>{value}</div>
      </CardContent>
    </Card>
  );
}
