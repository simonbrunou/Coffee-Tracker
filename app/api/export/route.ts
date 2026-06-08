import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { getDataExport } from "@/lib/data-export";

// Self-service data export. Revocation-aware auth (getCurrentUserId); returns the
// CALLER's own data only, as a downloadable JSON attachment. no-store so the file
// (which contains the user's email/PII) isn't cached.
export async function GET() {
  const uid = await getCurrentUserId();
  if (!uid) return new NextResponse("Unauthorized", { status: 401 });
  const data = await getDataExport(uid);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cortado-data.json"',
      "Cache-Control": "no-store",
    },
  });
}
