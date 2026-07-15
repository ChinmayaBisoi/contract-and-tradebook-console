# AWS CloudFront + ECS deployment runbook

This project deploys the standalone Next.js application from `my-app/` to AWS using:

- **ECR** for the production image
- **ECS Fargate** for the running container
- **Application Load Balancer** as the CloudFront origin
- **CloudFront** as the public entry point and cache layer
- **GitHub Actions** with AWS OIDC for CI/CD

The checked-in workflow is `.github/workflows/deploy.yml`.

## 1) Runtime shape

The deployment keeps the existing production contract:

- `next.config.ts` uses `output: "standalone"`
- `Dockerfile` builds the app and runs `node server.js`
- `/api/health` provides the ALB and post-deploy smoke-check endpoint

Traffic flow:

`CloudFront -> ALB -> ECS Fargate task -> Next.js standalone server -> Neon Postgres`

## 2) AWS resources

Create or verify the following resources per environment:

- ECR repository for the application image
- ECS cluster
- ECS service
- ECS task definition family
- ALB and target group
- CloudFront distribution with the ALB as the origin
- CloudWatch log group for the container
- ECS execution role
- ECS task role

Recommended target-group health check:

- Path: `/api/health`
- Port: `traffic-port`
- Protocol: `HTTP`
- Matcher: `200`

Recommended CloudFront behaviors:

- Default behavior: forward to ALB with caching disabled or minimized for dynamic app routes
- `/_next/static/*`: enable long TTL caching
- Static assets under `/public`: enable long TTL caching when filenames are versioned

## 3) Secrets and configuration

### GitHub environment secrets

Set these in both `staging` and `production` environments:

- `AWS_DEPLOY_ROLE_ARN`
- `DATABASE_URL`
- `DIRECT_URL`
- `CLOUDFRONT_URL`

### GitHub environment variables

Set these in both `staging` and `production` environments:

- `AWS_REGION`
- `ECR_REPOSITORY`
- `ECS_CLUSTER`
- `ECS_SERVICE`
- `ECS_TASK_FAMILY`
- `ECS_CONTAINER_NAME`
- `ECS_LOG_GROUP`
- `ECS_EXECUTION_ROLE_ARN`
- `ECS_TASK_ROLE_ARN`
- `DATABASE_URL_SECRET_ARN`
- `DIRECT_URL_SECRET_ARN`
- `CLERK_SECRET_KEY_SECRET_ARN`
- `UPLOADTHING_TOKEN_SECRET_ARN`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL`
- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`

### AWS secret stores

For the ECS task runtime, store sensitive app values in AWS Secrets Manager or SSM Parameter Store and provide the resulting ARNs through the GitHub environment variables listed above.

At minimum, the ECS task should receive:

- `DATABASE_URL`
- `DIRECT_URL`
- `CLERK_SECRET_KEY`
- `UPLOADTHING_TOKEN`

## 4) Deployment workflow

On pushes to `staging` or `main`, the workflow:

1. installs dependencies with Bun
2. runs lint, tests, Prisma generation, and a production build
3. assumes the AWS deploy role through OIDC
4. logs in to ECR
5. builds and pushes the production Docker image tagged with the Git SHA
6. runs `prisma migrate deploy` against the target database
7. renders the ECS task definition from `aws/task-definition.json`
8. registers the new ECS task definition and updates the ECS service
9. waits for ECS to reach steady state
10. smoke-checks the CloudFront URL and `/api/health`

## 5) Manual AWS setup checklist

Before the workflow can succeed, verify:

```bash
aws ecr describe-repositories --repository-names <repo>
aws ecs describe-clusters --clusters <cluster>
aws ecs describe-services --cluster <cluster> --services <service>
aws cloudfront list-distributions
```

Also confirm:

- the ECS service uses subnets and security groups that allow ALB-to-task traffic on port `3000`
- the ALB target group points to the ECS service
- the CloudFront origin points to the ALB DNS name
- the CloudFront certificate is valid in `us-east-1` when using a custom domain

## 6) Local validation

From `my-app/`:

```bash
bun run test
bun run lint:ci
bun run build
```

Render the ECS task definition locally:

```bash
IMAGE_URI=example.dkr.ecr.us-east-1.amazonaws.com/contractview:test \
TASK_FAMILY=contractview \
CONTAINER_NAME=contractview \
AWS_REGION=us-east-1 \
LOG_GROUP=/ecs/contractview \
EXECUTION_ROLE_ARN=arn:aws:iam::123456789012:role/ecsExecution \
TASK_ROLE_ARN=arn:aws:iam::123456789012:role/contractviewTask \
DATABASE_URL_SECRET_ARN=arn:aws:secretsmanager:us-east-1:123456789012:secret:database \
DIRECT_URL_SECRET_ARN=arn:aws:secretsmanager:us-east-1:123456789012:secret:direct \
CLERK_SECRET_KEY_SECRET_ARN=arn:aws:secretsmanager:us-east-1:123456789012:secret:clerk \
UPLOADTHING_TOKEN_SECRET_ARN=arn:aws:secretsmanager:us-east-1:123456789012:secret:uploadthing \
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_example \
NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/dashboard \
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard \
node scripts/aws/render-ecs-task-definition.mjs aws/task-definition.json /tmp/task-definition.rendered.json
```

Smoke-check a live distribution:

```bash
CLOUDFRONT_URL=https://example.cloudfront.net ./scripts/aws/smoke-check.sh
```

## 7) Rollback

Rollback means redeploying a previous ECR image tag:

1. identify the last known good image tag
2. re-render the task definition with that image
3. register the task definition
4. update the ECS service to that revision
5. rerun the smoke check

Example:

```bash
aws ecs describe-services --cluster <cluster> --services <service>
aws ecs list-task-definitions --family-prefix <task-family> --sort DESC
```

## 8) Notes about Nx

Nx is present at the workspace level, but this deployment path does not depend on a full Nx migration. The current AWS pipeline deploys the real app from `my-app/` and can later be accelerated with Nx task caching once the runtime path is stable.
