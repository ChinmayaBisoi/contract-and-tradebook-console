import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import TeamPage from "@/app/(protected)/team/page";

describe("TeamPage", () => {
  it("renders the team page with mock members", () => {
    render(<TeamPage />);

    expect(screen.getByRole("heading", { name: "Team", level: 1 })).toBeInTheDocument();
    expect(
      screen.getByText("Manage organisation members, roles, and access."),
    ).toBeInTheDocument();
    expect(screen.getByText("Total members")).toBeInTheDocument();
    expect(screen.getByText("Chinmaya Rao")).toBeInTheDocument();
    expect(screen.getByText("priya.nair@contractview.io")).toBeInTheDocument();
    expect(screen.getByText("OWNER")).toBeInTheDocument();
    expect(screen.getByText("DISABLED")).toBeInTheDocument();
  });
});
