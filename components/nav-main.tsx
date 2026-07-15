"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export type NavMainItem = {
  title: string;
  icon?: React.ReactNode;
  url?: string;
  onClick?: () => void;
  match?: "exact" | "prefix";
};

function isItemActive(pathname: string, item: NavMainItem) {
  if (!item.url) {
    return false;
  }

  if (item.match === "prefix") {
    return pathname === item.url || pathname.startsWith(`${item.url}/`);
  }

  return pathname === item.url;
}

export function NavMain({
  items,
  title,
}: {
  items: NavMainItem[];
  title?: string;
}) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      {title ? <SidebarGroupLabel>{title}</SidebarGroupLabel> : null}
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              {item.url ? (
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={isItemActive(pathname, item)}
                  render={<Link href={item.url} />}
                >
                  {item.icon}
                  <span>{item.title}</span>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton
                  tooltip={item.title}
                  type="button"
                  onClick={item.onClick}
                >
                  {item.icon}
                  <span>{item.title}</span>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
