"use client";

import { useClerk } from "@clerk/nextjs";
import {
  FileTextIcon,
  LayoutDashboardIcon,
  ScrollTextIcon,
  Settings2Icon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type * as React from "react";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { openUserProfile } = useClerk();
  const pathname = usePathname();
  const orgMatch = pathname.match(/^\/org\/([^/]+)/);
  const orgId = orgMatch?.[1];
  const orgBasePath = orgId ? `/org/${orgId}` : null;

  const navMain = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: <LayoutDashboardIcon />,
    },
    // {
    //   title: "Team",
    //   url: "/team",
    //   icon: <UsersIcon />,
    // },
    {
      title: "Settings",
      icon: <Settings2Icon />,
      onClick: () => openUserProfile(),
    },
  ];
  const orgNavItems = orgBasePath
    ? [
      {
        title: "Overview",
        url: orgBasePath,
        icon: <LayoutDashboardIcon />,
        match: "exact" as const,
      },
      {
        title: "Audit Trail",
        url: `${orgBasePath}/audit-trail`,
        icon: <ScrollTextIcon />,
        match: "prefix" as const,
      },
      {
        title: "Team",
        url: `${orgBasePath}/teams`,
        icon: <UsersIcon />,
        match: "prefix" as const,
      },
      {
        title: "Contracts",
        url: `${orgBasePath}/contracts`,
        icon: <FileTextIcon />,
        match: "prefix" as const,
      },
    ]
    : [];

  const baseNavItems = navMain;

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href="/dashboard" />}
            >
              <span className="flex size-8! w-8 items-center justify-center border border-primary/25 bg-primary text-xs font-black text-primary-foreground">
                CV
              </span>
              <span className="text-base font-semibold">ContractView</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={baseNavItems} />
        {orgNavItems.length > 0 ? (
          <NavMain title="Organisation" items={orgNavItems} />
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
