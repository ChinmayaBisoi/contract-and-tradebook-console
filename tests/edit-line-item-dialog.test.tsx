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

  it("reloads unit values when editing a different line item", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <EditLineItemDialog
          organisationId="org_1"
          contractId="contract_1"
          lineItem={{
            id: "line_1",
            description: "Copper cathodes",
            quantity: "100",
            quantityUnit: "MT",
            unitPrice: "9500",
            pricingUnit: "per MT",
          }}
          disabled={false}
        />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByLabelText(/quantity unit/i)).toHaveValue("MT");

    await user.click(screen.getByRole("button", { name: /close/i }));
    rerender(
      <QueryClientProvider client={queryClient}>
        <EditLineItemDialog
          organisationId="org_1"
          contractId="contract_1"
          lineItem={{
            id: "line_2",
            description: "Aluminium ingots",
            quantity: "250",
            quantityUnit: "kg",
            unitPrice: "3.5",
            pricingUnit: "per kg",
          }}
          disabled={false}
        />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByLabelText(/quantity unit/i)).toHaveValue("kg");
    expect(screen.getByLabelText(/pricing unit/i)).toHaveValue("per kg");
  });
});
