import { z } from "zod";

import { baseProcedure, createTRPCRouter } from "@/trpc/init";
import { organisationRouter } from "@/trpc/routers/organisation";

export const appRouter = createTRPCRouter({
  organisation: organisationRouter,
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
