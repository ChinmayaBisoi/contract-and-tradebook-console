import type {
  DashboardQueryState,
  DashboardQueryUpdate,
} from "@/components/data-table-v2/data-table-search-params";

export type OrganisationRow = {
  id: string;
  name: string;
  description: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER";
  status: "ACTIVE" | "DISABLED" | "REMOVED";
  activeMemberCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type InvitationRow = {
  id: string;
  email: string;
  organisationId: string;
  organisationName: string;
  role: "ADMIN" | "MEMBER";
  inviterName: string;
  inviterEmail: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED";
  expiresAt: Date | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  direction: "received" | "managed" | "both";
  canAccept: boolean;
  canDecline: boolean;
  canEdit: boolean;
  canCancel: boolean;
};

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

export type OrganisationDashboardViewProps = DashboardQueryState & {
  activeTab: DashboardQueryState["tab"];
  organisations: OrganisationRow[];
  invitations: InvitationRow[];
  pagination: Pagination;
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  mutationError: string | null;
  isMutating: boolean;
  onQueryChange: (update: DashboardQueryUpdate) => void;
  onCreateOrganisation: (input: {
    name: string;
    description?: string;
  }) => Promise<void>;
  onCreateInvitation: (input: {
    organisationId: string;
    email: string;
    role: "ADMIN" | "MEMBER";
    expiresAt: Date;
  }) => Promise<void>;
  onUpdateInvitation: (input: {
    id: string;
    role: "ADMIN" | "MEMBER";
    expiresAt: Date;
  }) => Promise<void>;
  onAcceptInvitation: (id: string) => void;
  onDeclineInvitation: (id: string) => void;
  onCancelInvitation: (id: string) => void;
  onRetry: () => void;
};
