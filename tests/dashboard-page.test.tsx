import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import DashboardPage from "@/app/(protected)/dashboard/page";

vi.mock("@/components/dashboard/organisation-dashboard", () => ({
  OrganisationDashboard: () => (
    <div data-testid="organisation-dashboard">
      <button type="button">Organisations</button>
      <button type="button">Invitations</button>
    </div>
  ),
}));

describe("DashboardPage", () => {
  it("renders the organisation and invitation dashboard inside the protected shell", () => {
    render(<DashboardPage />);

    expect(screen.getByText("ContractView")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("organisation-dashboard")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Organisations" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Invitations" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });
});
