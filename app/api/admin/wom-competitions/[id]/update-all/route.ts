import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkPermission } from "@/lib/check-permission";
import { updateAllWomParticipants, withCompetitionCode } from "@/lib/wom";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// POST - queue a refresh for any outdated participants' hiscores data.
// Doesn't change who's participating, just refreshes stale stats.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { allowed } = await checkPermission("manage_competitions");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: row } = await supabase
    .from("wom_competitions")
    .select("wom_id, verification_code, group_linked")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Competition not found." }, { status: 404 });

  try {
    const result = await withCompetitionCode(row, (code) => updateAllWomParticipants(row.wom_id, code));
    return NextResponse.json({ message: result.message });
  } catch (err) {
    console.error("WOM update-all failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to queue an update on WOM." }, { status: 502 });
  }
}
