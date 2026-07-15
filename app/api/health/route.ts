import { withApiLog } from "@/lib/api-log";

export async function GET(req: Request) {
  return withApiLog("/api/health", req, async () =>
    Response.json(
      { ok: true, service: "contractview" },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    ),
  );
}
