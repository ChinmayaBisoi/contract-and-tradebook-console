import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrganisationAnalytics } from "@/components/organisation/organisation-analytics";

const clientState = vi.hoisted(() => ({
  organisationQuery: vi.fn(),
  analyticsQuery: vi.fn(),
}));

vi.mock("@/components/realtime/use-organisation-events", () => ({
  useOrganisationEvents: () => undefined,
}));

vi.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    organisation: {
      get: {
        queryOptions: ({ id }: { id: string }) => ({
          queryKey: [["organisation", "get"], { input: { id } }],
          queryFn: () => clientState.organisationQuery({ id }),
        }),
      },
      getAnalytics: {
        queryOptions: ({
          organisationId,
          filters,
        }: {
          organisationId: string;
          filters?: {
            contractId?: string;
            status?: "DRAFT" | "FINALIZED" | "ARCHIVED";
            poDateFrom?: Date;
            poDateTo?: Date;
          };
        }) => ({
          queryKey: [["organisation", "getAnalytics"], { input: { organisationId, filters } }],
          queryFn: () => clientState.analyticsQuery({ organisationId, filters }),
        }),
        queryFilter: () => ({}),
      },
    },
  }),
}));

const analytics = {
  activeMemberCount: 6,
  disabledMemberCount: 2,
  pendingInvitationCount: 3,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  ageInDays: 14,
  totalContracts: 42,
  totalLineItems: 3450,
  grandContractValue: 4616187445.88,
  averageLineValue: 1338025.35,
  largestLineValue: 42533341.17,
  draftContracts: 14,
  finalizedContracts: 14,
  archivedContracts: 14,
  poDateRange: {
    min: new Date("2026-01-10T00:00:00.000Z"),
    max: new Date("2026-07-10T00:00:00.000Z"),
  },
  contractOptions: [
    { id: "contract_1", label: "PO-001 - Acme" },
    { id: "contract_2", label: "PO-002 - Bravo" },
  ],
  contractsOverTime: [
    { date: "2026-07-01", contractCount: 2 },
    { date: "2026-07-02", contractCount: 1 },
  ],
};

function renderAnalytics() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Suspense fallback={<p>Loading</p>}>
        <OrganisationAnalytics organisationId="org_1" />
      </Suspense>
    </QueryClientProvider>,
  );
}

describe("Organisation overview analytics", () => {
  beforeEach(() => {
    clientState.organisationQuery.mockReset();
    clientState.organisationQuery.mockResolvedValue({
      id: "org_1",
      role: "OWNER",
      name: "Contract Operations",
      description: "Primary review team",
      status: "ACTIVE",
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    });
    clientState.analyticsQuery.mockReset();
    clientState.analyticsQuery.mockResolvedValue(analytics);
  });

  it("renders the po-date chart with the full summary-sheet range by default", async () => {
    renderAnalytics();

    expect(await screen.findByText("Contracts over time")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Count of contracts by PO date from Jan 10, 2026 to Jul 10, 2026.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-01-10")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-07-10")).toBeInTheDocument();
  });

  it("refetches the timeline when the status filter changes", async () => {
    const user = userEvent.setup();
    renderAnalytics();

    await screen.findByText("Contracts over time");
    await user.click(screen.getByRole("combobox", { name: "Status" }));
    await user.click(screen.getByRole("option", { name: "Finalized" }));

    await waitFor(() => {
      const lastCall = clientState.analyticsQuery.mock.lastCall?.[0];
      expect(lastCall?.filters?.status).toBe("FINALIZED");
    });
  });

  it("refetches the timeline when the date preset changes", async () => {
    const user = userEvent.setup();
    renderAnalytics();

    await screen.findByText("Contracts over time");
    await user.click(screen.getByRole("button", { name: "Last 30 days" }));

    await waitFor(() => {
      const lastCall = clientState.analyticsQuery.mock.lastCall?.[0];
      expect(lastCall?.filters?.poDateFrom).toEqual(
        new Date("2026-06-10T00:00:00.000Z"),
      );
      expect(lastCall?.filters?.poDateTo).toEqual(
        new Date("2026-07-10T00:00:00.000Z"),
      );
    });
  });

  it("hides the overview for non-owner, non-admin members", async () => {
    clientState.organisationQuery.mockResolvedValue({
      id: "org_1",
      role: "MEMBER",
      name: "Contract Operations",
      description: "Primary review team",
      status: "ACTIVE",
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    });

    renderAnalytics();

    await waitFor(() => {
      expect(screen.queryByText("Overview")).not.toBeInTheDocument();
    });
  });
});
