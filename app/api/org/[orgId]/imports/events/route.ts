import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";

import { checkOrgPermission, createOrganisationMembershipFinder } from "@/lib/organisation-access";
import { prisma } from "@/lib/prisma";
import { subscribeToTradebookEvents } from "@/lib/tradebook/events";

function encodeSseMessage(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      orgId: string;
    }>;
  },
) {
  const session = await auth();
  if (!session.userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const params = await context.params;
  await checkOrgPermission({
    clerkUserId: session.userId,
    organisationId: params.orgId,
    action: "import:read",
    findMembership: createOrganisationMembershipFinder(prisma),
  });

  const importId = request.nextUrl.searchParams.get("importId") ?? undefined;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(new TextEncoder().encode(encodeSseMessage(event, data)));
      };

      send("ready", { organisationId: params.orgId, importId: importId ?? null });

      const unsubscribe = subscribeToTradebookEvents(
        {
          organisationId: params.orgId,
          importId,
        },
        (event) => {
          send(event.type, event);
        },
      );

      const heartbeat = setInterval(() => {
        controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));
      }, 15000);

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
