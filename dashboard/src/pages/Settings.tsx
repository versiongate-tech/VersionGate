import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";

export function Settings() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader title="Settings" description="Global preferences and integrations." />
      <Card className="border-border/50 bg-card/60 ring-1 ring-border/30">
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>Team settings, notifications, and integrations will appear here.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Nothing to configure yet.</CardContent>
      </Card>
    </div>
  );
}
