import {
  createParser,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

const pageSizes = [10, 20, 50] as const;
const directions = ["asc", "desc"] as const;
const sources = ["EXCEL", "JSON", "AI_EXTRACT", "MANUAL"] as const;

const pageSizeParser = createParser({
  parse(value) {
    const parsed = Number.parseInt(value, 10);
    return pageSizes.includes(parsed as (typeof pageSizes)[number])
      ? (parsed as (typeof pageSizes)[number])
      : null;
  },
  serialize: String,
});

export const contractSearchParams = {
  q: parseAsString.withDefault(""),
  status: parseAsStringLiteral(["DRAFT", "FINALIZED", "ARCHIVED"] as const),
  source: parseAsStringLiteral(sources),
  poFrom: parseAsString.withDefault(""),
  poTo: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
  pageSize: pageSizeParser.withDefault(10),
  sort: parseAsStringLiteral([
    "clientName",
    "poRefNo",
    "poDate",
    "status",
    "itemCount",
    "lineTotal",
    "updatedAt",
  ] as const).withDefault("updatedAt"),
  direction: parseAsStringLiteral(directions).withDefault("desc"),
};

export const lineItemSearchParams = {
  q: parseAsString.withDefault(""),
  contract: parseAsString.withDefault(""),
  quantityUnit: parseAsString.withDefault(""),
  pricingUnit: parseAsString.withDefault(""),
  source: parseAsStringLiteral(sources),
  totalMin: parseAsString.withDefault(""),
  totalMax: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
  pageSize: pageSizeParser.withDefault(10),
  sort: parseAsStringLiteral([
    "description",
    "quantity",
    "unitPrice",
    "total",
    "poRefNo",
    "updatedAt",
  ] as const).withDefault("updatedAt"),
  direction: parseAsStringLiteral(directions).withDefault("desc"),
};

const auditActions = [
  "CREATE",
  "UPDATE",
  "STATUS_CHANGE",
  "DELETE",
  "IMPORT",
  "ROLE_CHANGE",
  "INVITE",
  "ACCEPT",
  "DECLINE",
  "CANCEL",
] as const;
const auditEntities = [
  "CONTRACT",
  "LINE_ITEM",
  "UPLOAD",
  "TRADEBOOK_IMPORT",
  "ORGANISATION_USER",
  "INVITATION",
] as const;

export const auditSearchParams = {
  q: parseAsString.withDefault(""),
  action: parseAsStringLiteral(auditActions),
  entity: parseAsStringLiteral(auditEntities),
  actor: parseAsString.withDefault(""),
  from: parseAsString.withDefault(""),
  to: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
  pageSize: pageSizeParser.withDefault(10),
  sort: parseAsStringLiteral([
    "occurredAt",
    "actorName",
    "action",
    "entityType",
  ] as const).withDefault("occurredAt"),
  direction: parseAsStringLiteral(directions).withDefault("desc"),
};

type ContractState = {
  q: string;
  status: "DRAFT" | "FINALIZED" | "ARCHIVED" | null;
  source: (typeof sources)[number] | null;
  poFrom: string;
  poTo: string;
  page: number;
  pageSize: (typeof pageSizes)[number];
  sort:
    | "clientName"
    | "poRefNo"
    | "poDate"
    | "status"
    | "itemCount"
    | "lineTotal"
    | "updatedAt";
  direction: (typeof directions)[number];
};

function startDate(value: string) {
  return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
}

function endDate(value: string) {
  return value ? new Date(`${value}T23:59:59.999Z`) : undefined;
}

export function getContractListInput(
  organisationId: string,
  state: ContractState,
) {
  return {
    organisationId,
    filters: {
      ...(state.q.trim() ? { search: state.q.trim() } : {}),
      ...(state.status ? { status: state.status } : {}),
      ...(state.source ? { sourceType: state.source } : {}),
      ...(startDate(state.poFrom)
        ? { poDateFrom: startDate(state.poFrom) }
        : {}),
      ...(endDate(state.poTo) ? { poDateTo: endDate(state.poTo) } : {}),
    },
    page: state.page,
    pageSize: state.pageSize,
    sort: state.sort,
    sortDirection: state.direction,
  };
}

type LineItemState = {
  q: string;
  contract: string;
  quantityUnit: string;
  pricingUnit: string;
  source: (typeof sources)[number] | null;
  totalMin: string;
  totalMax: string;
  page: number;
  pageSize: (typeof pageSizes)[number];
  sort:
    | "description"
    | "quantity"
    | "unitPrice"
    | "total"
    | "poRefNo"
    | "updatedAt";
  direction: (typeof directions)[number];
};

function optionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function getLineItemListInput(
  organisationId: string,
  contractId: string | undefined,
  state: LineItemState,
) {
  return {
    organisationId,
    ...(contractId ? { contractId } : {}),
    filters: {
      ...(state.q.trim() ? { search: state.q.trim() } : {}),
      ...(!contractId && state.contract ? { contractId: state.contract } : {}),
      ...(state.quantityUnit ? { quantityUnit: state.quantityUnit } : {}),
      ...(state.pricingUnit ? { pricingUnit: state.pricingUnit } : {}),
      ...(state.source ? { sourceType: state.source } : {}),
      ...(optionalNumber(state.totalMin) !== undefined
        ? { totalMin: optionalNumber(state.totalMin) }
        : {}),
      ...(optionalNumber(state.totalMax) !== undefined
        ? { totalMax: optionalNumber(state.totalMax) }
        : {}),
    },
    page: state.page,
    pageSize: state.pageSize,
    sort: state.sort,
    sortDirection: state.direction,
  };
}

type AuditState = {
  q: string;
  action: (typeof auditActions)[number] | null;
  entity: (typeof auditEntities)[number] | null;
  actor: string;
  from: string;
  to: string;
  page: number;
  pageSize: (typeof pageSizes)[number];
  sort: "occurredAt" | "actorName" | "action" | "entityType";
  direction: (typeof directions)[number];
};

export function getAuditListInput(organisationId: string, state: AuditState) {
  return {
    organisationId,
    filters: {
      ...(state.q.trim() ? { search: state.q.trim() } : {}),
      ...(state.action ? { action: state.action } : {}),
      ...(state.entity ? { entityType: state.entity } : {}),
      ...(state.actor ? { actorId: state.actor } : {}),
      ...(startDate(state.from) ? { occurredFrom: startDate(state.from) } : {}),
      ...(endDate(state.to) ? { occurredTo: endDate(state.to) } : {}),
    },
    page: state.page,
    pageSize: state.pageSize,
    sort: state.sort,
    sortDirection: state.direction,
  };
}
