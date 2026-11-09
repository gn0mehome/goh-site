import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/check-permission";
import { announceResults, bingoServiceClient, launchProblems, loadBingoBundle } from "@/lib/bingo-server";
import { computeStandings, GRID_SIZES, type BingoEventStatus } from "@/lib/bingo";
import { normalizeRsn } from "@/lib/wom";
import type { BingoBundle } from "@/lib/bingo-server";

const STATUSES: BingoEventStatus[] = ["draft", "signups", "active", "completed"];

async function guard() {
  const { allowed, user } = await checkPermission("manage_bingo");
  if (!allowed) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const supabase = bingoServiceClient();
  if (!supabase) return { error: NextResponse.json({ error: "Supabase not configured" }, { status: 503 }) };
  return { supabase, user };
}

// GET - the whole board for the builder: event, tiles, teams, sign-ups,
// standings and what's left before it can go live.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await guard();
  if ("error" in ctx) return ctx.error;
  const { supabase } = ctx;

  const bundle = await loadBingoBundle(supabase, id);
  if (!bundle) return NextResponse.json({ error: "Clan Bingo event not found." }, { status: 404 });

  const { data: signups } = await supabase.from("bingo_signups").select("user_id, rsn, note, created_at").eq("event_id", id).order("created_at");
  const onTeam = new Set(bundle.teams.flatMap((t) => t.members.map((m) => normalizeRsn(m.rsn))));
  const { count: pendingCount } = await supabase.from("bingo_submissions").select("*", { count: "exact", head: true }).eq("event_id", id).eq("status", "pending");

  return NextResponse.json({
    ...bundle,
    standings: computeStandings(bundle.event, bundle.tiles, bundle.teams.map((t) => t.id), bundle.progress),
    signups: (signups ?? []).map((s) => ({ rsn: s.rsn, note: s.note, created_at: s.created_at, onTeam: onTeam.has(normalizeRsn(s.rsn)) })),
    pendingCount: pendingCount ?? 0,
    launchProblems: launchProblems(bundle),
  });
}

// PATCH - change the board's settings or status. Going live checks the
// board is complete first. Changing the size of a draft keeps each tile in
// the same row and column, dropping any that no longer fit.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await guard();
  if ("error" in ctx) return ctx.error;
  const { supabase } = ctx;

  const bundle = await loadBingoBundle(supabase, id);
  if (!bundle) return NextResponse.json({ error: "Clan Bingo event not found." }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  const text = (key: string, max: number) => {
    if (key in body) update[key] = typeof body[key] === "string" ? body[key].trim().slice(0, max) || null : null;
  };
  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
    if (!name) return NextResponse.json({ error: "The bingo needs a name." }, { status: 400 });
    update.name = name;
  }
  text("description", 2000);
  text("rules", 4000);
  text("banner_url", 1000);
  for (const key of ["starts_at", "ends_at"]) {
    if (key in body) {
      const v = body[key];
      if (v !== null && (typeof v !== "string" || Number.isNaN(Date.parse(v)))) return NextResponse.json({ error: "That date isn't valid." }, { status: 400 });
      update[key] = v;
    }
  }
  if ("win_rule" in body) update.win_rule = body.win_rule === "blackout" ? "blackout" : "points";
  for (const key of ["line_bonus", "blackout_bonus"]) {
    if (key in body) update[key] = Math.max(0, Math.min(1000, Math.floor(Number(body[key]) || 0)));
  }
  if ("hide_other_teams" in body) update.hide_other_teams = !!body.hide_other_teams;
  if ("feed_mode" in body) update.feed_mode = ["off", "review", "approve"].includes(body.feed_mode) ? body.feed_mode : "approve";

  if ("grid_size" in body && body.grid_size !== bundle.event.grid_size) {
    if (!(GRID_SIZES as readonly number[]).includes(body.grid_size)) return NextResponse.json({ error: "Pick a board size from 3×3 to 7×7." }, { status: 400 });
    if (bundle.event.status !== "draft") return NextResponse.json({ error: "The board size can only change while it's a draft." }, { status: 400 });
    const oldN = bundle.event.grid_size;
    const newN = body.grid_size as number;
    // Delete the tiles that fall off, then move the rest in two passes
    // (offset first) so no two tiles ever share a position mid-update.
    const keep = bundle.tiles.filter((t) => t.position % oldN < newN && Math.floor(t.position / oldN) < newN);
    const drop = bundle.tiles.filter((t) => !keep.includes(t));
    if (drop.length) await supabase.from("bingo_tiles").delete().in("id", drop.map((t) => t.id));
    for (const t of keep) await supabase.from("bingo_tiles").update({ position: t.position + 1000 }).eq("id", t.id);
    for (const t of keep) {
      const r = Math.floor(t.position / oldN);
      const c = t.position % oldN;
      await supabase.from("bingo_tiles").update({ position: r * newN + c }).eq("id", t.id);
    }
    update.grid_size = newN;
  }

  if ("status" in body) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    if (body.status === "active" && bundle.event.status !== "active") {
      const merged = { ...bundle, event: { ...bundle.event, ...update } } as BingoBundle;
      const problems = launchProblems(merged);
      if (problems.length) return NextResponse.json({ error: "This board isn't ready to go live yet.", problems }, { status: 400 });
    }
    update.status = body.status;
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ saved: true });
  update.updated_at = new Date().toISOString();
  const { error } = await supabase.from("bingo_events").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: "Couldn't save the bingo." }, { status: 500 });
  if (update.status === "completed" && bundle.event.status === "active") await announceResults(supabase, bundle);
  return NextResponse.json({ saved: true });
}

// DELETE - remove a board and everything on it.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await guard();
  if ("error" in ctx) return ctx.error;
  const { error } = await ctx.supabase.from("bingo_events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Couldn't delete the bingo." }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
