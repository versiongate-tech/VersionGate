import { Breadcrumb, Callout, H2, InlineCode, Lead, NextLinks, P, PageTitle, Table } from "../ui";

export default function ApiReference() {
  return (
    <article>
      <Breadcrumb page="API Reference" />
      <PageTitle>API Reference</PageTitle>
      <Lead>
        The engine serves a REST API under <InlineCode>/api/v1</InlineCode> on port 9090. All
        endpoints require a session cookie except setup, auth, webhooks, and self-update routes.
      </Lead>

      <H2>Projects</H2>
      <Table
        head={["Method", "Path", "Description"]}
        rows={[
          ["POST", "/api/v1/projects", "Create project"],
          ["GET", "/api/v1/projects", "List all projects"],
          ["GET", "/api/v1/projects/:id", "Get project"],
          ["PATCH", "/api/v1/projects/:id", "Update branch / port / buildContext"],
          ["PATCH", "/api/v1/projects/:id/env", "Update env vars (encrypted at rest)"],
          ["DELETE", "/api/v1/projects/:id", "Delete project"],
          ["POST", "/api/v1/projects/:id/rollback", "Rollback to previous deployment"],
          ["POST", "/api/v1/projects/:id/cancel-deploy", "Cancel in-progress deployment"],
          ["POST", "/api/v1/projects/:id/generate-pipeline", "AI-generate GitHub Actions CI"],
          ["GET", "/api/v1/projects/:id/domains", "List production custom domains"],
          ["POST", "/api/v1/projects/:id/domains", "Attach hostname { hostname }"],
          ["DELETE", "/api/v1/projects/:id/domains/:domainId", "Remove custom domain"],
          ["POST", "/api/v1/projects/:id/domains/:domainId/ssl", "Issue Certbot TLS for hostname"],
        ]}
      />

      <H2>Deployments &amp; environments</H2>
      <Table
        head={["Method", "Path", "Description"]}
        rows={[
          ["POST", "/api/v1/deploy", "Trigger deployment { projectId }"],
          ["GET", "/api/v1/deployments", "List all deployments"],
          ["GET", "/api/v1/status", "Current active deployment"],
          ["POST", "/api/v1/projects/:id/environments/:envId/promote", "Promote build from source environment"],
        ]}
      />

      <H2>GitHub integration</H2>
      <Table
        head={["Method", "Path", "Description"]}
        rows={[
          ["GET", "/api/auth/github/install", "Start official App install (redirects to GitHub)"],
          ["GET", "/api/auth/github/callback", "Install callback (via versiongate.tech relay)"],
          ["GET", "/api/github/repos", "List repositories for the installation"],
          ["GET", "/api/github/repos/:owner/:repo/branches", "List branches"],
          ["POST", "/api/webhooks/github", "Direct GitHub signature webhook (dev / advanced)"],
          ["POST", "/api/webhooks/github/relay", "Fan-out from versiongate.tech (hop-signed)"],
        ]}
      />
      <P>
        Public relay routes on versiongate.tech:{" "}
        <InlineCode>GET /api/github/callback</InlineCode>, <InlineCode>POST /api/github/register</InlineCode>,{" "}
        <InlineCode>POST /api/webhooks/github</InlineCode>.
      </P>
      <H2>System</H2>
      <Table
        head={["Method", "Path", "Description"]}
        rows={[
          ["GET", "/api/v1/system/preflight", "Host compatibility checks (no DB required)"],
          ["GET", "/api/v1/system/server-stats", "Host CPU / memory / disk / network"],
          ["POST", "/api/v1/system/reconcile", "Manual crash-recovery trigger"],
          ["GET", "/health", "Engine health check"],
        ]}
      />

      <H2>Setup</H2>
      <Table
        head={["Method", "Path", "Description"]}
        rows={[
          ["GET", "/api/v1/setup/status", "Returns { configured: boolean }"],
          ["POST", "/api/v1/setup/apply", "Apply initial config { domain, databaseUrl, geminiApiKey? }"],
        ]}
      />

      <P>
        Full environment-variable reference lives in the repository&apos;s{" "}
        <InlineCode>docs/SETUP.md</InlineCode>.
      </P>

      <Callout title="Authentication">
        Create the first admin with <InlineCode>bun run create-admin</InlineCode>, then sign in at{" "}
        <InlineCode>/login</InlineCode>. API requests use the session cookie issued on login.
      </Callout>

      <NextLinks
        primary={{ href: "/docs/troubleshooting", label: "Domain troubleshooting" }}
        secondary={{ href: "/docs/quick-start", label: "Quick Start" }}
      />
    </article>
  );
}
