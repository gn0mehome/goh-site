import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SKILLS, BOSSES, ACTIVITIES, COMPUTED_METRICS } from "@wise-old-man/utils";
import { checkPermission } from "@/lib/check-permission";
import { deleteWomCompetition, editWomCompetition, withCompetitionCode } from "@/lib/wom";

const VALID_METRICS = new Set<string>([...SKILLS, ...BOSSES, ...ACTIVITIES, ...COMPUTED_METRICS]);

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// PUT - edit title/metric/dates, and/or wholesale-replace the participants
// or teams list (only the fields present in the body are changed).
export async function PUT(
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
    .select("wom_id, verification_code, type, group_linked")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Competition not found." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const womPayload: { title?: string; metric?: string; startsAt?: Date; endsAt?: Date; participants?: string[]; teams?: { name: string; participants: string[] }[] } = {};
  const localUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) return NextResponse.json({ error: "Title can't be empty." }, { status: 400 });
    womPayload.title = title;
    localUpdate.title = title;
  }
  if (typeof body.metric === "string") {
    if (!VALID_METRICS.has(body.metric)) return NextResponse.json({ error: "Invalid metric." }, { status: 400 });
    womPayload.metric = body.metric;
    localUpdate.metric = body.metric;
  }
  if (typeof body.startsAt === "string") {
    if (Number.isNaN(Date.parse(body.startsAt))) return NextResponse.json({ error: "Invalid start time." }, { status: 400 });
    womPayload.startsAt = new Date(body.startsAt);
    localUpdate.starts_at = body.startsAt;
  }
  if (typeof body.endsAt === "string") {
    if (Number.isNaN(Date.parse(body.endsAt))) return NextResponse.json({ error: "Invalid end time." }, { status: 400 });
    womPayload.endsAt = new Date(body.endsAt);
    localUpdate.ends_at = body.endsAt;
  }
  if (Array.isArray(body.participants)) {
    const participants: string[] = body.participants.map((p: unknown) => (typeof p === "string" ? p.trim() : "")).filter(Boolean);
    if (participants.length === 0) return NextResponse.json({ error: "Participant list can't be empty." }, { status: 400 });
    womPayload.participants = participants;
    localUpdate.participants = participants;
  }
  if (Array.isArray(body.teams)) {
    const teams = (body.teams as unknown[])
      .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
      .map((t) => ({
        name: typeof t.name === "string" ? t.name.trim() : "",
        participants: Array.isArray(t.participants) ? t.participants.map((p) => (typeof p === "string" ? p.trim() : "")).filter(Boolean) : [],
      }))
      .filter((t) => t.name && t.participants.length > 0);
    if (teams.length < 2) return NextResponse.json({ error: "Need at least two teams, each with a name and at least one participant." }, { status: 400 });
    womPayload.teams = teams;
    localUpdate.teams = teams;
  }

  if (Object.keys(womPayload).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    await withCompetitionCode(row, (code) => editWomCompetition(row.wom_id, womPayload, code));
  } catch (err) {
    console.error("WOM competition edit failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update the competition on WOM." }, { status: 502 });
  }

  const { error } = await supabase.from("wom_competitions").update(localUpdate).eq("id", id);
  if (error) return NextResponse.json({ error: "Updated on WOM, but failed to update the local record." }, { status: 500 });

  return NextResponse.json({ updated: true });
}

// DELETE - remove a competition from WOM and stop tracking it here. `id` is
// this table's own row id, not the WOM competition id.
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
    .select("wom_id, verification_code, group_linked")
    .eq("id", id)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "Competition not found." }, { status: 404 });

  try {
    await withCompetitionCode(row, (code) => deleteWomCompetition(row.wom_id, code));
  } catch (err) {
    console.error("WOM competition deletion failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete the competition on WOM." },
      { status: 502 }
    );
  }

  const { error } = await supabase.from("wom_competitions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Deleted on WOM, but failed to remove the local record." }, { status: 500 });

  return NextResponse.json({ deleted: true });
}
