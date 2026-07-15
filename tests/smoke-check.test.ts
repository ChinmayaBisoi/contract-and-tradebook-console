import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("smoke check script", () => {
  it("checks both the app root and the health endpoint", () => {
    const script = readFileSync("scripts/aws/smoke-check.sh", "utf8");

    expect(script).toContain("/api/health");
    expect(script).toContain("curl");
    expect(script).toContain("CLOUDFRONT_URL");
  });
});
