import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
  Inter: () => ({ variable: "--font-sans" }),
}));

import { metadata } from "@/app/layout";

describe("root metadata", () => {
  it("names the application ContractView", () => {
    expect(metadata.title).toEqual({
      default: "ContractView",
      template: "%s · ContractView",
    });
    expect(metadata.description).toBe(
      "ContractView — contract and tradebook operations console.",
    );
  });
});
