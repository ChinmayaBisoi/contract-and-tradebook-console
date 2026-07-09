# AWS EC2 deployment runbook

This project deploys to AWS EC2 with GitHub Actions using branch-driven environments:

- Push to `staging` deploys to staging EC2
- Push to `main` deploys to production EC2

No Docker images are used in deployment.

## 1) Provision infrastructure

From `my-app/infra`:

```bash
terraform init
terraform apply \
  -var="deploy_public_key=ssh-ed25519 AAAA... your-key" \
  -var="aws_region=us-east-1"
```

Terraform creates:

- One EC2 for `staging`
- One EC2 for `production`
- Elastic IP per instance
- Security groups
- IAM role/profile with SSM access
- EC2 key pair from your public key

## 2) Bootstrap each EC2 instance

Copy this repository to each instance once, then run:

```bash
sudo bash scripts/ec2/bootstrap.sh
```

After bootstrap, edit `/etc/contract-console/env` and set:

- `DATABASE_URL` for that environment
- `NODE_ENV=production`
- `PORT=3000`

Then restart the service:

```bash
sudo systemctl restart contract-console
```

## 2.5) Neon database branches

Create two Neon branches or two Neon databases:

- One for staging
- One for production

Use each environment's connection strings as `DATABASE_URL` and `DIRECT_URL` in GitHub environment secrets.

## 3) GitHub setup

Create environments:

- `staging`
- `production`

Required environment secrets for each:

- `EC2_HOST`
- `EC2_USER`
- `EC2_SSH_KEY`
- `DATABASE_URL`
- `DIRECT_URL`

The deploy workflow is `.github/workflows/deploy.yml`.

Helper command (run twice, once per environment):

```bash
./scripts/github/setup-environments.sh \
  ChinmayaBisoi/contract-and-tradebook-console \
  staging \
  <staging-ec2-host> \
  deploy \
  ~/.ssh/contract-console-deploy \
  "<staging-database-url>" \
  "<staging-direct-url>"
```

```bash
./scripts/github/setup-environments.sh \
  ChinmayaBisoi/contract-and-tradebook-console \
  production \
  <production-ec2-host> \
  deploy \
  ~/.ssh/contract-console-deploy \
  "<production-database-url>" \
  "<production-direct-url>"
```

Also create and push the `staging` branch:

```bash
git checkout -b staging
git push -u origin staging
```

## 4) First deployment

1. Push to `staging`.
2. Confirm workflow success in Actions.
3. SSH to staging instance and verify:

```bash
sudo systemctl status contract-console
curl -I http://127.0.0.1:3000
curl -I http://<staging-elastic-ip>
```

4. Push to `main` after staging passes.

## 5) Rollback

On the target EC2:

```bash
sudo ls -1dt /opt/contract-console/releases/* | head
sudo ln -sfn /opt/contract-console/releases/<previous_sha> /opt/contract-console/current
sudo systemctl restart contract-console
```

## 6) Optional HTTPS with custom domain

If domain DNS already points to EC2 Elastic IP:

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d staging.yourdomain.com
sudo certbot --nginx -d app.yourdomain.com
```

Ensure security group allows `443/tcp`.
