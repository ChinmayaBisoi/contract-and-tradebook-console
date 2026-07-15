import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SortButton } from "@/components/operations/table-states";

describe("SortButton", () => {
  it("reflects active sort direction in aria-sort", async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();

    const { rerender } = render(
      <SortButton
        label="Created"
        column="createdAt"
        sort="name"
        direction="desc"
        onSort={onSort}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Sort by created" }),
    ).toHaveAttribute("aria-sort", "none");

    rerender(
      <SortButton
        label="Created"
        column="createdAt"
        sort="createdAt"
        direction="asc"
        onSort={onSort}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Sort by created" }),
    ).toHaveAttribute("aria-sort", "ascending");

    await user.click(screen.getByRole("button", { name: "Sort by created" }));
    expect(onSort).toHaveBeenCalledWith("createdAt");
  });
});
