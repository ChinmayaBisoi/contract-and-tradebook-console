import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EditContractDialog } from "@/components/contracts/edit-contract-dialog";

const updateContract = vi.fn().mockResolvedValue({});

vi.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    contract: {
      update: {
        mutationOptions: () => ({ mutationFn: updateContract }),
      },
      list: { queryFilter: () => ({ queryKey: [["contract", "list"]] }) },
      get: { queryFilter: () => ({ queryKey: [["contract", "get"]] }) },
    },
  }),
}));

function renderDialog(
  contract: {
    id: string;
    clientName: string;
    poRefNo: string;
    poDate: Date;
    paymentTerms: string | null;
    deliveryTerms: string | null;
    total: string;
    status: "DRAFT" | "FINALIZED" | "ARCHIVED";
  },
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <EditContractDialog organisationId="org_1" contract={contract} />
    </QueryClientProvider>,
  );
}

describe("EditContractDialog", () => {
  it("shows imported payment and delivery terms when the dialog opens", async () => {
    const user = userEvent.setup();

    renderDialog({
      id: "contract_1",
      clientName: "Helios Trading Co.",
      poRefNo: "PO-1001",
      poDate: new Date("2026-07-01T00:00:00.000Z"),
      paymentTerms: "Net 30 days",
      deliveryTerms: "FOB Mumbai",
      total: "12345.67",
      status: "DRAFT",
    });

    await user.click(screen.getByRole("button", { name: /edit contract/i }));

    expect(screen.getByLabelText(/payment terms/i)).toHaveValue("Net 30 days");
    expect(screen.getByLabelText(/delivery terms/i)).toHaveValue("FOB Mumbai");
  });
});
