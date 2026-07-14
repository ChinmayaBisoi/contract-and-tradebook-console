"use client";

import { useClerk } from "@clerk/nextjs";
import { LayoutDashboardIcon, Settings2Icon } from "lucide-react";
import Link from "next/link";
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
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
