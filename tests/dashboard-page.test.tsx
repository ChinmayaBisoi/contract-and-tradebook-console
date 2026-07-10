import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import DashboardPage from "@/app/(protected)/dashboard/page";

vi.mock("@/components/topbar", () => ({
  default: () => <header>ContractView</header>,
}));

describe("DashboardPage", () => {
  it("renders the dashboard header, action, search, filters, and workspace table", () => {
    render(<DashboardPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Your workspaces" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Review the contract and tradebook workspaces you can access.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Workspace" }),
    ).toBeInTheDocument();

    expect(
      screen.getByPlaceholderText("Search by name..."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Contracts" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Tradebooks" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();

    const table = screen.getByRole("table", {
      name: "ContractView workspaces",
    });
    ["Name", "Role", "Created", "Focus"].forEach((heading) => {
      expect(
        within(table).getByRole("columnheader", { name: heading }),
      ).toBeInTheDocument();
    });

    [
      "Takeda onboarding testing",
      "No Credit Chinmaya's Org",
      "Demo organisation",
      "AI Pilot Phase Evaluation 9 Feb 2026",
      "AI testing projects",
    ].forEach((workspaceName) => {
      expect(within(table).getByText(workspaceName)).toBeInTheDocument();
    });

    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    expect(screen.queryByText("Inactive")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Status" })).toBeNull();
  });
});
