import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";

import OrganisationError from "@/app/(protected)/org/[orgId]/error";
import { OrganisationNav } from "@/components/organisation/organisation-nav";
import {
  OrganisationWorkspace,
  OrganisationWorkspaceErrorBoundary,
} from "@/components/organisation/organisation-workspace";
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

const serverMocks = vi.hoisted(() => ({
  prefetchQuery: vi.fn(),
  queryOptions: vi.fn((input: { id: string }) => ({ input })),
}));

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

vi.mock("@/trpc/server", () => ({
  getQueryClient: () => ({ prefetchQuery: serverMocks.prefetchQuery }),
  HydrateClient: ({ children }: { children: React.ReactNode }) => children,
  trpc: {
    organisation: {
      get: { queryOptions: serverMocks.queryOptions },
    },
  },
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
  it("starts server prefetch without waiting for organisation data", async () => {
    serverMocks.prefetchQuery.mockReturnValue(new Promise(() => undefined));
    const { default: OrganisationLayout } = await import(
      "@/app/(protected)/org/[orgId]/layout"
    );

    const result = await Promise.race([
      OrganisationLayout({
        children: <p>Analytics placeholder</p>,
        params: Promise.resolve({ orgId: "org_1" }),
      }),
      new Promise((resolve) => setTimeout(() => resolve("timed out"), 25)),
    ]);

    expect(result).not.toBe("timed out");
    expect(serverMocks.queryOptions).toHaveBeenCalledWith({ id: "org_1" });
    expect(serverMocks.prefetchQuery).toHaveBeenCalledTimes(1);
  });

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

  it("shows safe access copy without exposing backend details", () => {
    const error = Object.assign(new Error("sensitive database details"), {
      data: { code: "FORBIDDEN" },
    });

    render(<OrganisationError error={error} reset={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Organisation access restricted" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your account does not have access to this organisation.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("sensitive database details"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
  });

  it("offers retry with generic safe copy for unavailable organisations", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    const error = Object.assign(new Error("private upstream response"), {
      data: { code: "NOT_FOUND" },
    });

    render(<OrganisationError error={error} reset={reset} />);

    expect(
      screen.getByRole("heading", { name: "Organisation unavailable" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This organisation could not be found or is temporarily unavailable.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("private upstream response"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("catches workspace query failures with organisation recovery UI", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const error = Object.assign(new Error("private query failure"), {
      data: { code: "UNAUTHORIZED" },
    });

    function FailingWorkspace() {
      throw error;
    }

    render(
      <OrganisationWorkspaceErrorBoundary>
        <FailingWorkspace />
      </OrganisationWorkspaceErrorBoundary>,
    );

    expect(
      screen.getByRole("heading", { name: "Organisation access restricted" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("private query failure")).not.toBeInTheDocument();

    consoleError.mockRestore();
  });
});
