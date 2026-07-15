import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";

import { OrganisationNav } from "@/components/organisation/organisation-nav";
import { OrganisationWorkspace } from "@/components/organisation/organisation-workspace";
import { OrganisationWorkspaceSkeleton } from "@/components/organisation/organisation-workspace-skeleton";

const organisation = {
  id: "org_1",
  name: "Contract Operations",
  description: "Primary review team",
  role: "OWNER" as const,
  status: "ACTIVE" as const,
  createdAt: new Date("2026-07-10T00:00:00.000Z"),
  updatedAt: new Date("2026-07-10T00:00:00.000Z"),
};

let pathname = "/org/org_1";
let query = vi.fn().mockResolvedValue(organisation);

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("@/trpc/client", () => ({
  useTRPC: () => ({
    organisation: {
      get: {
        queryOptions: ({ id }: { id: string }) => ({
          queryKey: [["organisation", "get"], { input: { id } }],
          queryFn: query,
        }),
      },
    },
  }),
}));

function renderWorkspace(queryClient = new QueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<OrganisationWorkspaceSkeleton />}>
        <OrganisationWorkspace orgId="org_1">
          <p>Analytics placeholder</p>
        </OrganisationWorkspace>
      </Suspense>
    </QueryClientProvider>,
  );
}

describe("OrganisationWorkspace", () => {
  it("renders the organisation masthead, role, and child content", async () => {
    renderWorkspace();

    expect(
      await screen.findByRole("heading", { name: "Contract Operations" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Primary review team")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Analytics placeholder")).toBeInTheDocument();
  });

  it("renders organisation links and identifies the active route", () => {
    pathname = "/org/org_1/contracts";
    render(<OrganisationNav orgId="org_1" />);

    expect(screen.getByRole("link", { name: "Analytics" })).toHaveAttribute(
      "href",
      "/org/org_1",
    );
    expect(screen.getByRole("link", { name: "Contracts" })).toHaveAttribute(
      "href",
      "/org/org_1/contracts",
    );
    expect(screen.getByRole("link", { name: "Audit Trail" })).toHaveAttribute(
      "href",
      "/org/org_1/audit-trail",
    );
    expect(screen.getByRole("link", { name: "Teams" })).toHaveAttribute(
      "href",
      "/org/org_1/teams",
    );
    expect(screen.getByRole("link", { name: "Contracts" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Analytics" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("activates the Suspense fallback while organisation data is pending", () => {
    query = vi.fn(() => new Promise(() => undefined));

    renderWorkspace();

    expect(
      screen.getByRole("status", { name: "Loading organisation workspace" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Contract Operations" }),
    ).not.toBeInTheDocument();
  });
});
