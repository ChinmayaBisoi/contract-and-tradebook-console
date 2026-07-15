import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { EditContractDialog } from "@/components/contracts/edit-contract-dialog";

const updateContract = vi.fn().mockResolvedValue({});
const updateStatus = vi.fn().mockResolvedValue({});

vi.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    contract: {
      update: {
        mutationOptions: () => ({ mutationFn: updateContract }),
      },
      updateStatus: {
        mutationOptions: () => ({ mutationFn: updateStatus }),
      },
      list: { queryFilter: () => ({ queryKey: [["contract", "list"]] }) },
      get: { queryFilter: () => ({ queryKey: [["contract", "get"]] }) },
    },
    lineItem: {
      list: { queryFilter: () => ({ queryKey: [["lineItem", "list"]] }) },
    },
    audit: {
      list: { queryFilter: () => ({ queryKey: [["audit", "list"]] }) },
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
  beforeEach(() => {
    updateContract.mockClear();
    updateStatus.mockClear();
  });

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

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    expect(screen.getByLabelText(/payment terms/i)).toHaveValue("Net 30 days");
    expect(screen.getByLabelText(/delivery terms/i)).toHaveValue("FOB Mumbai");
  });

  it("shows forward-only status options for draft contracts", async () => {
    const user = userEvent.setup();

    renderDialog({
      id: "contract_1",
      clientName: "Helios Trading Co.",
      poRefNo: "PO-1001",
      poDate: new Date("2026-07-01T00:00:00.000Z"),
      paymentTerms: null,
      deliveryTerms: null,
      total: "12345.67",
      status: "DRAFT",
    });

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    expect(screen.getByLabelText(/contract status/i)).toHaveValue("DRAFT");
    expect(screen.getByRole("option", { name: "Draft" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Finalized" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Archived" })).toBeNull();
  });

  it("finalizes a draft contract from the edit form", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("confirm", vi.fn(() => true));

    renderDialog({
      id: "contract_1",
      clientName: "Helios Trading Co.",
      poRefNo: "PO-1001",
      poDate: new Date("2026-07-01T00:00:00.000Z"),
      paymentTerms: null,
      deliveryTerms: null,
      total: "12345.67",
      status: "DRAFT",
    });

    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    await user.selectOptions(screen.getByLabelText(/contract status/i), "FINALIZED");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(updateContract).toHaveBeenCalled();
    expect(updateStatus.mock.calls[0]?.[0]).toMatchObject({
      organisationId: "org_1",
      id: "contract_1",
      status: "FINALIZED",
    });

    vi.unstubAllGlobals();
  });

  it("allows finalized contracts to be archived from the edit form", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("confirm", vi.fn(() => true));

    renderDialog({
      id: "contract_1",
      clientName: "Helios Trading Co.",
      poRefNo: "PO-1001",
      poDate: new Date("2026-07-01T00:00:00.000Z"),
      paymentTerms: null,
      deliveryTerms: null,
      total: "12345.67",
      status: "FINALIZED",
    });

    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    expect(screen.getByLabelText(/client name/i)).toHaveAttribute("readonly");
    await user.selectOptions(screen.getByLabelText(/contract status/i), "ARCHIVED");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(updateContract).not.toHaveBeenCalled();
    expect(updateStatus.mock.calls[0]?.[0]).toMatchObject({
      organisationId: "org_1",
      id: "contract_1",
      status: "ARCHIVED",
    });

    vi.unstubAllGlobals();
  });
});
