import type { AuthContext } from "@/trpc/init";

type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "STATUS_CHANGE"
  | "DELETE"
  | "IMPORT"
  | "ROLE_CHANGE"
  | "INVITE"
  | "ACCEPT"
  | "DECLINE"
  | "CANCEL";

type AuditEntityType =
  | "CONTRACT"
  | "LINE_ITEM"
  | "UPLOAD"
  | "TRADEBOOK_IMPORT"
  | "ORGANISATION_USER"
  | "INVITATION";

type AuditState = Record<string, unknown>;

export type AuditEventInput = {
  organisationId: string;
  actor: AuthContext;
  actorRole: "OWNER" | "ADMIN" | "MEMBER";
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  entityLabel?: string;
  beforeState?: AuditState;
  afterState?: AuditState;
  metadata?: AuditState;
  contractId?: string;
  lineItemId?: string;
  uploadId?: string;
  tradebookImportId?: string;
  organisationUserId?: string;
  invitationId?: string;
};

function changedFields(
  beforeState: AuditState | undefined,
  afterState: AuditState | undefined,
) {
  const fields = new Set([
    ...Object.keys(beforeState ?? {}),
    ...Object.keys(afterState ?? {}),
  ]);

  return [...fields]
    .filter(
      (field) =>
        JSON.stringify(beforeState?.[field]) !==
        JSON.stringify(afterState?.[field]),
    )
    .sort();
}

export function buildAuditData(input: AuditEventInput) {
  const { actor, ...event } = input;

  return {
    ...event,
    actorClerkUserId: actor.clerkUserId,
    actorName: actor.name ?? actor.email,
    actorEmail: actor.email,
    changedFields: changedFields(input.beforeState, input.afterState),
  };
}

type AuditDb = {
  auditEvent: {
    create: (args: {
      data: ReturnType<typeof buildAuditData>;
    }) => Promise<unknown>;
  };
};

export function writeAuditEvent(db: AuditDb, input: AuditEventInput) {
  return db.auditEvent.create({ data: buildAuditData(input) });
}
