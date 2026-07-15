import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import { type ReactNode, Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OrganisationTeamsPage from "@/app/(protected)/org/[orgId]/teams/page";
import {
  OrganisationTeam,
  OrganisationTeamErrorBoundary,
} from "@/components/organisation/team/organisation-team";
import { OrganisationTeamSkeleton } from "@/components/organisation/team/organisation-team-skeleton";
import { makeQueryClient } from "@/trpc/query-client";

type MemberResult = {
  data: Array<{
    id: string;
    clerkUserId: string;
    clerkUserName: string;
    clerkUserEmail: string;
    role: "OWNER" | "ADMIN" | "MEMBER";
    status: "ACTIVE" | "DISABLED" | "REMOVED";
    createdAt: Date;
    updatedAt: Date;
    canChangeRole: boolean;
    canChangeStatus: boolean;
    canRemove: boolean;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
};

const members: MemberResult = {
  data: [
    {
      id: "membership_1",
      clerkUserId: "user_1",
      clerkUserName: "Taylor Member",
      clerkUserEmail: "taylor@example.com",
      role: "ADMIN",
      status: "ACTIVE",
      createdAt: new Date("2026-07-01T23:30:00.000Z"),
      updatedAt: new Date("2026-07-01T23:30:00.000Z"),
      canChangeRole: true,
      canChangeStatus: true,
      canRemove: true,
    },
  ],
  pagination: { page: 2, pageSize: 20, total: 21, pageCount: 2 },
};

const state = vi.hoisted(() => ({ memberQuery: vi.fn() }));
const serverMocks = vi.hoisted(() => ({
  prefetchQuery: vi.fn(),
  queryOptions: vi.fn((input: unknown) => ({ input })),
}));
const hydrationState = vi.hoisted(() => ({
  queryClient: undefined as unknown as QueryClient,
}));

vi.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    organisation: {
      listMembers: {
        queryOptions: (input: unknown) => ({
          queryKey: [["organisation", "listMembers"], { input }],
          queryFn: () => state.memberQuery(input),
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
        listMembers: { queryOptions: serverMocks.queryOptions },
      },
    },
  };
});

const Page = OrganisationTeamsPage as unknown as (props: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => Promise<ReactNode>;

function renderTeam({
  searchParams = "",
  onUrlUpdate,
  queryClient = makeQueryClient(),
}: {
  searchParams?: string;
  onUrlUpdate?: (event: UrlUpdateEvent) => void;
  queryClient?: QueryClient;
} = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <NuqsTestingAdapter searchParams={searchParams} onUrlUpdate={onUrlUpdate}>
        <OrganisationTeamErrorBoundary>
          <Suspense fallback={<OrganisationTeamSkeleton />}>
            <OrganisationTeam organisationId="org_1" />
          </Suspense>
        </OrganisationTeamErrorBoundary>
      </NuqsTestingAdapter>
    </QueryClientProvider>,
  );
}

describe("OrganisationTeam", () => {
  beforeEach(() => {
    hydrationState.queryClient = makeQueryClient();
    state.memberQuery.mockReset();
    state.memberQuery.mockResolvedValue(members);
    serverMocks.prefetchQuery.mockReset();
    serverMocks.queryOptions.mockClear();
  });

  it("queries listMembers with the exact organisation and URL state", async () => {
    renderTeam({
      searchParams:
        '?filters=[{"id":"search","value":"taylor"},{"id":"role","value":"ADMIN"},{"id":"status","value":"ACTIVE"}]&page=2&pageSize=20&sort=clerkUserName&sortDirection=asc',
    });

    expect(await screen.findByText("Taylor Member")).toBeInTheDocument();
    expect(state.memberQuery).toHaveBeenCalledWith({
      organisationId: "org_1",
      filters: { search: "taylor", role: "ADMIN", status: "ACTIVE" },
      page: 2,
      pageSize: 20,
      sort: "clerkUserName",
      sortDirection: "asc",
    });
  });

  it("renders member details in a read-only table with a deterministic UTC date", async () => {
    renderTeam();

    const table = await screen.findByRole("table", {
      name: "Organisation members",
    });
    expect(within(table).getByText("Taylor Member")).toBeInTheDocument();
    expect(within(table).getByText("taylor@example.com")).toBeInTheDocument();
    expect(within(table).getByText("Admin")).toBeInTheDocument();
    expect(within(table).getByText("Active")).toBeInTheDocument();
    expect(within(table).getByText("1 Jul 2026")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /edit|remove|disable/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: /actions/i }),
    ).not.toBeInTheDocument();
  });

  it("updates filters and resets pagination through URL state", async () => {
    const user = userEvent.setup();
    const updates: UrlUpdateEvent[] = [];
    renderTeam({
      searchParams: "?page=2&pageSize=20",
      onUrlUpdate: (event) => updates.push(event),
    });
    await screen.findByText("Taylor Member");

    await user.type(
      screen.getByRole("searchbox", { name: "Search members" }),
      "ops",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by role" }),
      "ADMIN",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by status" }),
      "ACTIVE",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Rows per page" }),
      "50",
    );

    await waitFor(() => expect(updates.length).toBeGreaterThanOrEqual(4));
    for (const update of updates) {
      expect(update.searchParams.get("page")).toBeNull();
    }
    expect(updates.at(-1)?.searchParams.get("pageSize")).toBe("50");
  });

  it("supports sorting, direct pagination, and clearing filters", async () => {
    const user = userEvent.setup();
    const updates: UrlUpdateEvent[] = [];
    renderTeam({
      searchParams:
        '?filters=[{"id":"role","value":"ADMIN"}]&page=1&pageSize=20',
      onUrlUpdate: (event) => updates.push(event),
    });
    await screen.findByText("Taylor Member");

    await user.click(screen.getByRole("button", { name: "Sort by name" }));
    expect(updates.at(-1)?.searchParams.get("sort")).toBe("clerkUserName");
    expect(updates.at(-1)?.searchParams.get("sortDirection")).toBe("asc");

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(updates.at(-1)?.searchParams.get("page")).toBe("2");

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(updates.at(-1)?.searchParams.get("filters")).toBeNull();
    expect(updates.at(-1)?.searchParams.get("page")).toBeNull();
  });

  it("renders an intentional zero-results state", async () => {
    state.memberQuery.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 10, total: 0, pageCount: 0 },
    });
    renderTeam({
      searchParams: '?filters=[{"id":"search","value":"missing"}]',
    });

    expect(
      await screen.findByText("No members match your filters"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear filters" }),
    ).toBeInTheDocument();
  });

  it("shows the page-level team skeleton while the query is pending", async () => {
    state.memberQuery.mockReturnValue(new Promise(() => undefined));
    const page = await Page({
      params: Promise.resolve({ orgId: "org_1" }),
      searchParams: Promise.resolve({}),
    });

    render(
      <QueryClientProvider client={makeQueryClient()}>
        <NuqsTestingAdapter>{page}</NuqsTestingAdapter>
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole("status", { name: "Loading organisation team" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Taylor Member")).not.toBeInTheDocument();
  });

  it("retries a section-local member query error", async () => {
    const user = userEvent.setup();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    state.memberQuery
      .mockRejectedValueOnce(new Error("private member failure"))
      .mockResolvedValueOnce(members);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderTeam({ queryClient });

    expect(
      await screen.findByRole("heading", { name: "Team unavailable" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("private member failure"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Taylor Member")).toBeInTheDocument();
    expect(state.memberQuery).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });
});
