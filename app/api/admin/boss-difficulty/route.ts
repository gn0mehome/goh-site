import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { BOSSES } from "@wise-old-man/utils";
import { checkPermission } from "@/lib/check-permission";
import { loadBossSettings } from "@/lib/boss-difficulty-server";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - the saved tiers and title names.
export async function GET() {
  const { allowed } = await checkPermission("view_admin");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await loadBossSettings(getServiceClient()));
}

// PUT { tiers: { [metric]: "easy" | "hard" }, names?: { [metric]: string } } -
// save every boss's tier, and the name it goes by in titles (empty = WOM's name).
export async function PUT(request: NextRequest) {
  const { allowed, user } = await checkPermission("manage_competitions");
  if (!allowed) return NextResponse.json({ error: "Changing boss difficulty needs the Manage Competitions permission." }, { status: 403 });
  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const known = new Set<string>(BOSSES);
  const names = (body.names ?? {}) as Record<string, unknown>;
  const rows = Object.entries((body.tiers ?? {}) as Record<string, unknown>)
    .filter(([metric, d]) => known.has(metric) && (d === "easy" || d === "hard"))
    .map(([metric, difficulty]) => ({
      metric,
      difficulty,
      title_name: typeof names[metric] === "string" ? (names[metric] as string).trim().slice(0, 60) || null : null,
      updated_by: user?.discord_username ?? null,
      updated_at: new Date().toISOString(),
    }));
  if (rows.length === 0) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  const { error } = await supabase.from("boss_difficulties").upsert(rows);
  if (error) return NextResponse.json({ error: "Couldn't save the tiers." }, { status: 500 });
  return NextResponse.json({ saved: rows.length });
}
