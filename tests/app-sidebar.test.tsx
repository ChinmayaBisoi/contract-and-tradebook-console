import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { clerkMocks } from "@/tests/mocks/clerk";

const navigationMocks = {
  pathname: "/dashboard" as string | null,
};

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMocks.pathname,
}));

vi.mock("@/components/nav-user", () => ({
  NavUser: () => <div>Nav user</div>,
}));

describe("AppSidebar", () => {
  beforeEach(() => {
    clerkMocks.openUserProfile.mockClear();
    navigationMocks.pathname = "/dashboard";
  });

  it("opens Clerk account management when Settings is clicked", async () => {
    const user = userEvent.setup();

    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(clerkMocks.openUserProfile).toHaveBeenCalledTimes(1);
  });

  it("highlights the active sidebar item with the primary background", () => {
    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    );

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveClass(
      "data-active:bg-primary",
      "data-active:text-primary-foreground",
      "data-active:hover:bg-primary",
      "data-active:hover:text-primary-foreground",
    );
  });

  it("shows org section links in sidebar when viewing an organisation route", () => {
    navigationMocks.pathname = "/org/org_1/contracts";

    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    );

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/org/org_1",
    );
    expect(screen.getByRole("link", { name: "Audit Trail" })).toHaveAttribute(
      "href",
      "/org/org_1/audit-trail",
    );
    expect(screen.getByRole("link", { name: "Team" })).toHaveAttribute(
      "href",
      "/org/org_1/teams",
    );
    expect(screen.getByRole("link", { name: "Contracts" })).toHaveAttribute(
      "href",
      "/org/org_1/contracts",
    );
    expect(screen.getByRole("link", { name: "Imports" })).toHaveAttribute(
      "href",
      "/org/org_1/imports",
    );
  });

  it("does not show org links in sidebar on non-org routes", () => {
    navigationMocks.pathname = "/dashboard";

    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    );

    expect(screen.queryByRole("link", { name: "Overview" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Audit Trail" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Team" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Contracts" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Imports" })).toBeNull();
  });

  it("renders without org links when the pathname is unavailable", () => {
    navigationMocks.pathname = null;

    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    );

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Overview" })).toBeNull();
  });

  it("marks nested org section link active without activating overview", () => {
    navigationMocks.pathname = "/org/org_1/contracts/detail";

    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    );

    expect(screen.getByRole("link", { name: "Contracts" })).toHaveAttribute(
      "data-active",
    );
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute(
      "data-active",
      "true",
    );
  });
});
