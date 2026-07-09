#!/usr/bin/env bash
set -euo pipefail

APP_NAME="contract-console"
RELEASES_ROOT="/opt/${APP_NAME}/releases"
CURRENT_LINK="/opt/${APP_NAME}/current"
SERVICE_NAME="contract-console"
KEEP_RELEASES=3

if [[ "${#}" -ne 1 ]]; then
  echo "Usage: $0 <release_directory>"
  exit 1
fi

RELEASE_DIR="${1}"

if [[ ! -d "${RELEASE_DIR}" ]]; then
  echo "Release directory does not exist: ${RELEASE_DIR}"
  exit 1
fi

if [[ ! -f "${RELEASE_DIR}/server.js" ]]; then
  echo "server.js not found in ${RELEASE_DIR}"
  exit 1
fi

ln -sfn "${RELEASE_DIR}" "${CURRENT_LINK}"
chown -h deploy:deploy "${CURRENT_LINK}"

systemctl restart "${SERVICE_NAME}"
systemctl --no-pager --full status "${SERVICE_NAME}"

curl -fsS "http://127.0.0.1:3000" >/dev/null

cd "${RELEASES_ROOT}"
ls -1dt */ 2>/dev/null | awk "NR>${KEEP_RELEASES}" | xargs -r rm -rf
