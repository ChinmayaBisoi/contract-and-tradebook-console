import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImportContractDialog } from "@/components/contracts/import-contract-dialog";

const extract = vi.fn();
const importDraft = vi.fn().mockResolvedValue({ id: "contract_1" });
const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    contract: {
      extract: { mutationOptions: () => ({ mutationFn: extract }) },
      importDraft: { mutationOptions: () => ({ mutationFn: importDraft }) },
      list: { queryFilter: () => ({ queryKey: [["contract", "list"]] }) },
    },
    audit: {
      list: { queryFilter: () => ({ queryKey: [["audit", "list"]] }) },
    },
  }),
}));

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ImportContractDialog organisationId="org_1" />
    </QueryClientProvider>,
  );
}

const proposal = {
  contract: {
    clientName: "Acme Trading",
    poRefNo: "PO-100",
    poDate: new Date("2026-07-15T00:00:00.000Z"),
    paymentTerms: "Net 30",
    deliveryTerms: "FOB Mumbai",
  },
  items: [
    {
      description: "Copper cathodes",
      quantity: 10,
      quantityUnit: "MT",
      unitPrice: 125,
      pricingUnit: "MT",
    },
  ],
};

describe("ImportContractDialog", () => {
  beforeEach(() => {
    extract.mockReset();
    importDraft.mockClear();
    push.mockClear();
  });

  it("reviews and accepts an editable AI extraction", async () => {
    extract.mockResolvedValue(proposal);
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: /import contract/i }));
    await user.type(
      screen.getByLabelText(/contract text/i),
      "Purchase order PO-100 for Acme Trading with copper cathodes.",
    );
    await user.click(screen.getByRole("button", { name: /extract contract/i }));

    const client = await screen.findByLabelText(/client name/i);
    await user.clear(client);
    await user.type(client, "Acme Trading Updated");
    await user.click(
      screen.getByRole("button", { name: /accept and create/i }),
    );

    expect(importDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        organisationId: "org_1",
        sourceType: "AI_EXTRACT",
        proposal: expect.objectContaining({
          contract: expect.objectContaining({
            clientName: "Acme Trading Updated",
          }),
        }),
      }),
      expect.anything(),
    );
    expect(push).toHaveBeenCalledWith("/org/org_1/contracts/contract_1");
  });

  it("loads assignment-shaped JSON for review and rejects without writing", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: /import contract/i }));
    await user.click(screen.getByRole("tab", { name: /upload json/i }));
    const file = new File(
      [
        JSON.stringify({
          client_name: "Acme Trading",
          po_ref_no: "PO-100",
          po_date: "2026-07-15",
          payment_terms: "Net 30",
          delivery_terms: "FOB Mumbai",
          items: [
            {
              description: "Copper cathodes",
              quantity: 10,
              quantity_unit: "MT",
              unit_price: 125,
              pricing_unit: "MT",
            },
          ],
        }),
      ],
      "contract.json",
      { type: "application/json" },
    );

    await user.upload(screen.getByLabelText(/json file/i), file);
    expect(await screen.findByDisplayValue("Acme Trading")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^reject$/i }));

    await waitFor(() => {
      expect(screen.queryByDisplayValue("Acme Trading")).toBeNull();
    });
    expect(importDraft).not.toHaveBeenCalled();
  });

  it("keeps an empty edited date in review and reports validation", async () => {
    extract.mockResolvedValue(proposal);
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: /import contract/i }));
    await user.type(
      screen.getByLabelText(/contract text/i),
      "Purchase order text that is long enough to submit.",
    );
    await user.click(screen.getByRole("button", { name: /extract contract/i }));

    const poDate = await screen.findByLabelText(/po date/i);
    await user.clear(poDate);
    expect(poDate).toHaveValue("");
    await user.click(
      screen.getByRole("button", { name: /accept and create/i }),
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(importDraft).not.toHaveBeenCalled();
  });

  it("shows extraction errors without entering review", async () => {
    extract.mockRejectedValue(
      new Error(
        "AI contract extraction is unavailable until OPENAI_API_KEY is configured.",
      ),
    );
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: /import contract/i }));
    await user.type(
      screen.getByLabelText(/contract text/i),
      "Purchase order text that is long enough to submit.",
    );
    await user.click(screen.getByRole("button", { name: /extract contract/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AI contract extraction is unavailable",
    );
    expect(
      screen.queryByRole("button", { name: /accept and create/i }),
    ).toBeNull();
  });
});
