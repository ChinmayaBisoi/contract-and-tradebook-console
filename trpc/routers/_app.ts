import { z } from "zod";

import { baseProcedure, createTRPCRouter } from "@/trpc/init";
import { contractRouter } from "@/trpc/routers/contract";
import { invitationRouter } from "@/trpc/routers/invitation";
import { lineItemRouter } from "@/trpc/routers/line-item";
import { organisationRouter } from "@/trpc/routers/organisation";

export const appRouter = createTRPCRouter({
  organisation: organisationRouter,
  invitation: invitationRouter,
  contract: contractRouter,
  lineItem: lineItemRouter,
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
