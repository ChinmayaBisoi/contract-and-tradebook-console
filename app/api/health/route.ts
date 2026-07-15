export async function GET() {
  return Response.json(
    { ok: true, service: "contractview" },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
