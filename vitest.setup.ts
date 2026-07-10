import "@testing-library/jest-dom/vitest";
import React from "react";
import { vi } from "vitest";

import { clerkMocks } from "./tests/mocks/clerk";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

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
  useUser: () => ({
    isLoaded: true,
    user: {
      fullName: "Test User",
      primaryEmailAddress: { emailAddress: "test@example.com" },
      imageUrl: "https://example.com/avatar.jpg",
    },
  }),
  useClerk: () => ({
    signOut: clerkMocks.signOut,
    openUserProfile: clerkMocks.openUserProfile,
  }),
}));
