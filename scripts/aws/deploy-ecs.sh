#!/usr/bin/env bash

set -euo pipefail

: "${TASK_DEFINITION_PATH:?TASK_DEFINITION_PATH is required}"
: "${ECS_CLUSTER:?ECS_CLUSTER is required}"
: "${ECS_SERVICE:?ECS_SERVICE is required}"

task_definition_arn="$(
  aws ecs register-task-definition \
    --cli-input-json "file://${TASK_DEFINITION_PATH}" \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text
)"

aws ecs update-service \
  --cluster "${ECS_CLUSTER}" \
  --service "${ECS_SERVICE}" \
  --task-definition "${task_definition_arn}" \
  --force-new-deployment \
  >/dev/null

deploy_timeout_seconds="${ECS_DEPLOY_TIMEOUT_SECONDS:-1800}"
deploy_deadline=$((SECONDS + deploy_timeout_seconds))

while ((SECONDS < deploy_deadline)); do
  read -r deployment_count running_count desired_count pending_count rollout_state <<<"$(
    aws ecs describe-services \
      --cluster "${ECS_CLUSTER}" \
      --services "${ECS_SERVICE}" \
      --query 'services[0].[length(deployments),runningCount,desiredCount,pendingCount,deployments[0].rolloutState]' \
      --output text
  )"

  echo "ECS rollout state=${rollout_state} deployments=${deployment_count} running=${running_count}/${desired_count} pending=${pending_count}"

  if [[ "${rollout_state}" == "FAILED" ]]; then
    echo "ECS deployment failed for task definition ${task_definition_arn}" >&2
    exit 1
  fi

  if [[ "${rollout_state}" == "COMPLETED" \
    && "${deployment_count}" == "1" \
    && "${running_count}" == "${desired_count}" \
    && "${pending_count}" == "0" ]]; then
    echo "Deployment completed with task definition ${task_definition_arn}"
    exit 0
  fi

  sleep 15
done

echo "Timed out waiting ${deploy_timeout_seconds}s for ECS deployment ${task_definition_arn}" >&2
aws ecs describe-services \
  --cluster "${ECS_CLUSTER}" \
  --services "${ECS_SERVICE}" \
  --query 'services[0].{deployments:deployments,events:events[0:10]}' \
  --output json >&2
exit 1
