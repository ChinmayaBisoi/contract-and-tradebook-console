#!/usr/bin/env bash
set -euo pipefail

if [[ "${#}" -ne 7 ]]; then
  echo "Usage:"
  echo "  $0 <repo_owner/repo_name> <env_name> <ec2_host> <ec2_user> <ec2_ssh_key_file> <database_url> <direct_url>"
  exit 1
fi

REPO="${1}"
ENV_NAME="${2}"
EC2_HOST="${3}"
EC2_USER="${4}"
EC2_SSH_KEY_FILE="${5}"
DATABASE_URL="${6}"
DIRECT_URL="${7}"

if [[ ! -f "${EC2_SSH_KEY_FILE}" ]]; then
  echo "SSH key file not found: ${EC2_SSH_KEY_FILE}"
  exit 1
fi

gh api --method PUT "repos/${REPO}/environments/${ENV_NAME}" >/dev/null
gh secret set EC2_HOST --env "${ENV_NAME}" --body "${EC2_HOST}"
gh secret set EC2_USER --env "${ENV_NAME}" --body "${EC2_USER}"
gh secret set EC2_SSH_KEY --env "${ENV_NAME}" < "${EC2_SSH_KEY_FILE}"
gh secret set DATABASE_URL --env "${ENV_NAME}" --body "${DATABASE_URL}"
gh secret set DIRECT_URL --env "${ENV_NAME}" --body "${DIRECT_URL}"

echo "Environment ${ENV_NAME} is configured."
