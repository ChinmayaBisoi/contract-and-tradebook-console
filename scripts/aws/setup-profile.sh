#!/usr/bin/env bash
set -euo pipefail

AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-344626518162}"
AWS_REGION="${AWS_REGION:-us-east-1}"
PROFILE_NAME="${PROFILE_NAME:-contract-console}"

usage() {
  cat <<EOF
Configure AWS CLI profile "${PROFILE_NAME}" for account ${AWS_ACCOUNT_ID}.

Usage:
  $0 sso <sso_start_url> [sso_region]
  $0 keys

Modes:
  sso   Adds an SSO profile (reuses ~/.aws/config sso-session if present)
  keys  Runs interactive 'aws configure --profile ${PROFILE_NAME}'

After setup:
  aws sso login --profile ${PROFILE_NAME}   # for sso mode
  AWS_PROFILE=${PROFILE_NAME} ./scripts/aws/provision.sh
EOF
}

append_profile() {
  local mode="$1"
  local aws_config="${HOME}/.aws/config"

  mkdir -p "${HOME}/.aws"
  touch "${aws_config}"

  if grep -q "\\[profile ${PROFILE_NAME}\\]" "${aws_config}"; then
    echo "Profile ${PROFILE_NAME} already exists in ${aws_config}"
    return
  fi

  if [[ "${mode}" == "sso" ]]; then
    local sso_start_url="$2"
    local sso_region="${3:-us-east-1}"
    local session_name="ContractConsole"

    if ! grep -q "\\[sso-session ${session_name}\\]" "${aws_config}"; then
      cat >> "${aws_config}" <<EOF

[sso-session ${session_name}]
sso_start_url = ${sso_start_url}
sso_region = ${sso_region}
sso_registration_scopes = sso:account:access
EOF
    fi

    cat >> "${aws_config}" <<EOF

[profile ${PROFILE_NAME}]
sso_session = ${session_name}
sso_account_id = ${AWS_ACCOUNT_ID}
sso_role_name = AdministratorAccess
region = ${AWS_REGION}
EOF
    echo "Added SSO profile ${PROFILE_NAME}. Run: aws sso login --profile ${PROFILE_NAME}"
  else
    aws configure --profile "${PROFILE_NAME}" set region "${AWS_REGION}"
    echo "Run: aws configure --profile ${PROFILE_NAME}"
    echo "Enter access key, secret key, and leave default region as ${AWS_REGION}."
    aws configure --profile "${PROFILE_NAME}"
  fi
}

main() {
  if [[ "${#}" -lt 1 ]]; then
    usage
    exit 1
  fi

  case "$1" in
    sso)
      if [[ "${#}" -lt 2 ]]; then
        usage
        exit 1
      fi
      append_profile sso "$2" "${3:-us-east-1}"
      ;;
    keys)
      append_profile keys
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
