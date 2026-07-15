import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("realtime SSE routes", () => {
  it("adds an authenticated user-scoped stream route", () => {
    const source = read("app/api/events/route.ts");

    expect(source).toContain("auth()");
    expect(source).toContain("subscribeToRealtimeEvents");
    expect(source).toContain("userId: session.userId");
    expect(source).toContain('"Content-Type": "text/event-stream"');
  });

  it("adds an organisation-scoped stream route with org permission checks", () => {
    const source = read("app/api/org/[orgId]/events/route.ts");

    expect(source).toContain("auth()");
    expect(source).toContain("checkOrgPermission");
    expect(source).toContain('action: "organisation:read"');
    expect(source).toContain("subscribeToRealtimeEvents");
    expect(source).toContain("organisationId: params.orgId");
    expect(source).toContain('"Content-Type": "text/event-stream"');
  });
});
