// @vitest-environment node
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import { trpcErrorResponse } from "@/lib/http/trpc-error-response";

describe("REST tRPC error responses", () => {
  it.each([
    ["UNAUTHORIZED", 403],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
    ["BAD_REQUEST", 400],
  ] as const)("maps %s errors to HTTP %s", (code, status) => {
    const response = trpcErrorResponse(new TRPCError({ code }));

    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(status);
  });

  it("leaves unexpected errors for the route error boundary", () => {
    expect(trpcErrorResponse(new Error("boom"))).toBeNull();
  });
});
