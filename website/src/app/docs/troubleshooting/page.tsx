import { Breadcrumb, Callout, Code, H2, InlineCode, Lead, NextLinks, P, PageTitle, Table } from "../ui";

export default function Troubleshooting() {
  return (
    <article>
      <Breadcrumb page="Troubleshooting" />
      <PageTitle>Domain troubleshooting</PageTitle>
      <Lead>
        VersionGate can report the engine as healthy while the hostname does not open in a browser.
        PM2 online, preflight DNS, and the dashboard status badge are not the same as public
        reachability.
      </Lead>

      <H2 id="working-vs-reachable">What &quot;working&quot; actually means</H2>
      <Table
        head={["Signal", "What it proves", "What it does not prove"]}
        rows={[
          [
            "pm2 status online",
            "versiongate-api and versiongate-worker are running",
            "Nginx, DNS, or TLS are correct",
          ],
          [
            "Preflight DNS A",
            "This VPS resolved PUBLIC_DOMAIN",
            "Your laptop or ISP can resolve the same name",
          ],
          [
            "Systems Operational",
            "Dashboard chrome rendered",
            "Nothing — that badge is not a live health check",
          ],
          [
            "Certbot success",
            "Let's Encrypt issued a cert and nginx listens on 443",
            "Every resolver has the A record, or IPv6 is configured",
          ],
        ]}
      />

      <H2 id="layers">Split the problem into layers</H2>
      <P>
        Work from the process outward. Fix the first layer that fails before changing the next one.
      </P>
      <Table
        head={["Layer", "Test", "Pass condition"]}
        rows={[
          ["01 Engine", "curl -sI --max-time 5 http://127.0.0.1:9090/", "HTTP from Bun on 9090"],
          ["02 Nginx loopback", "curl -sI --max-time 5 http://127.0.0.1/", "Nginx proxies to 9090"],
          ["03 Host header", "curl -sI --max-time 5 -H \"Host: YOUR_DOMAIN\" http://127.0.0.1/", "Same 200 for the real hostname"],
          ["04 TLS loopback", "curl -sIk --max-time 5 --resolve YOUR_DOMAIN:443:127.0.0.1 https://YOUR_DOMAIN/", "Cert + 443 on this box"],
          ["05 Public ports", "ss -lntp | grep -E ':80|:443|:9090'", "nginx on 80/443, bun on 9090"],
          ["06 DNS split", "dig +short YOUR_DOMAIN A && dig +short YOUR_DOMAIN A @8.8.8.8", "Both return this server IPv4"],
        ]}
      />

      <H2 id="diagnose">Diagnostic block</H2>
      <P>
        Replace <InlineCode>YOUR_DOMAIN</InlineCode> with the hostname in{" "}
        <InlineCode>PUBLIC_DOMAIN</InlineCode>. Do not leave the placeholder —{" "}
        <InlineCode>dig YOUR_DOMAIN</InlineCode> looks up a name that does not exist.
      </P>
      <Code title="terminal">{`DOMAIN=YOUR_DOMAIN
grep -E 'PUBLIC_DOMAIN|PUBLIC_URL|NGINX_CONFIG_PATH|COOKIE_SECURE' ~/VersionGate/.env
ss -lntp | grep -E ':80|:443|:9090'
ls -la /etc/nginx/sites-enabled/
grep -RIn "server_name\\|listen " /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d

dig +short "$DOMAIN" A
dig +short "$DOMAIN" A @8.8.8.8

curl -sI --max-time 5 http://127.0.0.1/
curl -sI --max-time 5 -H "Host: $DOMAIN" http://127.0.0.1/
curl -sIk --max-time 5 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/"`}</Code>
      <Callout title="Do not curl the public IP from the VPS">
        On Proxmox, NAT VPS, or a host that recently moved from a shared port to a dedicated port,{" "}
        <InlineCode>curl http://$PUBLIC_IP/</InlineCode> often hangs. That is hairpin NAT: the guest
        cannot connect out to its own public address. Use loopback plus a{" "}
        <InlineCode>Host</InlineCode> header, or test 80/443 from a laptop. SSH working on a
        dedicated port does not by itself prove 80/443 are forwarded.
      </Callout>

      <H2 id="dns">DNS: server says yes, browser says no</H2>
      <P>
        Preflight and <InlineCode>dig</InlineCode> on the VPS use the server resolver. Your browser
        uses the laptop or router resolver. Those can disagree for hours after you add{" "}
        <InlineCode>vg.henry.example.com</InlineCode> as a nested subdomain.
      </P>
      <Code title="laptop">{`nslookup YOUR_DOMAIN
nslookup YOUR_DOMAIN 8.8.8.8`}</Code>
      <P>
        If the first command is NXDOMAIN and the second returns this server IPv4, the engine is
        fine. Point the laptop or router at <InlineCode>8.8.8.8</InlineCode> or{" "}
        <InlineCode>1.1.1.1</InlineCode>, flush the local cache, and open{" "}
        <InlineCode>https://YOUR_DOMAIN</InlineCode>.
      </P>
      <P>
        On Cloudflare: A record to the VPS IPv4, DNS only (grey cloud) until HTTP-01 succeeds. A
        parent name such as <InlineCode>henry.example.com</InlineCode> with no A record, or a
        broken CNAME, makes <InlineCode>vg.henry.example.com</InlineCode> fail on some resolvers.
        Do not add AAAA unless nginx also listens on <InlineCode>[::]:443</InlineCode>.
      </P>

      <H2 id="nginx-files">Three nginx files that fight each other</H2>
      <P>
        After install, Settings → Write nginx, Certbot, and a provider OS reset, these paths often
        all claim port 80:
      </P>
      <Table
        head={["Path", "Who writes it", "Keep?"]}
        rows={[
          [
            "/etc/nginx/sites-available/versiongate",
            "install.sh — often still server_name $PUBLIC_IP",
            "Disable the sites-enabled symlink once conf.d has the TLS vhost",
          ],
          [
            "/etc/nginx/conf.d/versiongate.conf",
            "Setup wizard + certbot --nginx",
            "Yes — this is the live dashboard vhost",
          ],
          [
            "/etc/nginx/conf.d/upstream.conf",
            "Settings Write nginx (NGINX_CONFIG_PATH) and TrafficService",
            "upstream { } only — never a server { } block",
          ],
        ]}
      />
      <P>
        Default <InlineCode>NGINX_CONFIG_PATH</InlineCode> is{" "}
        <InlineCode>/etc/nginx/conf.d/upstream.conf</InlineCode>. Settings → Write nginx config
        writes a <InlineCode>server</InlineCode> block there, then the next production deploy
        overwrites that file with an <InlineCode>upstream</InlineCode> block. The dashboard reports
        success; the installer vhost on the IP never changes.
      </P>
      <Code title="cleanup">{`cp -a /etc/nginx/conf.d /root/nginx-conf.d.bak.$(date +%Y%m%d-%H%M)
cp -a /etc/nginx/sites-available/versiongate /root/nginx-sites-versiongate.bak
rm -f /etc/nginx/sites-enabled/versiongate
cat > /etc/nginx/conf.d/upstream.conf <<'EOF'
# Written by VersionGate on production deploy/promote
# Do not put server { } blocks in this file.
EOF
nginx -t && systemctl reload nginx`}</Code>
      <Callout title="After cleanup">
        Do not click Settings → Write nginx config again until{" "}
        <InlineCode>NGINX_CONFIG_PATH</InlineCode> points at the real vhost (or the product writes
        site and upstream to different files). Removing the IP-only site makes{" "}
        <InlineCode>http://SERVER_IP/</InlineCode> return 404; use the hostname over HTTPS.
      </Callout>

      <H2 id="provider">Shared port, dedicated port, OS reset</H2>
      <P>
        A host that started on a shared/NAT port and later received a dedicated public port still
        sits behind the provider hypervisor (often Proxmox). Two OS resets reinstall VersionGate
        and stack another copy of the three nginx files above. SSH on the dedicated port only
        proves that port is forwarded. Confirm 80 and 443 from a machine that is not the VPS.
      </P>
      <Code title="from a laptop">{`curl -sI --max-time 10 http://SERVER_IP/
curl -sI --max-time 10 --resolve YOUR_DOMAIN:443:SERVER_IP https://YOUR_DOMAIN/`}</Code>

      <H2 id="apps">Dashboard domain vs app URL</H2>
      <P>
        The dashboard hostname is <InlineCode>PUBLIC_DOMAIN</InlineCode>. Deployed apps are not
        separate vhosts. Open them at{" "}
        <InlineCode>https://YOUR_DOMAIN/p/&lt;project&gt;/&lt;environment&gt;</InlineCode>. Custom
        app hostnames such as <InlineCode>app.example.com</InlineCode> are not written by the
        engine today.
      </P>

      <NextLinks
        primary={{ href: "/docs/networking", label: "Networking" }}
        secondary={{ href: "/docs/quick-start", label: "Quick Start" }}
      />
    </article>
  );
}
