export type TeamMemberRole = "OWNER" | "MANAGER" | "MEMBER";
export type TeamMemberStatus = "ACTIVE" | "DISABLED";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamMemberRole;
  status: TeamMemberStatus;
  joinedAt: string;
}

export const mockTeamMembers: TeamMember[] = [
  {
    id: "member_1",
    name: "Chinmaya Rao",
    email: "chinmaya@contractview.io",
    role: "OWNER",
    status: "ACTIVE",
    joinedAt: "07 Jul, 2026",
  },
  {
    id: "member_2",
    name: "Priya Nair",
    email: "priya.nair@contractview.io",
    role: "MANAGER",
    status: "ACTIVE",
    joinedAt: "18 Jun, 2026",
  },
  {
    id: "member_3",
    name: "Alex Chen",
    email: "alex.chen@takeda.com",
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "02 May, 2026",
  },
  {
    id: "member_4",
    name: "Jordan Blake",
    email: "jordan.blake@takeda.com",
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "14 Apr, 2026",
  },
  {
    id: "member_5",
    name: "Samira Khan",
    email: "samira.khan@contractview.io",
    role: "MEMBER",
    status: "DISABLED",
    joinedAt: "09 Jan, 2026",
  },
];
