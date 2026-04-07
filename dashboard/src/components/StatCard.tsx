import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  valueClassName,
  iconClassName,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  valueClassName?: string;
  iconClassName?: string;
}) {
  return (
    <Card className="relative overflow-hidden border-border/50 bg-card/80 shadow-none ring-1 ring-border/40 transition-colors hover:ring-primary/20">
      <div className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary/5" />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <Icon className={cn("size-4 text-muted-foreground", iconClassName)} />
      </CardHeader>
      <CardContent>
        <div className={cn("text-3xl font-semibold tabular-nums tracking-tight", valueClassName)}>{value}</div>
      </CardContent>
    </Card>
  );
}
