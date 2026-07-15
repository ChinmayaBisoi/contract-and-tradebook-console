import type { ContractInput, LineItemInput } from "@/lib/contracts/contract-schemas";

type FieldDataItem = {
  description: string;
  quantity: number;
  quantity_unit?: string;
  unit_price: number;
  pricing_unit?: string;
  total: number;
};

type ContractFieldDataInput = {
  contract: ContractInput;
  items: FieldDataItem[];
};

export function computeContractTotal(items: FieldDataItem[]) {
  return items.reduce((sum, item) => sum + item.total, 0);
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function buildContractFieldData({
  contract,
  items,
}: ContractFieldDataInput) {
  return {
    client_name: contract.clientName,
    po_ref_no: contract.poRefNo,
    po_date: toDateOnly(contract.poDate),
    payment_terms: contract.paymentTerms ?? null,
    delivery_terms: contract.deliveryTerms ?? null,
    total: computeContractTotal(items),
    items,
  };
}

export function toFieldDataItem(item: LineItemInput): FieldDataItem {
  return {
    description: item.description,
    quantity: item.quantity,
    quantity_unit: item.quantityUnit,
    unit_price: item.unitPrice,
    pricing_unit: item.pricingUnit,
    total: item.quantity * item.unitPrice,
  };
}
