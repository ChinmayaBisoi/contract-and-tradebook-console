import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OrganisationAnalyticsPage from "@/app/(protected)/org/[orgId]/page";
import { OrganisationAnalytics } from "@/components/organisation/organisation-analytics";
import { OrganisationAnalyticsSkeleton } from "@/components/organisation/organisation-analytics-skeleton";
import { OrganisationSectionErrorBoundary } from "@/components/organisation/organisation-section-error";
import { OrganisationWorkspace } from "@/components/organisation/organisation-workspace";
import { makeQueryClient } from "@/trpc/query-client";

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
  analyticsQuery: vi.fn(),
  organisationQuery: vi.fn(),
}));

const serverMocks = vi.hoisted(() => ({
  prefetchQuery: vi.fn(),
  queryOptions: vi.fn((input: { organisationId: string }) => ({ input })),
}));

const hydrationState = vi.hoisted(() => ({
  queryClient: undefined as unknown as QueryClient,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/org_1",
}));

vi.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    organisation: {
      get: {
        queryOptions: ({ id }: { id: string }) => ({
          queryKey: [["organisation", "get"], { input: { id } }],
          queryFn: clientState.organisationQuery,
        }),
      },
      getAnalytics: {
        queryOptions: ({ organisationId }: { organisationId: string }) => ({
          queryKey: [
            ["organisation", "getAnalytics"],
            { input: { organisationId } },
          ],
          queryFn: clientState.analyticsQuery,
        }),
      },
    },
  }),
}));

vi.mock("@/trpc/server", async () => {
  const { dehydrate, HydrationBoundary } = await import(
    "@tanstack/react-query"
  );

  return {
    getQueryClient: () => ({ prefetchQuery: serverMocks.prefetchQuery }),
    HydrateClient: ({ children }: { children: ReactNode }) => (
      <HydrationBoundary state={dehydrate(hydrationState.queryClient)}>
        {children}
      </HydrationBoundary>
    ),
    trpc: {
      organisation: {
        getAnalytics: { queryOptions: serverMocks.queryOptions },
      },
    },
  };
});

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
    hydrationState.queryClient = makeQueryClient();
    clientState.analyticsQuery.mockReset();
    clientState.analyticsQuery.mockResolvedValue(analytics);
    clientState.organisationQuery.mockReset();
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
    clientState.analyticsQuery.mockResolvedValue({ ...analytics, ageInDays });

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
    clientState.analyticsQuery.mockReturnValue(new Promise(() => undefined));

    await renderPage();

    expect(
      screen.getByRole("status", { name: "Loading organisation analytics" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Contract Operations" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Active members")).not.toBeInTheDocument();
  });

  it("hydrates a pending analytics query through the fallback before rendering metrics", async () => {
    let resolveAnalytics: (value: Analytics) => void = () => undefined;
    const pendingAnalytics = new Promise<Analytics>((resolve) => {
      resolveAnalytics = resolve;
    });

    void hydrationState.queryClient.prefetchQuery({
      queryKey: [
        ["organisation", "getAnalytics"],
        { input: { organisationId: "org_1" } },
      ],
      queryFn: () => pendingAnalytics,
    });

    await renderPage();

    expect(
      screen.getByRole("status", { name: "Loading organisation analytics" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Active members")).not.toBeInTheDocument();

    resolveAnalytics(analytics);

    expect(await screen.findByText("Active members")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(clientState.analyticsQuery).not.toHaveBeenCalled();
  });

  it("keeps the real workspace masthead and navigation when analytics fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    clientState.organisationQuery.mockResolvedValue({
      id: "org_1",
      name: "Contract Operations",
      description: "Primary review team",
      role: "OWNER",
      status: "ACTIVE",
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    });
    clientState.analyticsQuery.mockRejectedValue(
      new Error("private analytics failure"),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<p>Loading organisation</p>}>
          <OrganisationWorkspace orgId="org_1">
            <OrganisationSectionErrorBoundary>
              <Suspense fallback={<OrganisationAnalyticsSkeleton />}>
                <OrganisationAnalytics organisationId="org_1" />
              </Suspense>
            </OrganisationSectionErrorBoundary>
          </OrganisationWorkspace>
        </Suspense>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Analytics unavailable" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Contract Operations" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("private analytics failure"),
    ).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it("keeps the masthead visible and retries a failed analytics query", async () => {
    const user = userEvent.setup();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    clientState.analyticsQuery
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
    expect(clientState.analyticsQuery).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });
});
