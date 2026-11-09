import { NextRequest, NextResponse } from "next/server";
import { MetricProps } from "@wise-old-man/utils";
import { checkPermission } from "@/lib/check-permission";
import { bingoServiceClient, recomputeProofTile, loadBingoBundle, TILE_COLUMNS } from "@/lib/bingo-server";

async function guard(id: string) {
  const { allowed } = await checkPermission("manage_bingo");
  if (!allowed) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const supabase = bingoServiceClient();
  if (!supabase) return { error: NextResponse.json({ error: "Supabase not configured" }, { status: 503 }) };
  const { data: event } = await supabase.from("bingo_events").select("id, grid_size, status").eq("id", id).maybeSingle();
  if (!event) return { error: NextResponse.json({ error: "Clan Bingo event not found." }, { status: 404 }) };
  return { supabase, event };
}

/** Cleans a tile from the builder, or explains what's wrong with it. */
function parseTile(raw: Record<string, unknown>): { tile: Record<string, unknown> } | { error: string } {
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 80) : "";
  if (!title) return { error: "The tile needs a name." };
  const kind = raw.kind === "auto" ? "auto" : "proof";
  const iconKind = raw.icon_kind === "item" || raw.icon_kind === "metric" ? raw.icon_kind : "none";
  const tile: Record<string, unknown> = {
    title,
    description: typeof raw.description === "string" ? raw.description.trim().slice(0, 600) || null : null,
    points: Math.max(0, Math.min(100, Math.floor(Number(raw.points) || 0))),
    icon_kind: iconKind,
    icon_ref: iconKind === "none" ? null : typeof raw.icon_ref === "string" ? raw.icon_ref.slice(0, 120) : null,
    icon_item_id: iconKind === "item" && Number.isInteger(raw.icon_item_id) ? raw.icon_item_id : null,
    kind,
    required_count: 1,
    accepted_items: [],
    metric: null,
    target: null,
    auto_mode: "team_total",
    updated_at: new Date().toISOString(),
  };
  if (tile.icon_kind !== "none" && !tile.icon_ref) tile.icon_kind = "none";
  if (kind === "proof") {
    tile.required_count = Math.max(1, Math.min(1000, Math.floor(Number(raw.required_count) || 1)));
    tile.accepted_items = Array.isArray(raw.accepted_items)
      ? [...new Set(raw.accepted_items.filter((s): s is string => typeof s === "string").map((s) => s.trim().slice(0, 80)).filter(Boolean))].slice(0, 40)
      : [];
  } else {
    const metric = typeof raw.metric === "string" ? raw.metric : "";
    if (!(metric in MetricProps) || metric === "overall") return { error: "Pick the skill, boss or activity to track." };
    const target = Number(raw.target);
    if (!Number.isFinite(target) || target <= 0) return { error: "Set how much needs to be gained." };
    tile.metric = metric;
    tile.target = target;
    tile.auto_mode = raw.auto_mode === "single_player" ? "single_player" : "team_total";
  }
  return { tile };
}

// PUT - save one square (create or replace the tile at `position`).
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await guard(id);
  if ("error" in ctx) return ctx.error;
  const { supabase, event } = ctx;
  const body = await request.json().catch(() => ({}));
  const position = Number(body.position);
  if (!Number.isInteger(position) || position < 0 || position >= event.grid_size * event.grid_size) {
    return NextResponse.json({ error: "That square isn't on the board." }, { status: 400 });
  }
  const parsed = parseTile(body.tile ?? {});
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await supabase
    .from("bingo_tiles")
    .upsert({ ...parsed.tile, event_id: id, position }, { onConflict: "event_id,position" })
    .select(TILE_COLUMNS)
    .single();
  if (error || !data) return NextResponse.json({ error: "Couldn't save the tile." }, { status: 500 });

  // On a live board a changed goal can finish (or un-finish) a proof tile.
  if (event.status === "active" && data.kind === "proof") {
    const bundle = await loadBingoBundle(supabase, id);
    const tile = bundle?.tiles.find((t) => t.id === data.id);
    if (bundle && tile) for (const team of bundle.teams) await recomputeProofTile(supabase, bundle, tile, team.id);
  }
  return NextResponse.json({ tile: data });
}

// DELETE ?position=N - clear one square.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await guard(id);
  if ("error" in ctx) return ctx.error;
  const position = Number(request.nextUrl.searchParams.get("position"));
  if (!Number.isInteger(position)) return NextResponse.json({ error: "Which square?" }, { status: 400 });
  await ctx.supabase.from("bingo_tiles").delete().eq("event_id", id).eq("position", position);
  return NextResponse.json({ deleted: true });
}

// POST - board-wide changes:
//   { action: "arrange", order: (tileId | null)[] }  new position for every tile (drag, swap, shuffle)
//   { action: "fill", tiles: [...] }                 put tiles into empty squares in order (paste a list)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await guard(id);
  if ("error" in ctx) return ctx.error;
  const { supabase, event } = ctx;
  const body = await request.json().catch(() => ({}));
  const squares = event.grid_size * event.grid_size;
  const { data: existing } = await supabase.from("bingo_tiles").select("id, position").eq("event_id", id);
  const tiles = existing ?? [];

  if (body.action === "arrange") {
    const order: (string | null)[] = Array.isArray(body.order) ? body.order.slice(0, squares) : [];
    const ids = order.filter((x): x is string => typeof x === "string");
    if (new Set(ids).size !== ids.length || ids.length !== tiles.length || !ids.every((tid) => tiles.some((t) => t.id === tid))) {
      return NextResponse.json({ error: "The new layout doesn't match the board. Reload and try again." }, { status: 400 });
    }
    // Two passes so positions never collide mid-update.
    for (const t of tiles) await supabase.from("bingo_tiles").update({ position: t.position + 1000 }).eq("id", t.id);
    for (let pos = 0; pos < order.length; pos++) {
      const tid = order[pos];
      if (tid) await supabase.from("bingo_tiles").update({ position: pos }).eq("id", tid);
    }
    return NextResponse.json({ arranged: true });
  }

  if (body.action === "fill") {
    const taken = new Set(tiles.map((t) => t.position));
    const free = Array.from({ length: squares }, (_, p) => p).filter((p) => !taken.has(p));
    const incoming: Record<string, unknown>[] = Array.isArray(body.tiles) ? body.tiles : [];
    const rows: Record<string, unknown>[] = [];
    const skipped: string[] = [];
    for (const raw of incoming) {
      if (rows.length >= free.length) break;
      const parsed = parseTile(raw ?? {});
      if ("error" in parsed) {
        skipped.push(`${typeof raw?.title === "string" ? raw.title : "A line"}: ${parsed.error}`);
        continue;
      }
      rows.push({ ...parsed.tile, event_id: id, position: free[rows.length] });
    }
    if (rows.length) {
      const { error } = await supabase.from("bingo_tiles").insert(rows);
      if (error) return NextResponse.json({ error: "Couldn't add those tiles." }, { status: 500 });
    }
    return NextResponse.json({ added: rows.length, skipped, full: incoming.length > free.length });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
