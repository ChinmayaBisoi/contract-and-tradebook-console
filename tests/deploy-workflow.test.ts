import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("deploy workflow", () => {
  it("uses AWS OIDC, ECR, and ECS instead of EC2 rsync", () => {
    const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
    const deployScript = readFileSync("scripts/aws/deploy-ecs.sh", "utf8");

    expect(workflow).toContain("aws-actions/configure-aws-credentials");
    expect(workflow).toContain("amazon-ecr-login");
    expect(workflow).toContain("./scripts/aws/deploy-ecs.sh");
    expect(deployScript).toContain("aws ecs update-service");
    expect(workflow).not.toContain("rsync -az");
    expect(workflow).not.toContain("EC2_HOST");
  });
});
