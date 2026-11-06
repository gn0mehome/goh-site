import { NextRequest, NextResponse } from "next/server";
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
  const { allowed } = await checkPermission("view_admin");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const { allowed: canEdit } = await checkPermission("manage_competitions");
  return NextResponse.json({ ...(await loadCompetitionResults(supabase)), canEdit });
}

// PATCH { wom_id, difficulty } - override a boss week's difficulty ("easy" |
// "medium" | "hard", or null to go back to the boss's built-in tier).
export async function PATCH(request: NextRequest) {
  const { allowed } = await checkPermission("manage_competitions");
  if (!allowed) return NextResponse.json({ error: "Changing difficulty needs the Manage Competitions permission." }, { status: 403 });
  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const womId = Number(body.wom_id);
  const difficulty = body.difficulty === null ? null : ["easy", "medium", "hard"].includes(body.difficulty) ? body.difficulty : undefined;
  if (!Number.isInteger(womId) || difficulty === undefined) return NextResponse.json({ error: "Pick Easy, Medium or Hard." }, { status: 400 });
  const { error } = await supabase.from("competition_results").update({ difficulty }).eq("wom_id", womId);
  if (error) return NextResponse.json({ error: "Couldn't save the difficulty." }, { status: 500 });
  return NextResponse.json({ saved: true });
}

// POST - pull a few more competitions from Wise Old Man. The page calls this
// until `pending` reaches 0.
export async function POST() {
  const { allowed } = await checkPermission("view_admin");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const result = await syncCompetitionResults(supabase);
  return NextResponse.json(result, { status: result.error && result.synced === 0 ? 502 : 200 });
}
