import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AWS deployment runbook", () => {
  it("documents CloudFront, ECS, and ECR instead of EC2 SSH deploys", () => {
    const doc = readFileSync("docs/deployment-aws.md", "utf8");

    expect(doc).toContain("CloudFront");
    expect(doc).toContain("ECS");
    expect(doc).toContain("ECR");
    expect(doc).toContain("main");
    expect(doc).toContain("Deployment URL");
    expect(doc).toContain("OPENAI_API_KEY_SECRET_ARN");
    expect(doc).toContain("OPENAI_MAPPING_MODEL");
    expect(doc).not.toContain("Push to `staging` deploys to staging EC2");
  });
});
