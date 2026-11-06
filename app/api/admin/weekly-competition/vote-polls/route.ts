import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkPermission } from "@/lib/check-permission";
import { createFromPoll, processWeeklyPolls, type WeeklyVotePoll } from "@/lib/weekly-poll";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - the latest weekly voting polls (newest first) and what happens when one closes.
export async function GET() {
  const { allowed } = await checkPermission("manage_competitions");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const [{ data: polls }, { data: config }] = await Promise.all([
    supabase.from("weekly_vote_polls").select("*").order("created_at", { ascending: false }).limit(8),
    supabase.from("weekly_competition_config").select("poll_auto_create, poll_winner_count, poll_announce").eq("id", 1).maybeSingle(),
  ]);
  return NextResponse.json({ polls: polls ?? [], settings: config ?? { poll_auto_create: true, poll_winner_count: 10, poll_announce: false } });
}

// POST
//   { action: "check" }                    look at closed polls now
//   { action: "pick", id, answerId }       set up a poll's option (a tie, no votes, or auto setup off)
//   { action: "skip", id }                 stop watching a poll
//   { action: "settings", poll_auto_create, poll_winner_count, poll_announce }
export async function POST(request: NextRequest) {
  const { allowed, user } = await checkPermission("manage_competitions");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const body = await request.json().catch(() => ({}));

  if (body.action === "check") return NextResponse.json(await processWeeklyPolls(supabase));

  if (body.action === "pick" || body.action === "skip") {
    const { data } = await supabase.from("weekly_vote_polls").select("*").eq("id", String(body.id ?? "")).maybeSingle();
    const poll = data as WeeklyVotePoll | null;
    if (!poll) return NextResponse.json({ error: "Poll not found." }, { status: 404 });
    if (poll.status === "created") return NextResponse.json({ error: "This poll's competition is already set up." }, { status: 400 });
    if (body.action === "pick" && poll.status === "open") return NextResponse.json({ error: "This poll is still open." }, { status: 400 });
    if (body.action === "skip") {
      await supabase.from("weekly_vote_polls").update({ status: "skipped", note: "Skipped by staff.", processed_at: new Date().toISOString() }).eq("id", poll.id);
      return NextResponse.json({ skipped: true });
    }
    try {
      return NextResponse.json(await createFromPoll(supabase, poll, Number(body.answerId), user?.discord_username ?? "staff"));
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
  }

  if (body.action === "settings") {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ("poll_auto_create" in body) update.poll_auto_create = !!body.poll_auto_create;
    if ("poll_announce" in body) update.poll_announce = !!body.poll_announce;
    if ("poll_winner_count" in body) update.poll_winner_count = Math.max(0, Math.min(20, Math.floor(Number(body.poll_winner_count) || 0)));
    const { error } = await supabase.from("weekly_competition_config").update(update).eq("id", 1);
    if (error) return NextResponse.json({ error: "Couldn't save the settings." }, { status: 500 });
    return NextResponse.json({ saved: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
