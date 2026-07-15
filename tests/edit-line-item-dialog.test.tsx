import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EditLineItemDialog } from "@/components/contracts/edit-line-item-dialog";

const updateLineItem = vi.fn().mockResolvedValue({});

vi.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    contract: {
      get: { queryFilter: () => ({ queryKey: [["contract", "get"]] }) },
      list: { queryFilter: () => ({ queryKey: [["contract", "list"]] }) },
    },
    lineItem: {
      update: {
        mutationOptions: () => ({ mutationFn: updateLineItem }),
      },
      list: { queryFilter: () => ({ queryKey: [["lineItem", "list"]] }) },
    },
  }),
}));

function renderDialog(
  lineItem: {
    id: string;
    description: string;
    quantity: string;
    quantityUnit: string | null;
    unitPrice: string;
    pricingUnit: string | null;
  },
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <EditLineItemDialog
        organisationId="org_1"
        contractId="contract_1"
        lineItem={lineItem}
        disabled={false}
      />
    </QueryClientProvider>,
  );
}

describe("EditLineItemDialog", () => {
  it("shows imported quantity and pricing units when the dialog opens", async () => {
    const user = userEvent.setup();

    renderDialog({
      id: "line_1",
      description: "Copper cathodes",
      quantity: "100",
      quantityUnit: "MT",
      unitPrice: "9500",
      pricingUnit: "per MT",
    });

    await user.click(screen.getByRole("button", { name: /edit/i }));

    expect(screen.getByLabelText(/quantity unit/i)).toHaveValue("MT");
    expect(screen.getByLabelText(/pricing unit/i)).toHaveValue("per MT");
  });
});
