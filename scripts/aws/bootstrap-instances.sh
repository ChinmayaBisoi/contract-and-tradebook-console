#!/usr/bin/env bash
set -euo pipefail

# Bootstraps staging and production EC2 instances after provision.sh.

SSH_KEY="${SSH_KEY:-${HOME}/.ssh/contract-console-deploy}"
SSH_USER="${SSH_USER:-ec2-user}"
APP_SRC="${APP_SRC:-$(cd "$(dirname "$0")/../.." && pwd)}"

usage() {
  cat <<EOF
Usage: $0 <staging-ip> <production-ip>

Environment variables:
  SSH_KEY   Default: ~/.ssh/contract-console-deploy
  SSH_USER  Default: ec2-user (Amazon Linux 2023 default)
  APP_SRC   Default: my-app directory
EOF
}

if [[ "${#}" -ne 2 ]]; then
  usage
  exit 1
fi

STAGING_IP="$1"
PRODUCTION_IP="$2"

if [[ ! -f "${SSH_KEY}" ]]; then
  echo "SSH key not found: ${SSH_KEY}"
  exit 1
fi

bootstrap_host() {
  local ip="$1"
  local env="$2"

  echo "=== Bootstrapping ${env} (${ip}) ==="

  ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=accept-new "${SSH_USER}@${ip}" "mkdir -p /tmp/contract-console-bootstrap"

  rsync -az --delete \
    -e "ssh -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new" \
    --exclude node_modules \
    --exclude .next \
    --exclude .git \
    "${APP_SRC}/" "${SSH_USER}@${ip}:/tmp/contract-console-bootstrap/"

  ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=accept-new "${SSH_USER}@${ip}" \
    "cd /tmp/contract-console-bootstrap && sudo bash scripts/ec2/bootstrap.sh"

  echo "Bootstrap complete for ${env}. Edit /etc/contract-console/env on the instance before first deploy."
}

bootstrap_host "${STAGING_IP}" "staging"
bootstrap_host "${PRODUCTION_IP}" "production"

echo ""
echo "Done. Set DATABASE_URL in /etc/contract-console/env on each host, then configure GitHub secrets."
