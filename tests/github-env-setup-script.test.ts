import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("GitHub environment setup helper", () => {
  it("configures AWS deploy secrets and variables for ECS and CloudFront", () => {
    const script = readFileSync("scripts/github/setup-environments.sh", "utf8");

    expect(script).toContain("required_secrets=(");
    expect(script).toContain("AWS_DEPLOY_ROLE_ARN");
    expect(script).toContain("CLOUDFRONT_URL");
    expect(script).toContain("required_variables=(");
    expect(script).toContain("ECR_REPOSITORY");
    expect(script).toContain("ECS_CLUSTER");
    expect(script).toContain("gh variable set");
    expect(script).not.toContain("EC2_HOST");
  });
});
