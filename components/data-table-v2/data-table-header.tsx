"use client";

import type { ReactNode } from "react";

export function DataTableHeader({
  leftSlot,
  rightSlot,
}: {
  leftSlot: ReactNode;
  rightSlot: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      {leftSlot}
      {rightSlot}
    </div>
  );
}
