import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContractAuditTrail } from "@/components/contracts/contract-audit-trail";

const listAudit = vi.fn();

vi.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    audit: {
      list: {
        queryOptions: (input: unknown) => ({
          queryKey: ["audit", input],
          queryFn: () => listAudit(input),
        }),
      },
    },
  }),
}));

function renderTrail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ContractAuditTrail organisationId="org_1" contractId="contract_1" />
    </QueryClientProvider>,
  );
}

describe("ContractAuditTrail", () => {
  beforeEach(() => listAudit.mockReset());

  it("shows an empty state for contracts without history", async () => {
    listAudit.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 10, total: 0, pageCount: 0 },
      facets: { actions: [], entityTypes: [], actors: [] },
    });
    renderTrail();

    expect(screen.getByText(/loading contract history/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/no contract changes recorded/i),
    ).toBeInTheDocument();
    expect(listAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        organisationId: "org_1",
        filters: { contractId: "contract_1" },
      }),
    );
  });

  it("renders actor, action, changed fields, and before/after state", async () => {
    listAudit.mockResolvedValue({
      data: [
        {
          id: "audit_1",
          actorName: "Owner User",
          actorEmail: "owner@example.com",
          action: "STATUS_CHANGE",
          entityType: "CONTRACT",
          entityLabel: "PO-100",
          changedFields: ["status"],
          beforeState: { status: "DRAFT" },
          afterState: { status: "FINALIZED" },
          occurredAt: new Date("2026-07-15T12:00:00.000Z"),
        },
      ],
      pagination: { page: 1, pageSize: 10, total: 1, pageCount: 1 },
      facets: { actions: [], entityTypes: [], actors: [] },
    });
    renderTrail();

    expect(await screen.findByText("Status change")).toBeInTheDocument();
    expect(screen.getByText(/Owner User/)).toBeInTheDocument();
    expect(screen.getByText(/Changed: status/)).toBeInTheDocument();
    expect(screen.getByText(/DRAFT/)).toBeInTheDocument();
    expect(screen.getByText(/FINALIZED/)).toBeInTheDocument();
  });
});
