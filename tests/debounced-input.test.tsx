import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DebouncedInput } from "@/components/filters/debounced-input";

describe("DebouncedInput", () => {
  it("commits once after typing stops", () => {
    vi.useFakeTimers();
    const onCommit = vi.fn();

    render(
      <DebouncedInput
        aria-label="Search"
        value=""
        onCommit={onCommit}
        delayMs={300}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Search" });
    fireEvent.change(input, { target: { value: "abc" } });

    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("abc");
    vi.useRealTimers();
  });
});
