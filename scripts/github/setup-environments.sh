#!/usr/bin/env bash

set -euo pipefail

if [[ "${#}" -ne 2 ]]; then
  echo "Usage:"
  echo "  AWS_DEPLOY_ROLE_ARN=... CLOUDFRONT_URL=... DATABASE_URL=... DIRECT_URL=... \\"
  echo "  AWS_REGION=... ECR_REPOSITORY=... ECS_CLUSTER=... ECS_SERVICE=... ECS_TASK_FAMILY=... \\"
  echo "  ECS_CONTAINER_NAME=... ECS_LOG_GROUP=... ECS_EXECUTION_ROLE_ARN=... ECS_TASK_ROLE_ARN=... \\"
  echo "  DATABASE_URL_SECRET_ARN=... DIRECT_URL_SECRET_ARN=... CLERK_SECRET_KEY_SECRET_ARN=... \\"
  echo "  UPLOADTHING_TOKEN_SECRET_ARN=... NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=... \\"
  echo "  NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=... NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=... \\"
  echo "  $0 <repo_owner/repo_name> <env_name>"
  exit 1
fi

require_env() {
  local name="${1}"

  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
}

REPO="${1}"
ENV_NAME="${2}"

required_secrets=(
  AWS_DEPLOY_ROLE_ARN
  CLOUDFRONT_URL
  DATABASE_URL
  DIRECT_URL
)

required_variables=(
  AWS_REGION
  ECR_REPOSITORY
  ECS_CLUSTER
  ECS_SERVICE
  ECS_TASK_FAMILY
  ECS_CONTAINER_NAME
  ECS_LOG_GROUP
  ECS_EXECUTION_ROLE_ARN
  ECS_TASK_ROLE_ARN
  DATABASE_URL_SECRET_ARN
  DIRECT_URL_SECRET_ARN
  CLERK_SECRET_KEY_SECRET_ARN
  UPLOADTHING_TOKEN_SECRET_ARN
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL
)

for name in "${required_secrets[@]}" "${required_variables[@]}"; do
  require_env "${name}"
done

gh api --method PUT "repos/${REPO}/environments/${ENV_NAME}" >/dev/null

for name in "${required_secrets[@]}"; do
  gh secret set "${name}" --env "${ENV_NAME}" --body "${!name}"
done

for name in "${required_variables[@]}"; do
  gh variable set "${name}" --env "${ENV_NAME}" --body "${!name}"
done

echo "Environment ${ENV_NAME} is configured for ECS and CloudFront."
