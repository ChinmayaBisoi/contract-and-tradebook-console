#!/usr/bin/env bash
set -euo pipefail

APP_NAME="contract-console"
APP_USER="deploy"
APP_GROUP="deploy"
APP_ROOT="/opt/${APP_NAME}"
ENV_ROOT="/etc/${APP_NAME}"
NGINX_SITE_CONF="/etc/nginx/conf.d/${APP_NAME}.conf"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root."
  exit 1
fi

dnf update -y
dnf install -y nginx git rsync tar

curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs

if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --create-home --shell /bin/bash "${APP_USER}"
fi

if ! getent group "${APP_GROUP}" >/dev/null 2>&1; then
  groupadd --system "${APP_GROUP}"
fi

usermod -a -G "${APP_GROUP}" "${APP_USER}"

DEFAULT_SSH_USER="ec2-user"
if [[ -f "/home/${DEFAULT_SSH_USER}/.ssh/authorized_keys" ]]; then
  install -d -m 700 -o "${APP_USER}" -g "${APP_GROUP}" "/home/${APP_USER}/.ssh"
  cp "/home/${DEFAULT_SSH_USER}/.ssh/authorized_keys" "/home/${APP_USER}/.ssh/authorized_keys"
  chown "${APP_USER}:${APP_GROUP}" "/home/${APP_USER}/.ssh/authorized_keys"
  chmod 600 "/home/${APP_USER}/.ssh/authorized_keys"
fi

cat > /etc/sudoers.d/contract-console-deploy <<'EOF'
deploy ALL=(ALL) NOPASSWD: /bin/bash /opt/contract-console/releases/*/scripts/ec2/deploy.sh *, /usr/bin/bash /opt/contract-console/releases/*/scripts/ec2/deploy.sh *, /usr/bin/systemctl, /bin/ln, /usr/bin/chown, /usr/bin/curl, /usr/bin/rm
EOF
chmod 440 /etc/sudoers.d/contract-console-deploy

mkdir -p "${APP_ROOT}/releases" "${APP_ROOT}/shared" "${ENV_ROOT}"
chown -R "${APP_USER}:${APP_GROUP}" "${APP_ROOT}"
chmod 755 "${APP_ROOT}" "${APP_ROOT}/releases" "${APP_ROOT}/shared"

cat > "${ENV_ROOT}/env" <<'EOF'
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
DATABASE_URL=
EOF
chmod 600 "${ENV_ROOT}/env"
chown root:root "${ENV_ROOT}/env"

cp scripts/ec2/contract-console.service /etc/systemd/system/contract-console.service
chmod 644 /etc/systemd/system/contract-console.service

cp scripts/ec2/nginx-contract-console.conf "${NGINX_SITE_CONF}"
chmod 644 "${NGINX_SITE_CONF}"

nginx -t
systemctl daemon-reload
systemctl enable nginx
systemctl restart nginx
systemctl enable contract-console

echo "Bootstrap complete. Update ${ENV_ROOT}/env with real secrets before first deploy."
