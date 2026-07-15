import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OrganisationDashboardView } from "@/components/dashboard/organisation-dashboard-view";

const organisation = {
  id: "org_1",
  name: "Contract Operations",
  description: "Primary review team",
  role: "OWNER" as const,
  status: "ACTIVE" as const,
  activeMemberCount: 4,
  createdAt: new Date("2026-07-10T00:00:00.000Z"),
  updatedAt: new Date("2026-07-10T00:00:00.000Z"),
};

const invitation = {
  id: "invite_1",
  email: "owner@example.com",
  organisationId: "org_1",
  organisationName: "Contract Operations",
  role: "ADMIN" as const,
  inviterName: "Second Owner",
  inviterEmail: "owner2@example.com",
  status: "PENDING" as const,
  expiresAt: new Date("2099-07-21T12:00:00.000Z"),
  createdAt: new Date("2026-07-14T12:00:00.000Z"),
  updatedAt: new Date("2026-07-14T12:00:00.000Z"),
  direction: "both" as const,
  canAccept: true,
  canDecline: true,
  canEdit: true,
  canCancel: true,
};

const pagination = { page: 1, pageSize: 10, total: 1, pageCount: 1 };

function baseProps() {
  return {
    tab: "organisations" as const,
    activeTab: "organisations" as const,
    filters: [],
    page: 1,
    pageSize: 10,
    sort: "createdAt",
    sortDirection: "desc" as const,
    organisations: [organisation],
    invitations: [invitation],
    pagination,
    isLoading: false,
    isFetching: false,
    error: null,
    mutationError: null,
    isMutating: false,
    onQueryChange: vi.fn(),
    onCreateOrganisation: vi.fn().mockResolvedValue(undefined),
    onCreateInvitation: vi.fn().mockResolvedValue(undefined),
    onUpdateInvitation: vi.fn().mockResolvedValue(undefined),
    onAcceptInvitation: vi.fn(),
    onDeclineInvitation: vi.fn(),
    onCancelInvitation: vi.fn(),
    onRetry: vi.fn(),
  };
}

describe("OrganisationDashboardView", () => {
  it("renders the organisation table and permission-aware controls", () => {
    render(<OrganisationDashboardView {...baseProps()} />);

    expect(
      screen.getByRole("tab", { name: "Organisations" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Invitations" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create organisation" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Contract Operations")).toBeInTheDocument();
    expect(screen.getByText("Primary review team")).toBeInTheDocument();
    expect(screen.getByText("4 members")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Invite member" }),
    ).toBeInTheDocument();
  });

  it("renders combined invitation actions in the invitations tab", () => {
    render(
      <OrganisationDashboardView {...baseProps()} activeTab="invitations" />,
    );

    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("Received + managed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("keeps terminal invitations read-only", () => {
    render(
      <OrganisationDashboardView
        {...baseProps()}
        activeTab="invitations"
        invitations={[
          {
            ...invitation,
            status: "ACCEPTED",
            canAccept: false,
            canDecline: false,
            canEdit: false,
            canCancel: false,
          },
        ]}
      />,
    );

    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Accept" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });

  it("submits the create organisation dialog", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<OrganisationDashboardView {...props} />);

    await user.click(
      screen.getByRole("button", { name: "Create organisation" }),
    );
    await user.type(
      screen.getByLabelText("Organisation name"),
      "Legal Operations",
    );
    await user.type(
      screen.getByLabelText("Description"),
      "Commercial contracts",
    );
    fireEvent.submit(screen.getByRole("form", { name: "Create organisation" }));

    expect(props.onCreateOrganisation).toHaveBeenCalledWith({
      name: "Legal Operations",
      description: "Commercial contracts",
    });
  });

  it("renders loading, error, and empty states", () => {
    const { rerender } = render(
      <OrganisationDashboardView
        {...baseProps()}
        isLoading
        isFetching
        organisations={[]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Sort by organisation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sort by created" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Contract Operations")).not.toBeInTheDocument();

    rerender(
      <OrganisationDashboardView
        {...baseProps()}
        error="Organisations could not be loaded."
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Organisations could not be loaded.",
    );

    rerender(
      <OrganisationDashboardView
        {...baseProps()}
        organisations={[]}
        pagination={{ ...pagination, total: 0, pageCount: 0 }}
      />,
    );
    expect(screen.getByText("No organisations yet")).toBeInTheDocument();
  });

  it("shows sort direction icons on active columns", () => {
    render(
      <OrganisationDashboardView
        {...baseProps()}
        sort="name"
        sortDirection="asc"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Sort by organisation" }),
    ).toHaveAttribute("aria-sort", "ascending");
    expect(
      screen.getByRole("button", { name: "Sort by created" }),
    ).toHaveAttribute("aria-sort", "none");
  });
});
