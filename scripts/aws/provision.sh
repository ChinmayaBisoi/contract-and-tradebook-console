#!/usr/bin/env bash
set -euo pipefail

# Provisions EC2 deployment infrastructure for contract-console using AWS CLI.
# Mirrors my-app/infra/main.tf.

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-344626518162}"
PROJECT_NAME="${PROJECT_NAME:-contract-console}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.micro}"
KEY_NAME="${KEY_NAME:-contract-console-deploy-key}"
DEPLOY_PUBLIC_KEY_FILE="${DEPLOY_PUBLIC_KEY_FILE:-${HOME}/.ssh/contract-console-deploy.pub}"
ENVIRONMENTS=(staging production)

usage() {
  cat <<EOF
Usage: $0 [--destroy]

Environment variables:
  AWS_REGION              Default: us-east-1
  AWS_ACCOUNT_ID          Default: 344626518162
  AWS_PROFILE             Optional AWS CLI profile
  PROJECT_NAME            Default: contract-console
  INSTANCE_TYPE           Default: t3.micro
  KEY_NAME                Default: contract-console-deploy-key
  DEPLOY_PUBLIC_KEY_FILE  Default: ~/.ssh/contract-console-deploy.pub

Examples:
  AWS_PROFILE=contract-console $0
  $0 --destroy
EOF
}

aws_cli() {
  if [[ -n "${AWS_PROFILE:-}" ]]; then
    aws --profile "${AWS_PROFILE}" --region "${AWS_REGION}" "$@"
  else
    aws --region "${AWS_REGION}" "$@"
  fi
}

log() {
  echo "$@" >&2
}

require_account() {
  local actual
  actual="$(aws_cli sts get-caller-identity --query Account --output text)"
  if [[ "${actual}" != "${AWS_ACCOUNT_ID}" ]]; then
    echo "Expected AWS account ${AWS_ACCOUNT_ID}, got ${actual}."
    echo "Set AWS_PROFILE or credentials for the correct account."
    exit 1
  fi
  echo "Using AWS account ${actual} in ${AWS_REGION}"
}

tag_spec() {
  local env="$1"
  local name="$2"
  local resource_type="${name}"
  if [[ "${name}" == "eip" ]]; then
    resource_type="elastic-ip"
  fi

  printf 'ResourceType=%s,Tags=[{Key=Name,Value=%s},{Key=Environment,Value=%s},{Key=Project,Value=%s}]' \
    "${resource_type}" "${PROJECT_NAME}-${env}-${name}" "${env}" "${PROJECT_NAME}"
}

ensure_key_pair() {
  if [[ ! -f "${DEPLOY_PUBLIC_KEY_FILE}" ]]; then
    echo "Deploy public key not found: ${DEPLOY_PUBLIC_KEY_FILE}"
    exit 1
  fi

  if aws_cli ec2 describe-key-pairs --key-names "${KEY_NAME}" >/dev/null 2>&1; then
    log "Key pair ${KEY_NAME} already exists"
    return
  fi

  aws_cli ec2 import-key-pair \
    --key-name "${KEY_NAME}" \
    --public-key-material "fileb://${DEPLOY_PUBLIC_KEY_FILE}" \
    --tag-specifications "ResourceType=key-pair,Tags=[{Key=Name,Value=${KEY_NAME}},{Key=Project,Value=${PROJECT_NAME}}]" \
    >/dev/null
  log "Created key pair ${KEY_NAME}"
}

get_default_vpc_id() {
  aws_cli ec2 describe-vpcs \
    --filters Name=isDefault,Values=true \
    --query 'Vpcs[0].VpcId' \
    --output text
}

get_default_subnet_id() {
  local vpc_id="$1"
  aws_cli ec2 describe-subnets \
    --filters Name=vpc-id,Values="${vpc_id}" \
    --query 'Subnets[0].SubnetId' \
    --output text
}

get_latest_al2023_ami() {
  aws_cli ec2 describe-images \
    --owners amazon \
    --filters \
      Name=name,Values='al2023-ami-2023.*-x86_64' \
      Name=architecture,Values=x86_64 \
    --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
    --output text
}

ensure_security_group() {
  local env="$1"
  local vpc_id="$2"
  local sg_name="${PROJECT_NAME}-${env}-sg"

  local existing
  existing="$(aws_cli ec2 describe-security-groups \
    --filters Name=group-name,Values="${sg_name}" Name=vpc-id,Values="${vpc_id}" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || true)"

  if [[ -n "${existing}" && "${existing}" != "None" ]]; then
    echo "${existing}"
    return
  fi

  local sg_id
  sg_id="$(aws_cli ec2 create-security-group \
    --group-name "${sg_name}" \
    --description "Security group for ${env} EC2 instance" \
    --vpc-id "${vpc_id}" \
    --tag-specifications "$(tag_spec "${env}" "security-group")" \
    --query GroupId \
    --output text)"

  aws_cli ec2 authorize-security-group-ingress --group-id "${sg_id}" --ip-permissions \
    IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges='[{CidrIp=0.0.0.0/0,Description=HTTP}]' \
    IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges='[{CidrIp=0.0.0.0/0,Description=HTTPS}]' \
    IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges='[{CidrIp=0.0.0.0/0,Description=SSH}]' \
    >/dev/null

  log "Created security group ${sg_id} for ${env}"
  echo "${sg_id}"
}

ensure_iam_role() {
  local env="$1"
  local role_name="${PROJECT_NAME}-${env}-ec2-role"

  if aws_cli iam get-role --role-name "${role_name}" >/dev/null 2>&1; then
    echo "${role_name}"
    return
  fi

  aws_cli iam create-role \
    --role-name "${role_name}" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "ec2.amazonaws.com"},
        "Action": "sts:AssumeRole"
      }]
    }' \
    --tags Key=Name,Value="${role_name}" Key=Environment,Value="${env}" Key=Project,Value="${PROJECT_NAME}" \
    >/dev/null

  aws_cli iam attach-role-policy \
    --role-name "${role_name}" \
    --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

  log "Created IAM role ${role_name}"
  echo "${role_name}"
}

ensure_instance_profile() {
  local env="$1"
  local role_name="$2"
  local profile_name="${PROJECT_NAME}-${env}-ec2-profile"

  if aws_cli iam get-instance-profile --instance-profile-name "${profile_name}" >/dev/null 2>&1; then
    echo "${profile_name}"
    return
  fi

  aws_cli iam create-instance-profile \
    --instance-profile-name "${profile_name}" \
    --tags Key=Name,Value="${profile_name}" Key=Environment,Value="${env}" Key=Project,Value="${PROJECT_NAME}" \
    >/dev/null

  aws_cli iam add-role-to-instance-profile \
    --instance-profile-name "${profile_name}" \
    --role-name "${role_name}"

  log "Created instance profile ${profile_name}"
  sleep 10
  echo "${profile_name}"
}

find_instance_by_name() {
  local env="$1"
  aws_cli ec2 describe-instances \
    --filters \
      Name=tag:Name,Values="${PROJECT_NAME}-${env}-ec2" \
      Name=instance-state-name,Values=pending,running,stopping,stopped \
    --query 'Reservations[0].Instances[0].InstanceId' \
    --output text 2>/dev/null || true
}

ensure_instance() {
  local env="$1"
  local ami_id="$2"
  local subnet_id="$3"
  local sg_id="$4"
  local profile_name="$5"

  local existing
  existing="$(find_instance_by_name "${env}")"
  if [[ -n "${existing}" && "${existing}" != "None" ]]; then
    log "EC2 instance for ${env} already exists: ${existing}"
    echo "${existing}"
    return
  fi

  local instance_id
  instance_id="$(aws_cli ec2 run-instances \
    --image-id "${ami_id}" \
    --instance-type "${INSTANCE_TYPE}" \
    --key-name "${KEY_NAME}" \
    --subnet-id "${subnet_id}" \
    --security-group-ids "${sg_id}" \
    --iam-instance-profile Name="${profile_name}" \
    --associate-public-ip-address \
    --block-device-mappings "[{
      \"DeviceName\": \"/dev/xvda\",
      \"Ebs\": {
        \"VolumeSize\": 16,
        \"VolumeType\": \"gp3\",
        \"Encrypted\": true,
        \"DeleteOnTermination\": true
      }
    }]" \
    --tag-specifications "$(tag_spec "${env}" "instance")" \
    --query 'Instances[0].InstanceId' \
    --output text)"

  log "Launched ${env} instance ${instance_id}; waiting until running..."
  aws_cli ec2 wait instance-running --instance-ids "${instance_id}"
  echo "${instance_id}"
}

ensure_eip() {
  local env="$1"
  local instance_id="$2"

  local existing
  existing="$(aws_cli ec2 describe-addresses \
    --filters Name=tag:Name,Values="${PROJECT_NAME}-${env}-eip" \
    --query 'Addresses[0].AllocationId' \
    --output text 2>/dev/null || true)"

  if [[ -n "${existing}" && "${existing}" != "None" ]]; then
    local public_ip
    public_ip="$(aws_cli ec2 describe-addresses --allocation-ids "${existing}" --query 'Addresses[0].PublicIp' --output text)"
    echo "${public_ip}"
    return
  fi

  local allocation_id
  allocation_id="$(aws_cli ec2 allocate-address \
    --domain vpc \
    --tag-specifications "$(tag_spec "${env}" "eip")" \
    --query AllocationId \
    --output text)"

  aws_cli ec2 associate-address \
    --instance-id "${instance_id}" \
    --allocation-id "${allocation_id}" \
    >/dev/null

  local public_ip
  public_ip="$(aws_cli ec2 describe-addresses --allocation-ids "${allocation_id}" --query 'Addresses[0].PublicIp' --output text)"
  log "Associated Elastic IP ${public_ip} with ${instance_id} (${env})"
  echo "${public_ip}"
}

provision() {
  require_account
  ensure_key_pair

  local vpc_id subnet_id ami_id
  vpc_id="$(get_default_vpc_id)"
  subnet_id="$(get_default_subnet_id "${vpc_id}")"
  ami_id="$(get_latest_al2023_ami)"

  echo "VPC: ${vpc_id}"
  echo "Subnet: ${subnet_id}"
  echo "AMI: ${ami_id}"

  local staging_instance_id=""
  local staging_public_ip=""
  local production_instance_id=""
  local production_public_ip=""

  for env in "${ENVIRONMENTS[@]}"; do
    echo ""
    echo "=== Provisioning ${env} ==="

    local sg_id role_name profile_name instance_id public_ip
    sg_id="$(ensure_security_group "${env}" "${vpc_id}")"
    role_name="$(ensure_iam_role "${env}")"
    profile_name="$(ensure_instance_profile "${env}" "${role_name}")"
    instance_id="$(ensure_instance "${env}" "${ami_id}" "${subnet_id}" "${sg_id}" "${profile_name}")"
    public_ip="$(ensure_eip "${env}" "${instance_id}")"

    if [[ "${env}" == "staging" ]]; then
      staging_instance_id="${instance_id}"
      staging_public_ip="${public_ip}"
    else
      production_instance_id="${instance_id}"
      production_public_ip="${public_ip}"
    fi
  done

  echo ""
  echo "=== Provisioning complete ==="
  echo "staging:"
  echo "  instance_id: ${staging_instance_id}"
  echo "  public_ip:   ${staging_public_ip}"
  echo "  ssh:         ssh -i ~/.ssh/contract-console-deploy deploy@${staging_public_ip}"
  echo "production:"
  echo "  instance_id: ${production_instance_id}"
  echo "  public_ip:   ${production_public_ip}"
  echo "  ssh:         ssh -i ~/.ssh/contract-console-deploy deploy@${production_public_ip}"

  cat <<EOF

Next steps:
1. Bootstrap each instance:
   ./scripts/aws/bootstrap-instances.sh <staging-ip> <production-ip>

2. Set /etc/contract-console/env on each instance with DATABASE_URL.

3. Configure GitHub environment secrets:
   ./scripts/github/setup-environments.sh <owner/repo> staging <staging-ip> deploy ~/.ssh/contract-console-deploy "<db-url>" "<direct-url>"
   ./scripts/github/setup-environments.sh <owner/repo> production <prod-ip> deploy ~/.ssh/contract-console-deploy "<db-url>" "<direct-url>"
EOF
}

destroy() {
  require_account

  for env in "${ENVIRONMENTS[@]}"; do
    echo "Destroying ${env}..."

    local instance_id
    instance_id="$(find_instance_by_name "${env}")"
    if [[ -n "${instance_id}" && "${instance_id}" != "None" ]]; then
      aws_cli ec2 terminate-instances --instance-ids "${instance_id}" >/dev/null
      aws_cli ec2 wait instance-terminated --instance-ids "${instance_id}" || true
    fi

    local allocation_id
    allocation_id="$(aws_cli ec2 describe-addresses \
      --filters Name=tag:Name,Values="${PROJECT_NAME}-${env}-eip" \
      --query 'Addresses[0].AllocationId' \
      --output text 2>/dev/null || true)"
    if [[ -n "${allocation_id}" && "${allocation_id}" != "None" ]]; then
      aws_cli ec2 release-address --allocation-id "${allocation_id}" || true
    fi

    local sg_name="${PROJECT_NAME}-${env}-sg"
    local sg_id
    sg_id="$(aws_cli ec2 describe-security-groups \
      --filters Name=group-name,Values="${sg_name}" \
      --query 'SecurityGroups[0].GroupId' \
      --output text 2>/dev/null || true)"
    if [[ -n "${sg_id}" && "${sg_id}" != "None" ]]; then
      aws_cli ec2 delete-security-group --group-id "${sg_id}" || true
    fi

    local profile_name="${PROJECT_NAME}-${env}-ec2-profile"
    local role_name="${PROJECT_NAME}-${env}-ec2-role"
    if aws_cli iam get-instance-profile --instance-profile-name "${profile_name}" >/dev/null 2>&1; then
      aws_cli iam remove-role-from-instance-profile \
        --instance-profile-name "${profile_name}" \
        --role-name "${role_name}" || true
      aws_cli iam delete-instance-profile --instance-profile-name "${profile_name}" || true
    fi
    if aws_cli iam get-role --role-name "${role_name}" >/dev/null 2>&1; then
      aws_cli iam detach-role-policy \
        --role-name "${role_name}" \
        --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore || true
      aws_cli iam delete-role --role-name "${role_name}" || true
    fi
  done

  if aws_cli ec2 describe-key-pairs --key-names "${KEY_NAME}" >/dev/null 2>&1; then
    aws_cli ec2 delete-key-pair --key-name "${KEY_NAME}" || true
  fi

  echo "Destroy complete."
}

main() {
  if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    usage
    exit 0
  fi

  if [[ "${1:-}" == "--destroy" ]]; then
    destroy
    exit 0
  fi

  provision
}

main "$@"
