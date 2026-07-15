import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import { type ReactNode } from "react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OrganisationTeamsPage from "@/app/(protected)/org/[orgId]/teams/page";
import { CreateInvitationDialog } from "@/components/invitations/create-invitation-dialog";
import {
  OrganisationTeam,
  OrganisationTeamErrorBoundary,
} from "@/components/organisation/team/organisation-team";
import { makeQueryClient } from "@/trpc/query-client";

type OrganisationRole = "OWNER" | "ADMIN" | "MEMBER";

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

const state = vi.hoisted(() => ({
  memberQuery: vi.fn(),
  organisationQuery: vi.fn(),
  createInvitation: vi.fn(),
  updateMemberRole: vi.fn(),
  updateMemberStatus: vi.fn(),
  removeMember: vi.fn(),
}));
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
      get: {
        queryOptions: (input: unknown) => ({
          queryKey: [["organisation", "get"], { input }],
          queryFn: () => state.organisationQuery(input),
        }),
        queryFilter: (input?: unknown) => ({
          queryKey: input
            ? [["organisation", "get"], { input }]
            : [["organisation", "get"]],
        }),
      },
      getAnalytics: {
        queryFilter: (input?: unknown) => ({
          queryKey: input
            ? [["organisation", "getAnalytics"], { input }]
            : [["organisation", "getAnalytics"]],
        }),
      },
      listMembers: {
        queryOptions: (input: unknown) => ({
          queryKey: [["organisation", "listMembers"], { input }],
          queryFn: () => state.memberQuery(input),
        }),
        queryFilter: (input?: unknown) => ({
          queryKey: input
            ? [["organisation", "listMembers"], { input }]
            : [["organisation", "listMembers"]],
        }),
      },
      updateMemberRole: {
        mutationOptions: () => ({ mutationFn: state.updateMemberRole }),
      },
      updateMemberStatus: {
        mutationOptions: () => ({ mutationFn: state.updateMemberStatus }),
      },
      removeMember: {
        mutationOptions: () => ({ mutationFn: state.removeMember }),
      },
    },
    invitation: {
      create: {
        mutationOptions: () => ({ mutationFn: state.createInvitation }),
      },
      list: {
        queryFilter: () => ({ queryKey: [["invitation", "list"]] }),
      },
    },
    audit: {
      list: {
        queryFilter: (input: unknown) => ({
          queryKey: [["audit", "list"], { input }],
        }),
      },
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn() },
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
        get: { queryOptions: serverMocks.queryOptions },
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
  requesterRole = "MEMBER",
}: {
  searchParams?: string;
  onUrlUpdate?: (event: UrlUpdateEvent) => void;
  queryClient?: QueryClient;
  requesterRole?: OrganisationRole;
} = {}) {
  state.organisationQuery.mockResolvedValue({
    id: "org_1",
    name: "Acme Trading",
    role: requesterRole,
    status: "ACTIVE",
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <NuqsTestingAdapter searchParams={searchParams} onUrlUpdate={onUrlUpdate}>
        <OrganisationTeamErrorBoundary>
          <OrganisationTeam organisationId="org_1" />
        </OrganisationTeamErrorBoundary>
      </NuqsTestingAdapter>
    </QueryClientProvider>,
  );
}

describe("OrganisationTeam", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    hydrationState.queryClient = makeQueryClient();
    state.memberQuery.mockReset();
    state.organisationQuery.mockReset();
    state.createInvitation.mockReset();
    state.updateMemberRole.mockReset();
    state.updateMemberStatus.mockReset();
    state.removeMember.mockReset();
    state.memberQuery.mockResolvedValue(members);
    state.organisationQuery.mockResolvedValue({
      id: "org_1",
      name: "Acme Trading",
      role: "MEMBER",
      status: "ACTIVE",
    });
    state.createInvitation.mockResolvedValue({ id: "invitation_1" });
    state.updateMemberRole.mockResolvedValue({ id: "membership_1" });
    state.updateMemberStatus.mockResolvedValue({ id: "membership_1" });
    state.removeMember.mockResolvedValue({ id: "membership_1" });
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

    await screen.findByText("Taylor Member");
    const table = screen.getByRole("table", {
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
    await waitFor(
      () => {
        expect(
          updates.some((update) =>
            update.searchParams.get("filters")?.includes("ops"),
          ),
        ).toBe(true);
      },
      { timeout: 1000 },
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

  it("keeps filters and headers visible while the query is pending", async () => {
    state.memberQuery.mockReturnValue(new Promise(() => undefined));
    state.organisationQuery.mockReturnValue(
      Promise.resolve({
        id: "org_1",
        name: "Contract Operations",
        role: "OWNER",
      }),
    );
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
      screen.getByRole("heading", { name: "Team", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Search members" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sort by name" }),
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

  it("gives owners invitation and complete server-approved member controls", async () => {
    renderTeam({ requesterRole: "OWNER" });

    expect(
      await screen.findByRole("button", { name: "Invite member" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change Taylor Member role" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Disable Taylor Member" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Taylor Member" }),
    ).toBeInTheDocument();
  });

  it("limits administrators to member invitations and status changes", async () => {
    const adminMembers = {
      ...members,
      data: [
        {
          ...members.data[0],
          role: "MEMBER" as const,
          canChangeRole: false,
          canChangeStatus: true,
          canRemove: false,
        },
      ],
    };
    state.memberQuery.mockResolvedValue(adminMembers);
    const user = userEvent.setup();
    renderTeam({ requesterRole: "ADMIN" });

    await user.click(
      await screen.findByRole("button", { name: "Invite member" }),
    );
    expect(
      screen.queryByRole("option", { name: "Admin" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen.getByRole("button", { name: "Disable Taylor Member" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /change taylor member role/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove Taylor Member" }),
    ).not.toBeInTheDocument();
  });

  it("keeps ordinary members read-only even when rows contain action flags", async () => {
    renderTeam({ requesterRole: "MEMBER" });

    expect(await screen.findByText("Taylor Member")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Invite member" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Actions" }),
    ).not.toBeInTheDocument();
  });

  it("creates database invitations and invalidates invitation views", async () => {
    const user = userEvent.setup();
    const queryClient = makeQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    renderTeam({ requesterRole: "OWNER", queryClient });

    await user.click(
      await screen.findByRole("button", { name: "Invite member" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Email" }),
      "new@example.com",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Role" }),
      "ADMIN",
    );
    await user.click(screen.getByRole("button", { name: "Create invitation" }));

    await waitFor(() => expect(state.createInvitation).toHaveBeenCalled());
    expect(state.createInvitation.mock.calls[0]?.[0]).toMatchObject({
      organisationId: "org_1",
      email: "new@example.com",
      role: "ADMIN",
      expiresAt: expect.any(Date),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: [["invitation", "list"]],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: [["audit", "list"], { input: { organisationId: "org_1" } }],
    });
  });

  it("keeps the invitation dialog open when its database write fails", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(false);
    render(
      <CreateInvitationDialog
        organisationId="org_1"
        organisationName="Acme Trading"
        requesterRole="OWNER"
        isPending={false}
        error="The invitation could not be saved."
        onCreate={onCreate}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Invite member" }));
    await user.type(
      screen.getByRole("textbox", { name: "Email" }),
      "failed@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Create invitation" }));

    expect(onCreate).toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Invite to Acme Trading" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The invitation could not be saved."),
    ).toBeInTheDocument();
  });

  it("handles rejected invitation writes with safe in-dialog feedback", async () => {
    state.createInvitation.mockRejectedValue(
      new Error("private invitation failure"),
    );
    const user = userEvent.setup();
    renderTeam({ requesterRole: "OWNER" });

    await user.click(
      await screen.findByRole("button", { name: "Invite member" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Email" }),
      "failed@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Create invitation" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Invite to Acme Trading",
    });
    expect(
      within(dialog).getByText(
        "The team change could not be saved. Try again.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("private invitation failure"),
    ).not.toBeInTheDocument();
  });

  it("changes a role and invalidates the organisation member views", async () => {
    const user = userEvent.setup();
    const queryClient = makeQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    renderTeam({ requesterRole: "OWNER", queryClient });

    await user.click(
      await screen.findByRole("button", {
        name: "Change Taylor Member role",
      }),
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Role" }),
      "MEMBER",
    );
    await user.click(screen.getByRole("button", { name: "Save role" }));

    await waitFor(() => expect(state.updateMemberRole).toHaveBeenCalled());
    expect(state.updateMemberRole.mock.calls[0]?.[0]).toEqual({
      organisationId: "org_1",
      clerkUserId: "user_1",
      role: "MEMBER",
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: [
        ["organisation", "listMembers"],
        { input: { organisationId: "org_1" } },
      ],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: [
        ["organisation", "getAnalytics"],
        { input: { organisationId: "org_1" } },
      ],
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: [["organisation", "get"], { input: { id: "org_1" } }],
    });
  });

  it("confirms destructive changes and never exposes raw mutation errors", async () => {
    state.updateMemberStatus.mockRejectedValue(
      new Error("private database failure"),
    );
    const user = userEvent.setup();
    renderTeam({ requesterRole: "OWNER" });

    await user.click(
      await screen.findByRole("button", { name: "Disable Taylor Member" }),
    );
    expect(state.updateMemberStatus).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Disable member" }));

    expect(state.updateMemberStatus.mock.calls[0]?.[0]).toEqual({
      organisationId: "org_1",
      clerkUserId: "user_1",
      status: "DISABLED",
    });
    expect(
      await screen.findByText("The team change could not be saved. Try again."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("private database failure"),
    ).not.toBeInTheDocument();
  });

  it("confirms removal and sends the scoped mutation before showing success", async () => {
    const user = userEvent.setup();
    renderTeam({ requesterRole: "OWNER" });

    await user.click(
      await screen.findByRole("button", { name: "Remove Taylor Member" }),
    );
    expect(state.removeMember).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove member" }));

    await waitFor(() => expect(state.removeMember).toHaveBeenCalled());
    expect(state.removeMember.mock.calls[0]?.[0]).toEqual({
      organisationId: "org_1",
      clerkUserId: "user_1",
    });
    expect(toast.success).toHaveBeenCalledWith("Member removed");
  });

  it("does not let administrators manage non-member rows with inconsistent flags", async () => {
    state.memberQuery.mockResolvedValue({
      ...members,
      data: [
        {
          ...members.data[0],
          status: "DISABLED" as const,
          canChangeStatus: true,
        },
      ],
    });
    renderTeam({ requesterRole: "ADMIN" });

    expect(await screen.findByText("Taylor Member")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Enable Taylor Member" }),
    ).not.toBeInTheDocument();
  });

  it("enables disabled ordinary members directly when the server allows it", async () => {
    state.memberQuery.mockResolvedValue({
      ...members,
      data: [
        {
          ...members.data[0],
          role: "MEMBER" as const,
          status: "DISABLED" as const,
          canChangeStatus: true,
        },
      ],
    });
    const user = userEvent.setup();
    renderTeam({ requesterRole: "ADMIN" });

    await user.click(
      await screen.findByRole("button", { name: "Enable Taylor Member" }),
    );

    await waitFor(() => expect(state.updateMemberStatus).toHaveBeenCalled());
    expect(state.updateMemberStatus.mock.calls[0]?.[0]).toEqual({
      organisationId: "org_1",
      clerkUserId: "user_1",
      status: "ACTIVE",
    });
    expect(toast.success).toHaveBeenCalledWith("Member enabled");
  });

  it("disables role submission while a member mutation is pending", async () => {
    state.updateMemberRole.mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    renderTeam({ requesterRole: "OWNER" });

    await user.click(
      await screen.findByRole("button", {
        name: "Change Taylor Member role",
      }),
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Role" }),
      "MEMBER",
    );
    await user.click(screen.getByRole("button", { name: "Save role" }));

    expect(
      await screen.findByRole("button", { name: "Saving role" }),
    ).toBeDisabled();
  });
});
