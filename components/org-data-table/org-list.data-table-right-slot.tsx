"use client";

import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function OrgListDataTableRightSlot() {
  return (
    <Button variant="outline" size="sm">
      <PlusIcon />
      <span className="hidden lg:inline">Add Section</span>
    </Button>
  );
}
