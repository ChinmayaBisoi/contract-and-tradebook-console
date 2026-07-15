import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import OrganisationAuditTrailPage from "@/app/(protected)/org/[orgId]/audit-trail/page";
import OrganisationImportsPage from "@/app/(protected)/org/[orgId]/imports/page";

type OrganisationSectionPage = (props: {
  params: Promise<{ orgId: string }>;
}) => ReactNode | Promise<ReactNode>;

async function renderPage(Page: OrganisationSectionPage) {
  render(await Page({ params: Promise.resolve({ orgId: "org_1" }) }));
}

describe("organisation placeholder pages", () => {
  it("honestly explains that audit event storage is unavailable", async () => {
    await renderPage(OrganisationAuditTrailPage);

    expect(
      screen.getByRole("heading", { name: "Audit Trail" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /audit event storage is not connected.*this organisation yet/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /analytics/i })).toHaveAttribute(
      "href",
      "/org/org_1",
    );
  });

  it("honestly explains that import processing is unavailable", async () => {
    await renderPage(OrganisationImportsPage);

    expect(
      screen.getByRole("heading", { name: "Imports" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /import processing is not connected.*this organisation yet/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /analytics/i })).toHaveAttribute(
      "href",
      "/org/org_1",
    );
  });

  it.each([
    ["audit trail", OrganisationAuditTrailPage],
    ["imports", OrganisationImportsPage],
  ])("does not fabricate %s records or controls", async (_, Page) => {
    await renderPage(Page);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("row")).not.toBeInTheDocument();
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /create|add|import/i }),
    ).not.toBeInTheDocument();
  });
});
