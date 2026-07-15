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

aws ecs wait services-stable \
  --cluster "${ECS_CLUSTER}" \
  --services "${ECS_SERVICE}"

echo "Deployment completed with task definition ${task_definition_arn}"
