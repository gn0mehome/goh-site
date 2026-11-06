import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkPermission } from "@/lib/check-permission";
import { loadCompetitionResults, syncCompetitionResults } from "@/lib/competition-insights";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - every stored competition and who gained in it (the dashboard does the maths).
export async function GET() {
  const { allowed } = await checkPermission("manage_competitions");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  return NextResponse.json(await loadCompetitionResults(supabase));
}

// POST - pull a few more competitions from Wise Old Man. The page calls this
// until `pending` reaches 0.
export async function POST() {
  const { allowed } = await checkPermission("manage_competitions");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const result = await syncCompetitionResults(supabase);
  return NextResponse.json(result, { status: result.error && result.synced === 0 ? 502 : 200 });
}
