import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import DashboardPage from "@/app/(protected)/dashboard/page";

vi.mock("@/components/chart-area-interactive", () => ({
  ChartAreaInteractive: () => <div>Chart area</div>,
}));

vi.mock("@/components/data-table", () => ({
  DataTable: () => <div data-testid="data-table">Data table</div>,
}));

describe("DashboardPage", () => {
  it("renders the dashboard layout with ContractView branding and main content", () => {
    render(<DashboardPage />);

    expect(screen.getByText("ContractView")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Documents" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Total Revenue")).toBeInTheDocument();
    expect(screen.getByText("Chart area")).toBeInTheDocument();
    expect(screen.getByTestId("data-table")).toBeInTheDocument();
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();

    expect(screen.queryByText("Quick Create")).not.toBeInTheDocument();
    expect(screen.queryByText("Analytics")).not.toBeInTheDocument();
    expect(screen.queryByText("Projects")).not.toBeInTheDocument();
    expect(screen.queryByText("Lifecycle")).not.toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.queryByText("Search")).not.toBeInTheDocument();
    expect(screen.queryByText("Documents", { selector: "span" })).toBeNull();
  });
});
