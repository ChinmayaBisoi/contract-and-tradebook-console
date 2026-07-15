import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OrganisationAnalyticsPage from "@/app/(protected)/org/[orgId]/page";

type Analytics = {
  activeMemberCount: number;
  disabledMemberCount: number;
  pendingInvitationCount: number;
  createdAt: Date;
  ageInDays: number;
};

const analytics: Analytics = {
  activeMemberCount: 6,
  disabledMemberCount: 2,
  pendingInvitationCount: 3,
  createdAt: new Date("2026-07-01T23:30:00.000Z"),
  ageInDays: 14,
};

const clientState = vi.hoisted(() => ({
  query: vi.fn(),
}));

const serverMocks = vi.hoisted(() => ({
  prefetchQuery: vi.fn(),
  queryOptions: vi.fn((input: { organisationId: string }) => ({ input })),
}));

vi.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    organisation: {
      getAnalytics: {
        queryOptions: ({ organisationId }: { organisationId: string }) => ({
          queryKey: [
            ["organisation", "getAnalytics"],
            { input: { organisationId } },
          ],
          queryFn: clientState.query,
        }),
      },
    },
  }),
}));

vi.mock("@/trpc/server", () => ({
  getQueryClient: () => ({ prefetchQuery: serverMocks.prefetchQuery }),
  HydrateClient: ({ children }: { children: ReactNode }) => children,
  trpc: {
    organisation: {
      getAnalytics: { queryOptions: serverMocks.queryOptions },
    },
  },
}));

const Page = OrganisationAnalyticsPage as unknown as (props: {
  params: Promise<{ orgId: string }>;
}) => Promise<ReactNode>;

async function renderPage(queryClient = new QueryClient()) {
  const page = await Page({ params: Promise.resolve({ orgId: "org_1" }) });

  return render(
    <QueryClientProvider client={queryClient}>
      <h1>Contract Operations</h1>
      {page}
    </QueryClientProvider>,
  );
}

describe("OrganisationAnalytics", () => {
  beforeEach(() => {
    clientState.query.mockReset();
    clientState.query.mockResolvedValue(analytics);
    serverMocks.prefetchQuery.mockReset();
    serverMocks.queryOptions.mockClear();
  });

  it("starts analytics prefetch without waiting for the pending query", async () => {
    serverMocks.prefetchQuery.mockReturnValue(new Promise(() => undefined));

    const result = await Promise.race([
      Page({ params: Promise.resolve({ orgId: "org_1" }) }),
      new Promise((resolve) => setTimeout(() => resolve("timed out"), 25)),
    ]);

    expect(result).not.toBe("timed out");
    expect(serverMocks.queryOptions).toHaveBeenCalledWith({
      organisationId: "org_1",
    });
    expect(serverMocks.prefetchQuery).toHaveBeenCalledTimes(1);
  });

  it("shows real member, invitation, age, and UTC creation metrics", async () => {
    await renderPage();

    expect(await screen.findByText("6")).toBeInTheDocument();
    expect(screen.getByText("Active members")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Disabled members")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Pending invitations")).toBeInTheDocument();
    expect(screen.getByText("14 days")).toBeInTheDocument();
    expect(screen.getByText("1 Jul 2026")).toBeInTheDocument();
  });

  it.each([
    [0, "Created today"],
    [1, "1 day"],
    [14, "14 days"],
  ])("renders a sensible age label for %i days", async (ageInDays, label) => {
    clientState.query.mockResolvedValue({ ...analytics, ageInDays });

    await renderPage();

    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it("labels unconnected analytics instead of presenting false zeroes", async () => {
    await renderPage();

    expect(await screen.findByText("Contracts")).toBeInTheDocument();
    expect(screen.getByText("Audit activity")).toBeInTheDocument();
    expect(screen.getAllByText("Not connected")).toHaveLength(2);
  });

  it("shows the analytics skeleton while the client query is pending", async () => {
    clientState.query.mockReturnValue(new Promise(() => undefined));

    await renderPage();

    expect(
      screen.getByRole("status", { name: "Loading organisation analytics" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Contract Operations" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Active members")).not.toBeInTheDocument();
  });

  it("keeps the masthead visible and retries a failed analytics query", async () => {
    const user = userEvent.setup();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    clientState.query
      .mockRejectedValueOnce(new Error("private analytics failure"))
      .mockResolvedValueOnce(analytics);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await renderPage(queryClient);

    expect(
      await screen.findByRole("heading", { name: "Analytics unavailable" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Contract Operations" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("private analytics failure"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Active members")).toBeInTheDocument();
    expect(clientState.query).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });
});
