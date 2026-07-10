import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("ContractView landing page", () => {
  it("presents the approved hero and calls to action", () => {
    render(<Home />);

    expect(
      screen.getByRole("link", { name: "ContractView home" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Contracts, trades, and evidence in one calm view",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "A focused operations console for reviewing contract metadata, tradebook rows, exceptions, and audit context without spreadsheet drift.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Console" })).toHaveAttribute(
      "href",
      "#workflow",
    );
    expect(screen.getByRole("link", { name: "View Workflow" })).toHaveAttribute(
      "href",
      "#workflow",
    );
  });

  it("shows the workflow strip and representative console rows", () => {
    render(<Home />);

    const workflow = screen.getByRole("region", { name: "ContractView workflow" });
    expect(within(workflow).getByText("import tradebook")).toBeInTheDocument();
    expect(within(workflow).getByText("normalize rows")).toBeInTheDocument();
    expect(within(workflow).getByText("match contracts")).toBeInTheDocument();
    expect(within(workflow).getByText("review exceptions")).toBeInTheDocument();
    expect(within(workflow).getByText("export evidence")).toBeInTheDocument();

    expect(screen.getByText("Master Services Agreement")).toBeInTheDocument();
    expect(screen.getByText("Q4 Tradebook Upload")).toBeInTheDocument();
    expect(screen.getByText("Pricing Schedule")).toBeInTheDocument();
  });

  it("renders the six approved feature cards", () => {
    render(<Home />);

    const features = screen.getByRole("region", { name: "ContractView features" });
    [
      "Contract metadata review",
      "Tradebook reconciliation",
      "Exception queues",
      "Audit-ready evidence",
      "Import/export workflow",
      "Role-aware review",
    ].forEach((name) => {
      expect(within(features).getByRole("heading", { name })).toBeInTheDocument();
    });
  });
});
