import { describe, expect, it } from "vitest";

import {
  auditSearchParams,
  contractSearchParams,
  getAuditListInput,
  getContractListInput,
  getLineItemListInput,
  lineItemSearchParams,
} from "@/components/operations/search-params";

describe("operations table URL state", () => {
  it("uses stable query keys for each table", () => {
    expect(Object.keys(contractSearchParams)).toEqual([
      "q",
      "status",
      "source",
      "poFrom",
      "poTo",
      "page",
      "pageSize",
      "sort",
      "direction",
    ]);
    expect(Object.keys(lineItemSearchParams)).toEqual([
      "q",
      "contract",
      "quantityUnit",
      "pricingUnit",
      "source",
      "totalMin",
      "totalMax",
      "page",
      "pageSize",
      "sort",
      "direction",
    ]);
    expect(Object.keys(auditSearchParams)).toEqual([
      "q",
      "action",
      "entity",
      "actor",
      "from",
      "to",
      "page",
      "pageSize",
      "sort",
      "direction",
    ]);
  });

  it("maps contract URL state into the tRPC list input", () => {
    expect(
      getContractListInput("org_1", {
        q: "PO-100",
        status: "DRAFT",
        source: "EXCEL",
        poFrom: "2026-07-01",
        poTo: "",
        page: 2,
        pageSize: 20,
        sort: "poDate",
        direction: "asc",
      }),
    ).toEqual({
      organisationId: "org_1",
      filters: {
        search: "PO-100",
        status: "DRAFT",
        sourceType: "EXCEL",
        poDateFrom: new Date("2026-07-01T00:00:00.000Z"),
      },
      page: 2,
      pageSize: 20,
      sort: "poDate",
      sortDirection: "asc",
    });
  });

  it("maps scoped line-item and audit URL state", () => {
    expect(
      getLineItemListInput("org_1", "contract_1", {
        q: "copper",
        contract: "",
        quantityUnit: "MT",
        pricingUnit: "",
        source: "EXCEL",
        totalMin: "10",
        totalMax: "5000",
        page: 1,
        pageSize: 50,
        sort: "total",
        direction: "desc",
      }),
    ).toMatchObject({
      organisationId: "org_1",
      contractId: "contract_1",
      filters: {
        search: "copper",
        quantityUnit: "MT",
        sourceType: "EXCEL",
        totalMin: 10,
        totalMax: 5000,
      },
    });
    expect(
      getAuditListInput("org_1", {
        q: "owner",
        action: "ROLE_CHANGE",
        entity: "ORGANISATION_USER",
        actor: "owner_1",
        from: "",
        to: "",
        page: 1,
        pageSize: 10,
        sort: "occurredAt",
        direction: "desc",
      }),
    ).toMatchObject({
      organisationId: "org_1",
      filters: {
        search: "owner",
        action: "ROLE_CHANGE",
        entityType: "ORGANISATION_USER",
        actorId: "owner_1",
      },
    });
  });
});
