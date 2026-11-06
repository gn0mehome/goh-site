import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkPermission } from "@/lib/check-permission";
import { addWomParticipants, removeWomParticipants, withCompetitionCode } from "@/lib/wom";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function parseRsns(body: unknown): string[] {
  const raw = (body as { participants?: unknown })?.participants;
  return Array.isArray(raw) ? raw.map((p) => (typeof p === "string" ? p.trim() : "")).filter(Boolean) : [];
}

// POST - add participants to an existing (non-team) competition. Works
// whether or not it's group-linked -- WOM accepts the group's verification
// code for this too.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { allowed } = await checkPermission("manage_competitions");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: row } = await supabase
    .from("wom_competitions")
    .select("wom_id, verification_code, type, group_linked, participants")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Competition not found." }, { status: 404 });
  if (row.type === "team") return NextResponse.json({ error: "Team competitions manage participants per-team on WOM directly." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const participants = parseRsns(body);
  if (participants.length === 0) return NextResponse.json({ error: "Provide at least one RSN." }, { status: 400 });

  let result;
  try {
    result = await withCompetitionCode(row, (code) => addWomParticipants(row.wom_id, participants, code));
  } catch (err) {
    console.error("WOM add participants failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to add participants on WOM." }, { status: 502 });
  }

  // Only track a local roster copy for non-group-linked competitions -- for
  // group-linked ones we never had a complete list to begin with.
  if (!row.group_linked) {
    const merged = Array.from(new Set([...(row.participants ?? []), ...participants]));
    await supabase.from("wom_competitions").update({ participants: merged, updated_at: new Date().toISOString() }).eq("id", id);
  }

  return NextResponse.json({ added: result.count, message: result.message });
}

// DELETE - remove participants from an existing (non-team) competition.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { allowed } = await checkPermission("manage_competitions");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: row } = await supabase
    .from("wom_competitions")
    .select("wom_id, verification_code, type, group_linked, participants")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Competition not found." }, { status: 404 });
  if (row.type === "team") return NextResponse.json({ error: "Team competitions manage participants per-team on WOM directly." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const participants = parseRsns(body);
  if (participants.length === 0) return NextResponse.json({ error: "Provide at least one RSN." }, { status: 400 });

  let result;
  try {
    result = await withCompetitionCode(row, (code) => removeWomParticipants(row.wom_id, participants, code));
  } catch (err) {
    console.error("WOM remove participants failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to remove participants on WOM." }, { status: 502 });
  }

  if (!row.group_linked) {
    const lower = new Set(participants.map((p) => p.toLowerCase()));
    const remaining = (row.participants ?? []).filter((p: string) => !lower.has(p.toLowerCase()));
    await supabase.from("wom_competitions").update({ participants: remaining, updated_at: new Date().toISOString() }).eq("id", id);
  }

  return NextResponse.json({ removed: result.count, message: result.message });
}
