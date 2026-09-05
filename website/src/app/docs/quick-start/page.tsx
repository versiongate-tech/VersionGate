import { Breadcrumb, Callout, Code, H2, InlineCode, Lead, NextLinks, P, PageTitle } from "../ui";

export default function QuickStart() {
  return (
    <article>
      <Breadcrumb page="Quick Start" />
      <PageTitle>Quick Start</PageTitle>
      <Lead>
        Get VersionGate running on a fresh VM (or existing server) in under 3 minutes with Nginx reverse proxying, PM2 systemd boot persistence, and optional automatic Certbot TLS.
      </Lead>

      <H2>Option A: Universal One-Line Host Installer (Recommended)</H2>
      <P>
        On a clean VPS (Ubuntu, Debian, RHEL) with nothing installed, run this single command to provision Docker Engine, Nginx reverse proxy, Node 20, Bun, PM2 boot persistence, and start VersionGate:
      </P>
      <Code title="terminal">{`curl -fsSL https://versiongate.tech/install.sh | sudo bash`}</Code>

      <H2>Automatic TLS / Custom Domain Setup</H2>
      <P>
        If you have a domain pointing to your VM's public IP address, pass the <InlineCode>DOMAIN</InlineCode> environment variable to provision free Let's Encrypt SSL/TLS certificates automatically via Certbot:
      </P>
      <Code title="terminal">{`DOMAIN=versiongate.tech curl -fsSL https://versiongate.tech/install.sh | sudo bash`}</Code>
      <P>
        The installer configures Nginx to proxy incoming traffic on ports 80 and 443 to the local VersionGate API and dashboard on <InlineCode>127.0.0.1:9090</InlineCode>.
      </P>
      <Callout title="Domain set, dashboard says working, browser does not open it">
        That is usually DNS on the client, hairpin NAT when curling the public IP from the VPS, or
        three nginx files claiming the same hostname. See{" "}
        <a href="/docs/troubleshooting" className="text-foreground underline underline-offset-2">
          Domain troubleshooting
        </a>
        .
      </Callout>

      <H2>Azure Network Security Group (NSG) Configuration</H2>
      <P>
        Azure firewalls traffic at the subscription level using Network Security Groups (NSGs). OS firewall rules (<InlineCode>ufw</InlineCode>/<InlineCode>firewalld</InlineCode>) alone will not allow external traffic until Azure NSG inbound rules are created.
      </P>
      <P>
        If the Azure CLI (<InlineCode>az</InlineCode>) is installed and authenticated, the installer auto-configures these rules for you. Otherwise, enable ports <InlineCode>80</InlineCode>, <InlineCode>443</InlineCode>, and <InlineCode>9090</InlineCode> (TCP) in the Azure Portal (<InlineCode>VM -&gt; Networking -&gt; Add inbound port rule</InlineCode>) or run:
      </P>
      <Code title="terminal">{`az network nsg rule create \\
  --resource-group <YOUR_RESOURCE_GROUP> \\
  --nsg-name <YOUR_NSG_NAME> \\
  --name Allow-VersionGate-Inbound \\
  --priority 1010 \\
  --direction Inbound \\
  --access Allow \\
  --protocol Tcp \\
  --destination-port-ranges 80 443 9090`}</Code>

      <H2>Option B: Existing Server (Manual Clone)</H2>
      <P>
        If you already have Docker and Node/Bun installed on your server and want to launch manually:
      </P>
      <Code title="terminal">{`git clone https://github.com/dineshkorukonda/VersionGate.git
cd VersionGate
bun install
bun run agent      # Audit system prerequisites & copy-paste fix commands
bun run dev        # Start engine on port 9090 in Setup Mode`}</Code>

      <H2>Complete In-UI Setup Wizard</H2>
      <P>
        Once started, open your browser directly at:
      </P>
      <Code title="browser">{`http://<your-vm-ip>/   (or https://<your-domain>/)`}</Code>
      <P>
        Enter your PostgreSQL connection string, JWT secrets, and administrator account details. The Setup Wizard tests your database connection, applies Drizzle ORM schema migrations, writes <InlineCode>.env</InlineCode>, and launches the full control-plane dashboard.
      </P>

      <Callout title="Setup Mode (Zero Crash-Looping)">
        VersionGate binds to port 9090 immediately behind Nginx without requiring PostgreSQL pre-configuration. You never get locked out of the setup wizard due to database connection errors.
      </Callout>

      <NextLinks
        primary={{ href: "/docs/architecture", label: "Architecture" }}
        secondary={{ href: "/docs/deployment", label: "Deployment & Promotion" }}
      />
    </article>
  );
}
