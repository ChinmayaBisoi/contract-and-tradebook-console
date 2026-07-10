import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const schemaPath = path.join(projectRoot, "prisma/schema.prisma");
const migrationsPath = path.join(projectRoot, "prisma/migrations");

function readModelBlock(schema: string, modelName: string) {
  const match = schema.match(
    new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`),
  );

  if (!match) {
    throw new Error(`Model ${modelName} was not found in prisma/schema.prisma`);
  }

  return match[1];
}

function readEnumBlock(schema: string, enumName: string) {
  const match = schema.match(
    new RegExp(`enum ${enumName} \\{([\\s\\S]*?)\\n\\}`),
  );

  if (!match) {
    throw new Error(`Enum ${enumName} was not found in prisma/schema.prisma`);
  }

  return match[1];
}

function readOrganisationMigration() {
  const migrationDir = readdirSync(migrationsPath)
    .filter((entry) => entry.includes("organisation"))
    .sort()
    .at(-1);

  if (!migrationDir) {
    throw new Error("No organisation migration directory was found");
  }

  const migrationPath = path.join(
    migrationsPath,
    migrationDir,
    "migration.sql",
  );

  if (!existsSync(migrationPath)) {
    throw new Error(`Migration file is missing at ${migrationPath}`);
  }

  return readFileSync(migrationPath, "utf8");
}

describe("organisation Prisma schema", () => {
  it("models Clerk-backed organisation memberships", () => {
    const schema = readFileSync(schemaPath, "utf8");
    const roleEnum = readEnumBlock(schema, "OrganisationUserRole");
    const organisation = readModelBlock(schema, "Organisation");
    const organisationUser = readModelBlock(schema, "OrganisationUser");

    expect(roleEnum).toContain("OWNER");
    expect(roleEnum).toContain("MANAGER");
    expect(roleEnum).toContain("MEMBER");

    expect(organisation).toMatch(/id\s+String\s+@id\s+@default\(cuid\(\)\)/);
    expect(organisation).toMatch(/name\s+String/);
    expect(organisation).toMatch(/description\s+String\?/);
    expect(organisation).toMatch(/users\s+OrganisationUser\[\]/);
    expect(organisation).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)/);
    expect(organisation).toMatch(/updatedAt\s+DateTime\s+@updatedAt/);

    expect(organisationUser).toMatch(/id\s+String\s+@id\s+@default\(cuid\(\)\)/);
    expect(organisationUser).toContain("clerkUserId    String");
    expect(organisationUser).toContain("clerkUserName  String");
    expect(organisationUser).toContain("clerkUserEmail String");
    expect(organisationUser).toContain("organisationId String");
    expect(organisationUser).toContain(
      "organisation   Organisation         @relation(fields: [organisationId], references: [id], onDelete: Cascade, onUpdate: Cascade)",
    );
    expect(organisationUser).toContain(
      "role           OrganisationUserRole @default(MEMBER)",
    );
    expect(organisationUser).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)/);
    expect(organisationUser).toMatch(/updatedAt\s+DateTime\s+@updatedAt/);
    expect(organisationUser).toContain("@@unique([clerkUserId, organisationId])");
    expect(organisationUser).toContain("@@index([organisationId])");
  });

  it("includes a database migration for the organisation tables", () => {
    const migration = readOrganisationMigration();

    expect(migration).toContain(
      "CREATE TYPE \"OrganisationUserRole\" AS ENUM ('OWNER', 'MANAGER', 'MEMBER');",
    );
    expect(migration).toContain('CREATE TABLE "Organisation"');
    expect(migration).toContain('CREATE TABLE "OrganisationUser"');
    expect(migration).toContain('"id" TEXT NOT NULL');
    expect(migration).toContain('"clerkUserId" TEXT NOT NULL');
    expect(migration).toContain('"clerkUserName" TEXT NOT NULL');
    expect(migration).toContain('"clerkUserEmail" TEXT NOT NULL');
    expect(migration).toContain('"organisationId" TEXT NOT NULL');
    expect(migration).not.toContain(
      'PRIMARY KEY ("clerkUserId","organisationId")',
    );
    expect(migration).toContain(
      'CONSTRAINT "OrganisationUser_pkey" PRIMARY KEY ("id")',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "OrganisationUser_clerkUserId_organisationId_key"',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE',
    );
  });
});
