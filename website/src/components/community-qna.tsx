"use client";

import { useState } from "react";

export interface QuestionThread {
  id: string;
  category: "Docker" | "Nginx" | "API Tokens" | "Rollbacks" | "Troubleshooting";
  title: string;
  author: string;
  date: string;
  upvotes: number;
  question: string;
  answer: string;
  accepted: boolean;
  codeSnippet?: string;
}

const THREADS: QuestionThread[] = [
  {
    id: "thread-1",
    category: "Nginx",
    title: "How does traffic switch without dropping in-flight requests?",
    author: "dinesh_k",
    date: "2 days ago",
    upvotes: 42,
    question:
      "When a new container is ready on the idle port, how does VersionGate move production traffic without cutting active connections?",
    answer:
      "TrafficService.switchTrafficTo() writes a new upstream block pointing at 127.0.0.1:{port} and runs nginx -s reload (with sudo -n fallback). Nginx starts new workers for incoming connections while existing workers finish open requests.",
    accepted: true,
    codeSnippet: `await execFileAsync("nginx", ["-s", "reload"]);`,
  },
  {
    id: "thread-2",
    category: "Rollbacks",
    title: "Why is rollback faster than a full deploy?",
    author: "alex_dev",
    date: "3 days ago",
    upvotes: 38,
    question: "Rollback reuses an older version — what steps does the engine skip?",
    answer:
      "When the previous image tag still exists locally, rollback.handler logs [WARM-SWAP] and runs docker run with previous.imageTag instead of git pull and docker build. It still runs ValidationService before switchTrafficTo().",
    accepted: true,
    codeSnippet: `const isCached = await imageExists(previous.imageTag);
if (isCached) {
  await log(\`[WARM-SWAP] Found cached Docker image \${previous.imageTag}. Spinning up instant container…\`);
}`,
  },
  {
    id: "thread-3",
    category: "API Tokens",
    title: "How do I trigger deploys from CI without a dashboard session?",
    author: "devops_sam",
    date: "5 days ago",
    upvotes: 29,
    question: "What API calls should GitHub Actions use?",
    answer:
      "Create a token with POST /api/v1/auth/tokens (dashboard or authenticated session). Pass Authorization: Bearer vg_live_... on POST /api/v1/deploy with projectId and optional environmentId. Response is 202 with jobId.",
    accepted: true,
    codeSnippet: `curl -X POST "$VG_URL/api/v1/deploy" \\
  -H "Authorization: Bearer $VG_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"projectId":"proj_abc","environmentId":"env_prod"}'`,
  },
  {
    id: "thread-4",
    category: "Docker",
    title: "What happens if the new container fails health checks?",
    author: "marcus_b",
    date: "1 week ago",
    upvotes: 24,
    question: "Does a failed deploy take production offline?",
    answer:
      "No. deploy.handler runs validation.validate() before switchTrafficTo(). On failure it throws DeploymentError, marks the deployment FAILED, and does not reload Nginx. The previously ACTIVE slot keeps serving traffic.",
    accepted: true,
    codeSnippet: `if (!health.success) {
  throw new DeploymentError(health.error ?? "Health check failed");
}`,
  },
  {
    id: "thread-5",
    category: "Troubleshooting",
    title: "How are host port conflicts handled before docker run?",
    author: "chen_wei",
    date: "1 week ago",
    upvotes: 19,
    question: "Orphan containers sometimes hold basePort — what does the engine do?",
    answer:
      "freeHostPort() queries docker ps --filter publish={port} and force-removes any container bound to that host port before starting the new slot container.",
    accepted: true,
    codeSnippet: `const { stdout } = await execFileAsync(dockerCmd(), [
  "ps", "-q", "--filter", \`publish=\${hostPort}\`,
]);`,
  },
  {
    id: "thread-6",
    category: "Troubleshooting",
    title: "Domain does not open but VersionGate says working",
    author: "ops_henry",
    date: "today",
    upvotes: 12,
    question:
      "PM2 is online, PUBLIC_DOMAIN is set, Certbot has a cert, and the dashboard shows Systems Operational. The hostname still fails in the browser. Is the VPS broken?",
    answer:
      "Usually no. Preflight DNS runs on the VPS; the laptop resolver can still return NXDOMAIN. curl to the public IP from the guest often hangs (hairpin NAT on Proxmox / shared-to-dedicated port hosts). install.sh, Settings Write nginx, and certbot also write three different files that all listen on port 80. Test loopback with a Host header, compare dig @8.8.8.8 to nslookup on the laptop, and keep server blocks out of upstream.conf. Full runbook: /docs/troubleshooting.",
    accepted: true,
    codeSnippet: `curl -sI --max-time 5 -H "Host: $PUBLIC_DOMAIN" http://127.0.0.1/
dig +short "$PUBLIC_DOMAIN" A @8.8.8.8
nslookup "$PUBLIC_DOMAIN"`,
  },
];

export function CommunityQnA() {
  const [threads, setThreads] = useState<QuestionThread[]>(THREADS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const categories = ["All", "Docker", "Nginx", "API Tokens", "Rollbacks", "Troubleshooting"];

  const handleUpvote = (id: string) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, upvotes: t.upvotes + 1 } : t))
    );
  };

  const filtered = threads.filter((t) => {
    const matchesCat = selectedCategory === "All" || t.category === selectedCategory;
    const matchesQuery =
      searchQuery.trim() === "" ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesQuery;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 font-mono text-xs rounded-md transition ${
                selectedCategory === cat
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-muted text-muted-foreground border border-border hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search topics..."
          className="bg-muted border border-border rounded-md px-3 py-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/50 sm:w-64"
        />
      </div>

      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="py-12 text-center font-mono text-xs text-muted-foreground rounded-lg border border-border bg-card">
            No topics matching &quot;{searchQuery}&quot;.
          </div>
        ) : (
          filtered.map((thread) => (
            <div
              key={thread.id}
              className="rounded-lg border border-border bg-card p-6 space-y-4 transition hover:border-foreground/30 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-muted px-2 py-0.5 font-mono text-[9px] text-muted-foreground border border-border font-semibold">
                      {thread.category}
                    </span>
                    {thread.accepted && (
                      <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-semibold">
                        [ SOURCE-ALIGNED ]
                      </span>
                    )}
                  </div>
                  <h3 className="font-sans text-sm font-bold text-foreground pt-1">{thread.title}</h3>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    Asked by <span className="text-foreground">{thread.author}</span> · {thread.date}
                  </div>
                </div>

                <button
                  onClick={() => handleUpvote(thread.id)}
                  className="flex flex-col items-center justify-center rounded-md border border-border bg-muted/60 px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted transition min-w-[50px]"
                >
                  <span className="font-mono text-[10px]">▲</span>
                  <span className="font-mono text-xs font-bold text-foreground">{thread.upvotes}</span>
                </button>
              </div>

              <div className="font-sans text-xs text-muted-foreground leading-relaxed border-l-2 border-border pl-3">
                {thread.question}
              </div>

              <div className="rounded-md bg-muted border border-border p-4 space-y-3">
                <div className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">
                  Answer:
                </div>
                <p className="font-sans text-xs text-foreground leading-relaxed">{thread.answer}</p>
                {thread.codeSnippet && (
                  <pre className="overflow-x-auto p-3 bg-background border border-border font-mono text-xs text-foreground rounded-md">
                    {thread.codeSnippet}
                  </pre>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
