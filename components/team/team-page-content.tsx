import { UserPlusIcon } from "lucide-react";

import ComingSoon from "@/components/coming-soon";
import { TeamMembersTable } from "@/components/team/team-members-table";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { mockTeamMembers } from "@/lib/team/mock-members";

const activeMembers = mockTeamMembers.filter(
  (member) => member.status === "ACTIVE",
).length;
const managerCount = mockTeamMembers.filter(
  (member) => member.role === "MANAGER" || member.role === "OWNER",
).length;

export function TeamPageContent() {
  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="flex flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
        <p className="text-sm text-muted-foreground">
          Manage organisation members, roles, and access.
        </p>
        <Button className="w-full sm:w-auto" disabled>
          <UserPlusIcon />
          Invite member
          <ComingSoon className="ml-1" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total members</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {mockTeamMembers.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Active</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {activeMembers}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Owners and managers</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {managerCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="px-4 lg:px-6">
        <TeamMembersTable members={mockTeamMembers} />
      </div>
    </div>
  );
}
