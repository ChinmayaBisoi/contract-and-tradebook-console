import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { clerkMocks } from "@/tests/mocks/clerk";

vi.mock("@/components/nav-user", () => ({
  NavUser: () => <div>Nav user</div>,
}));

describe("AppSidebar", () => {
  beforeEach(() => {
    clerkMocks.openUserProfile.mockClear();
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
});
