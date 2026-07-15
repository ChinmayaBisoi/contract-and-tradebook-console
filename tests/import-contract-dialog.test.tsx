import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImportContractDialog } from "@/components/contracts/import-contract-dialog";

const extract = vi.fn();
const importDraft = vi.fn().mockResolvedValue({ id: "contract_1" });
const importDrafts = vi.fn().mockResolvedValue({
  contracts: [{ id: "contract_1" }, { id: "contract_2" }],
  contractCount: 2,
  lineItemCount: 2,
});
const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    contract: {
      extract: { mutationOptions: () => ({ mutationFn: extract }) },
      importDraft: { mutationOptions: () => ({ mutationFn: importDraft }) },
      importDrafts: { mutationOptions: () => ({ mutationFn: importDrafts }) },
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
    importDrafts.mockClear();
    push.mockClear();
  });

  it("reviews and accepts an editable AI extraction", async () => {
    extract.mockResolvedValue({
      proposal,
      extractionReceipt: "signed-extraction-receipt",
    });
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
        extractionReceipt: "signed-extraction-receipt",
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

  it("rejects oversized JSON before reading it", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: /import contract/i }));
    await user.click(screen.getByRole("tab", { name: /upload json/i }));
    const file = new File([new Uint8Array(10_000_001)], "contracts.json", {
      type: "application/json",
    });

    await user.upload(screen.getByLabelText(/json file/i), file);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "JSON files must be 10 MB or smaller",
    );
    expect(importDraft).not.toHaveBeenCalled();
  });

  it("rejects files that are not JSON", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderDialog();

    await user.click(screen.getByRole("button", { name: /import contract/i }));
    await user.click(screen.getByRole("tab", { name: /upload json/i }));
    await user.upload(
      screen.getByLabelText(/json file/i),
      new File(["not json"], "contracts.txt", { type: "text/plain" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a .json file",
    );
    expect(importDraft).not.toHaveBeenCalled();
  });

  it("reviews and atomically imports every contract in an exported JSON array", async () => {
    const user = userEvent.setup();
    renderDialog();
    const exportedContract = {
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
          total: 1250,
        },
      ],
    };

    await user.click(screen.getByRole("button", { name: /import contract/i }));
    await user.click(screen.getByRole("tab", { name: /upload json/i }));
    await user.upload(
      screen.getByLabelText(/json file/i),
      new File(
        [
          JSON.stringify([
            exportedContract,
            {
              ...exportedContract,
              client_name: "Beta Trading",
              po_ref_no: "PO-101",
            },
          ]),
        ],
        "organisation-contracts.json",
        { type: "application/json" },
      ),
    );

    expect(await screen.findByText("Contract 1 of 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /next contract/i }));
    expect(screen.getByDisplayValue("Beta Trading")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /accept and create 2/i }),
    );

    expect(importDrafts).toHaveBeenCalledWith(
      expect.objectContaining({
        organisationId: "org_1",
        proposals: expect.arrayContaining([
          expect.objectContaining({
            contract: expect.objectContaining({ poRefNo: "PO-100" }),
          }),
          expect.objectContaining({
            contract: expect.objectContaining({ poRefNo: "PO-101" }),
          }),
        ]),
      }),
      expect.anything(),
    );
    expect(importDraft).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/org/org_1/contracts");
  });

  it("keeps an empty edited date in review and reports validation", async () => {
    extract.mockResolvedValue({
      proposal,
      extractionReceipt: "signed-extraction-receipt",
    });
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
