import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const docPath = path.resolve(__dirname, "../docs/role-based-access.md");

describe("role based access documentation", () => {
  it("documents organisation permissions as a role matrix", () => {
    expect(existsSync(docPath)).toBe(true);

    const doc = readFileSync(docPath, "utf8");

    expect(doc).toContain("| Access | Owner | Manager | Member |");
    expect(doc).toContain("| Create organisations | ✓ | - | - |");
    expect(doc).toContain("| View organisations | ✓ | ✓ | ✓ |");
    expect(doc).toContain("| Update organisations | ✓ | - | - |");
    expect(doc).toContain("| Delete organisations | ✓ | - | - |");
    expect(doc).toContain("| Invite users to an organisation | ✓ | ✓ | - |");
    expect(doc).toContain("| Remove users from an organisation | ✓ | ✓ | - |");
    expect(doc).toContain(
      "| Activate or disable organisation users | ✓ | ✓ | - |",
    );
  });
});
