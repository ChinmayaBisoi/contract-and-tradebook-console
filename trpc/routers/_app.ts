import { z } from "zod";

import { baseProcedure, createTRPCRouter } from "@/trpc/init";
import { auditRouter } from "@/trpc/routers/audit";
import { contractRouter } from "@/trpc/routers/contract";
import { invitationRouter } from "@/trpc/routers/invitation";
import { lineItemRouter } from "@/trpc/routers/line-item";
import { organisationRouter } from "@/trpc/routers/organisation";
import { tradebookImportRouter } from "@/trpc/routers/tradebook-import";

export const appRouter = createTRPCRouter({
  organisation: organisationRouter,
  invitation: invitationRouter,
  contract: contractRouter,
  lineItem: lineItemRouter,
  audit: auditRouter,
  tradebookImport: tradebookImportRouter,
  hello: baseProcedure
    .input(
      z.object({
        text: z.string().min(1),
      }),
    )
    .query(({ input }) => {
      return {
        greeting: `hello ${input.text}`,
      };
    }),
});

export type AppRouter = typeof appRouter;
