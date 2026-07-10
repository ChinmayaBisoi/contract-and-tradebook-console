# ContractView Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved ContractView landing page on the home route.

**Architecture:** Keep the landing page as a static React Server Component in `app/page.tsx` with local arrays for representative workflow rows and feature cards. Update root metadata in `app/layout.tsx`. Add Vitest coverage that checks the approved copy, CTAs, workflow section, features, and metadata.

**Tech Stack:** Next.js App Router, React 19, Tailwind CSS v4, shadcn theme variables, Vitest, React Testing Library.

---

### Task 1: Landing Page Tests

**Files:**
- Create: `tests/landing-page.test.tsx`

- [ ] **Step 1: Write failing tests for approved landing content**

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("ContractView landing page", () => {
  it("presents the approved hero and calls to action", () => {
    render(<Home />);

    expect(screen.getByText("ContractView")).toBeInTheDocument();
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
```

- [ ] **Step 2: Verify the tests fail for the starter page**

Run: `bun run test tests/landing-page.test.tsx`

Expected: FAIL because the current starter page does not render `ContractView`.

### Task 2: Metadata Test

**Files:**
- Create: `tests/metadata.test.ts`

- [ ] **Step 1: Write a failing metadata test**

```ts
import { describe, expect, it } from "vitest";

import { metadata } from "@/app/layout";

describe("root metadata", () => {
  it("names the application ContractView", () => {
    expect(metadata.title).toBe("ContractView");
    expect(metadata.description).toBe("Contract and tradebook operations console.");
  });
});
```

- [ ] **Step 2: Verify the metadata test fails**

Run: `bun run test tests/metadata.test.ts`

Expected: FAIL because the current title is `Create Next App`.

### Task 3: Implement Home Page

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace starter content with the static landing page**

Implement the page with:
- Header brand and links.
- Hero headline and approved supporting copy.
- `Open Console` and `View Workflow` links pointing to `#workflow`.
- Workflow region labelled `ContractView workflow`.
- Static console preview rows.
- Feature region labelled `ContractView features`.
- Footer brand and links.

- [ ] **Step 2: Run the landing page tests**

Run: `bun run test tests/landing-page.test.tsx`

Expected: PASS.

### Task 4: Implement Metadata

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update root metadata**

Set:

```ts
export const metadata: Metadata = {
  title: "ContractView",
  description: "Contract and tradebook operations console.",
};
```

- [ ] **Step 2: Run the metadata test**

Run: `bun run test tests/metadata.test.ts`

Expected: PASS.

### Task 5: Verification

**Files:**
- No new files.

- [ ] **Step 1: Run the full test suite**

Run: `bun run test`

Expected: PASS.

- [ ] **Step 2: Run lint**

Run: `bun run lint`

Expected: PASS.

- [ ] **Step 3: Run build**

Run: `bun run build`

Expected: PASS.

- [ ] **Step 4: Start local server and inspect the page**

Run: `bun run dev`

Expected: The home page renders ContractView without horizontal overflow or overlapping text on desktop and mobile.
