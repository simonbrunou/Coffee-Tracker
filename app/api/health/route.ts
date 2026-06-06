// Liveness probe — answers "is the Node process up?" Intentionally does NOT touch
// the DB: a readiness check wired to Coolify's healthcheck would restart-loop on a
// transient blip and turn a 5-second hiccup into a full outage.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
