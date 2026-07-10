import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TeamMember } from "@/lib/team/mock-members";

function getInitials(name: string) {
  return (
    name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U"
  );
}

function roleBadgeVariant(role: TeamMember["role"]) {
  switch (role) {
    case "OWNER":
      return "default" as const;
    case "MANAGER":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

function statusBadgeVariant(status: TeamMember["status"]) {
  return status === "ACTIVE" ? "outline" : "destructive";
}

interface TeamMembersTableProps {
  members: TeamMember[];
}

export function TeamMembersTable({ members }: TeamMembersTableProps) {
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-xs">
      <Table aria-label="Team members">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-12 px-4 lg:px-6">Member</TableHead>
            <TableHead className="h-12 px-4 lg:px-6">Role</TableHead>
            <TableHead className="h-12 px-4 lg:px-6">Status</TableHead>
            <TableHead className="h-12 px-4 lg:px-6">Joined</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.id}>
              <TableCell className="px-4 py-4 lg:px-6">
                <div className="flex items-center gap-3">
                  <Avatar className="size-9 rounded-lg">
                    <AvatarImage
                      src={`https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(member.name)}`}
                      alt={member.name}
                    />
                    <AvatarFallback className="rounded-lg">
                      {getInitials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{member.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {member.email}
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="px-4 py-4 lg:px-6">
                <Badge variant={roleBadgeVariant(member.role)}>
                  {member.role}
                </Badge>
              </TableCell>
              <TableCell className="px-4 py-4 lg:px-6">
                <Badge variant={statusBadgeVariant(member.status)}>
                  {member.status}
                </Badge>
              </TableCell>
              <TableCell className="px-4 py-4 text-muted-foreground lg:px-6">
                {member.joinedAt}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
