import "@testing-library/jest-dom/vitest";
import React from "react";
import { vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  Show: ({
    children,
    when,
  }: {
    children: React.ReactNode;
    when: "signed-in" | "signed-out";
  }) =>
    when === "signed-out"
      ? React.createElement(React.Fragment, null, children)
      : null,
  SignInButton: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  UserButton: () => React.createElement("button", { type: "button" }, "User"),
}));
