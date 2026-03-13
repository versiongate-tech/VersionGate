#!/usr/bin/env bash
# VersionGate install script
# Usage: sudo bash install.sh
set -euo pipefail

# ─── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[•]${RESET} $*"; }
success() { echo -e "${GREEN}[✔]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[!]${RESET} $*"; }
fatal()   { echo -e "${RED}[✘]${RESET} $*" >&2; exit 1; }

# ─── Root check ────────────────────────────────────────────────────────────────
[[ "$EUID" -ne 0 ]] && fatal "This script must be run as root. Try: sudo bash install.sh"

# ─── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}  VersionGate Installer${RESET}"
echo    "  ─────────────────────────────────────────"
echo ""

# ─── Collect prompts upfront ───────────────────────────────────────────────────
echo -e "${BOLD}Configure VersionGate before installation begins.${RESET}"
echo ""

# DATABASE_URL
while true; do
  read -rp "$(echo -e "${CYAN}[?]${RESET} DATABASE_URL (e.g. postgresql://user:pass@host:5432/db): ")" DATABASE_URL
  [[ -n "$DATABASE_URL" ]] && break
  warn "DATABASE_URL is required."
done

# Access type
echo ""
echo "  How will VersionGate be accessed?"
echo "    [1] Domain / subdomain  (e.g. versiongate.example.com)"
echo "    [2] IP address          (e.g. 203.0.113.42)"
while true; do
  read -rp "$(echo -e "${CYAN}[?]${RESET} Choice [1/2]: ")" ACCESS_TYPE
  case "$ACCESS_TYPE" in
    1|2) break ;;
    *) warn "Enter 1 or 2." ;;
  esac
done

echo ""
if [[ "$ACCESS_TYPE" == "1" ]]; then
  while true; do
    read -rp "$(echo -e "${CYAN}[?]${RESET} Domain or subdomain (e.g. vg.example.com): ")" DOMAIN_OR_IP
    [[ -n "$DOMAIN_OR_IP" ]] && break
    warn "Domain is required."
  done
  NGINX_SERVER_NAME="$DOMAIN_OR_IP"
  NGINX_LISTEN="listen 80;"
else
  read -rp "$(echo -e "${CYAN}[?]${RESET} Server IP address (leave blank for catch-all): ")" DOMAIN_OR_IP
  if [[ -z "$DOMAIN_OR_IP" ]]; then
    DOMAIN_OR_IP="$(hostname -I | awk '{print $1}')"
    warn "Using detected IP: $DOMAIN_OR_IP"
  fi
  NGINX_SERVER_NAME="_"
  NGINX_LISTEN="listen 80 default_server;"
fi

# Gemini API key (optional)
echo ""
read -rp "$(echo -e "${CYAN}[?]${RESET} GEMINI_API_KEY (optional — press Enter to skip): ")" GEMINI_API_KEY

echo ""
echo -e "${BOLD}─────────────────────────────────────────${RESET}"
info "Configuration collected. Starting installation…"
echo ""

# ─── OS detection ──────────────────────────────────────────────────────────────
if command -v apt-get &>/dev/null; then
  PKG_MGR="apt"
elif command -v dnf &>/dev/null; then
  PKG_MGR="dnf"
elif command -v yum &>/dev/null; then
  PKG_MGR="yum"
else
  fatal "Unsupported package manager. Install git, curl, and nginx manually then re-run."
fi

pkg_install() {
  case "$PKG_MGR" in
    apt) apt-get install -y -qq "$@" ;;
    dnf) dnf install -y -q "$@" ;;
    yum) yum install -y -q "$@" ;;
  esac
}

# ─── System packages ───────────────────────────────────────────────────────────
info "Updating package index…"
case "$PKG_MGR" in
  apt) apt-get update -qq ;;
  dnf) dnf check-update -q || true ;;
  yum) yum check-update -q || true ;;
esac

for pkg in git curl nginx; do
  if ! command -v "$pkg" &>/dev/null; then
    info "Installing $pkg…"
    pkg_install "$pkg"
  else
    success "$pkg already installed."
  fi
done

# ─── Bun ───────────────────────────────────────────────────────────────────────
if ! command -v bun &>/dev/null && [[ ! -f "$HOME/.bun/bin/bun" ]]; then
  info "Installing Bun…"
  curl -fsSL https://bun.sh/install | bash
fi

if [[ ! ":$PATH:" == *":$HOME/.bun/bin:"* ]]; then
  export PATH="$HOME/.bun/bin:$PATH"
fi

if ! command -v bun &>/dev/null; then
  fatal "Bun installation failed. Please install Bun manually and re-run."
fi
success "Bun $(bun --version) ready."

# ─── Node.js + npm ─────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || ! command -v npm &>/dev/null; then
  info "Installing Node.js…"
  case "$PKG_MGR" in
    apt)
      curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
      apt-get install -y -qq nodejs
      ;;
    dnf|yum)
      curl -fsSL https://rpm.nodesource.com/setup_lts.x | bash -
      "$PKG_MGR" install -y -q nodejs
      ;;
  esac
fi
success "Node.js $(node --version) ready."

# ─── PM2 ───────────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2…"
  npm install -g pm2 --quiet
fi
success "PM2 $(pm2 --version) ready."

# ─── Clone / update repo ───────────────────────────────────────────────────────
INSTALL_DIR="/opt/versiongate"
REPO_URL="https://github.com/versiongate-tech/VersionGate.git"

if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Updating existing VersionGate installation…"
  git -C "$INSTALL_DIR" pull --ff-only
else
  info "Cloning VersionGate to $INSTALL_DIR…"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi
success "Repository ready at $INSTALL_DIR."

# ─── Install engine dependencies ───────────────────────────────────────────────
info "Installing engine dependencies…"
bun install --cwd "$INSTALL_DIR" --frozen-lockfile 2>/dev/null || bun install --cwd "$INSTALL_DIR"

# ─── Build dashboard ───────────────────────────────────────────────────────────
info "Installing dashboard dependencies…"
bun install --cwd "$INSTALL_DIR/dashboard" --frozen-lockfile 2>/dev/null || bun install --cwd "$INSTALL_DIR/dashboard"

info "Building dashboard (Next.js static export)…"
cd "$INSTALL_DIR/dashboard" && bun run build
cd "$INSTALL_DIR"

# ─── Prisma generate ───────────────────────────────────────────────────────────
info "Running prisma generate…"
cd "$INSTALL_DIR" && bunx prisma generate

# ─── Write .env ────────────────────────────────────────────────────────────────
info "Writing $INSTALL_DIR/.env…"
cat > "$INSTALL_DIR/.env" <<EOF
DATABASE_URL="${DATABASE_URL}"
PORT=9090
NODE_ENV=production
DOCKER_NETWORK="versiongate-net"
NGINX_CONFIG_PATH="/etc/nginx/conf.d/versiongate.conf"
PROJECTS_ROOT_PATH="/var/versiongate/projects"
EOF

if [[ -n "$GEMINI_API_KEY" ]]; then
  echo "GEMINI_API_KEY=\"${GEMINI_API_KEY}\"" >> "$INSTALL_DIR/.env"
fi

success ".env written."

# ─── Run Prisma migrations ─────────────────────────────────────────────────────
info "Running database migrations (prisma db push)…"
cd "$INSTALL_DIR" && bunx prisma db push --accept-data-loss

# ─── Create directories ────────────────────────────────────────────────────────
info "Creating runtime directories…"
mkdir -p /var/log/versiongate
mkdir -p /var/versiongate/projects

# ─── Write Nginx config ────────────────────────────────────────────────────────
info "Writing Nginx configuration…"
cat > /etc/nginx/conf.d/versiongate.conf <<NGINX
server {
    ${NGINX_LISTEN}
    server_name ${NGINX_SERVER_NAME};

    client_max_body_size 50M;

    location / {
        proxy_pass         http://127.0.0.1:9090;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX

success "Nginx config written."

# ─── Reload / restart Nginx ────────────────────────────────────────────────────
info "Testing Nginx configuration…"
nginx -t

if systemctl is-active --quiet nginx 2>/dev/null; then
  nginx -s reload
  success "Nginx reloaded."
else
  systemctl enable nginx
  systemctl start nginx
  success "Nginx started."
fi

# ─── Start with PM2 ────────────────────────────────────────────────────────────
info "Starting VersionGate with PM2…"
cd "$INSTALL_DIR"

# Stop existing instance if running to avoid duplicates
pm2 delete versiongate-engine 2>/dev/null || true

pm2 start "$INSTALL_DIR/ecosystem.config.cjs"
pm2 save

# ─── PM2 startup ───────────────────────────────────────────────────────────────
SERVER_IP="$(hostname -I | awk '{print $1}')"
STARTUP_CMD="$(pm2 startup | grep 'sudo env' | head -1 || true)"

# ─── Success banner ────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  ✔ VersionGate is running!${RESET}"
echo    "  ─────────────────────────────────────────"
echo -e "  Dashboard: ${BOLD}http://${DOMAIN_OR_IP}${RESET}"
echo -e "  Direct:    ${BOLD}http://${SERVER_IP}:9090${RESET}"
echo    "  ─────────────────────────────────────────"
echo ""
echo -e "${YELLOW}${BOLD}  Auto-start on reboot:${RESET}"
echo    "  Run the command printed by PM2 above, or:"
echo -e "  ${BOLD}pm2 startup${RESET}  →  copy and run the displayed command"
echo    ""
echo -e "${CYAN}  Logs:${RESET}  pm2 logs versiongate-engine"
echo -e "${CYAN}  Status:${RESET} pm2 list"
echo ""
