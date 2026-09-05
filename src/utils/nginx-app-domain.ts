import { sanitizeNginxIdentifier } from "../services/nginx-upstream.service";

const NGINX_APP_CONF_DIR = "/etc/nginx/conf.d";

export function appUpstreamName(projectName: string): string {
  return `vg_app_${sanitizeNginxIdentifier(projectName)}`;
}

export function appUpstreamConfPath(projectName: string): string {
  return `${NGINX_APP_CONF_DIR}/vg-app-${sanitizeNginxIdentifier(projectName)}.upstream.conf`;
}

/** One server file per hostname so Certbot --nginx -d is isolated per name. */
export function appServerConfPath(projectName: string, hostname: string): string {
  const hostSlug = sanitizeNginxIdentifier(hostname.replace(/\./g, "_"));
  return `${NGINX_APP_CONF_DIR}/vg-app-${sanitizeNginxIdentifier(projectName)}-${hostSlug}.conf`;
}

export function generateAppUpstreamConf(projectName: string, port: number | null): string {
  const upstream = appUpstreamName(projectName);
  if (port && port > 0) {
    return `upstream ${upstream} {\n  server 127.0.0.1:${port};\n}\n`;
  }
  return `upstream ${upstream} {\n  server 127.0.0.1:9 down;\n}\n`;
}

const PROXY_HEADERS = `        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;`;

/**
 * HTTP vhost for a project custom domain. Certbot may add listen 443 and ssl_* lines in-place.
 * server_name is exact — no catch-all `_`.
 */
export function generateAppServerConf(projectName: string, hostname: string): string {
  const upstream = appUpstreamName(projectName);
  return `server {
    listen 80;
    server_name ${hostname};

    client_max_body_size 100M;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
        try_files $uri =404;
    }

    location / {
        proxy_pass http://${upstream};
${PROXY_HEADERS}
    }
}
`;
}
