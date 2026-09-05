import { Breadcrumb, Callout, Code, H2, InlineCode, Lead, NextLinks, P, PageTitle } from "../ui";

export default function Networking() {
  return (
    <article>
      <Breadcrumb page="Networking" />
      <PageTitle>Networking</PageTitle>
      <Lead>
        VersionGate manages an Nginx upstream file and a dedicated Docker network. Traffic switching
        is a config rewrite plus reload — never a restart.
      </Lead>

      <H2>Ports and slots</H2>
      <P>
        Each environment reserves two host ports: <InlineCode>basePort</InlineCode> (blue) and{" "}
        <InlineCode>basePort + 1</InlineCode> (green). Inside the container your app listens on{" "}
        <InlineCode>appPort</InlineCode>; Docker maps it to the slot&apos;s host port.
      </P>

      <H2>Nginx upstream switching</H2>
      <Code title="/etc/nginx/conf.d/upstream.conf">{`upstream myapp {
    server 127.0.0.1:3101;   # rewritten by VersionGate on every switch
}`}</Code>
      <P>
        After a health-checked deploy, VersionGate rewrites the upstream port and runs{" "}
        <InlineCode>nginx -s reload</InlineCode>. Existing connections drain gracefully; new
        requests hit the new container.
      </P>

      <H2>Docker network</H2>
      <Code title="terminal">{`docker network create versiongate-net`}</Code>
      <P>
        All deployed containers join <InlineCode>versiongate-net</InlineCode> (configurable via{" "}
        <InlineCode>DOCKER_NETWORK</InlineCode>), so services can reach each other by container name.
      </P>

      <H2>Project custom domains (production)</H2>
      <P>
        Each project can attach one production hostname (for example{" "}
        <InlineCode>app.example.com</InlineCode>). VersionGate writes dedicated nginx files under{" "}
        <InlineCode>/etc/nginx/conf.d/</InlineCode> and never overwrites the dashboard vhost in{" "}
        <InlineCode>upstream.conf</InlineCode> or <InlineCode>versiongate.conf</InlineCode>.
      </P>
      <Code title="per-project nginx layout">{`# upstream — rewritten on every blue/green switch
/etc/nginx/conf.d/vg-app-myapp.upstream.conf

# server — one file per hostname (Certbot-safe)
/etc/nginx/conf.d/vg-app-myapp-app-example-com.conf`}</Code>
      <P>
        Attach from the project page or via{" "}
        <InlineCode>POST /api/v1/projects/:id/domains</InlineCode>. Point DNS A/AAAA at this
        server, then run <InlineCode>POST .../domains/:domainId/ssl</InlineCode> to issue TLS with
        Certbot (<InlineCode>CERTBOT_EMAIL</InlineCode> in <InlineCode>.env</InlineCode>). Until a
        production deploy is ACTIVE, the upstream uses a down marker and the hostname returns 502/503.
      </P>

      <H2>Domains &amp; HTTPS (dashboard)</H2>
      <P>
        Settings → Dashboard URL lets you set <InlineCode>PUBLIC_DOMAIN</InlineCode> and provision
        certificates via Certbot. Preflight validates DNS resolution, certbot availability, and{" "}
        <InlineCode>CERTBOT_EMAIL</InlineCode> before attempting issuance.
      </P>
      <Callout title="Hostname opens nowhere, dashboard says working">
        PM2 online and preflight DNS are measured on the VPS. They do not prove your laptop can
        resolve the name, or that nginx has a single vhost. Use the{" "}
        <a href="/docs/troubleshooting" className="text-foreground underline underline-offset-2">
          domain troubleshooting
        </a>{" "}
        guide: loopback curls, split-horizon DNS, hairpin NAT, and the three nginx files that
        overwrite each other after install / Settings / Certbot.
      </Callout>

      <H2>Webhook endpoints</H2>
      <P>
        The official VersionGate GitHub App sends webhooks to{" "}
        <InlineCode>https://versiongate.tech/api/webhooks/github</InlineCode>. The public relay
        looks up your installation and forwards the event to{" "}
        <InlineCode>{`{PUBLIC_URL}`}/api/webhooks/github/relay</InlineCode> on your VPS (verified with{" "}
        <InlineCode>GITHUB_STATE_SECRET</InlineCode>). Direct{" "}
        <InlineCode>{`{PUBLIC_URL}`}/api/webhooks/github</InlineCode> remains available for local
        testing. Legacy per-project webhooks (<InlineCode>/api/v1/webhooks/:secret</InlineCode>) continue
        to work without the App.
      </P>

      <Callout title="Behind PM2 with a minimal PATH?">
        If Docker is installed but PM2 strips your <InlineCode>PATH</InlineCode>, set{" "}
        <InlineCode>DOCKER_BIN=/usr/bin/docker</InlineCode> in <InlineCode>.env</InlineCode>.
      </Callout>

      <NextLinks
        primary={{ href: "/docs/troubleshooting", label: "Domain troubleshooting" }}
        secondary={{ href: "/docs/api-reference", label: "API Reference" }}
      />
    </article>
  );
}
