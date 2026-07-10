import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { handler } from "@/app/api/trpc/[trpc]/route";
import { makeQueryClient } from "@/trpc/query-client";
import { appRouter } from "@/trpc/routers/_app";

describe("tRPC setup", () => {
  it("exposes a Zod-validated hello procedure", async () => {
    const caller = appRouter.createCaller({ headers: new Headers() });

    await expect(caller.hello({ text: "ContractView" })).resolves.toEqual({
      greeting: "hello ContractView",
    });
    await expect(
      caller.hello({ text: 123 } as unknown as { text: string }),
    ).rejects.toThrow();
  });

  it("creates a TanStack Query client with SSR-friendly defaults", () => {
    const queryClient = makeQueryClient();

    expect(queryClient).toBeInstanceOf(QueryClient);
    expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(30_000);
  });

  it("serves the hello procedure through the App Router fetch handler", async () => {
    const input = encodeURIComponent(JSON.stringify({ text: "operations" }));
    const request = new Request(
      `http://localhost/api/trpc/hello?input=${input}`,
    );

    const response = await handler(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.data).toEqual({
      greeting: "hello operations",
    });
  });
});
