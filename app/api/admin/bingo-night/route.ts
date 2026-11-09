import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/check-permission";
import { validateWords, WORD_SETS } from "@/lib/bingo-night/core";
import { BINGO_THEMES } from "@/lib/bingo-night/themes";
import { BingoError, bingoDb, launchGame, type GameRow } from "@/lib/bingo-night/server";

// Bingo Night games: list, save drafts, copy, delete, launch.

async function staff() {
  const { allowed, user } = await checkPermission("host_bingo_night");
  return allowed ? { id: user?.id ?? "dev", name: user?.discord_username || "Staff" } : null;
}

export async function GET() {
  if (!(await staff())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data, error } = await bingoDb().from("bingo_night_games").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ games: data as GameRow[] });
}

/** Reads and checks a game's settings from the editor. */
function readGame(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim().slice(0, 80);
  if (!name) throw new BingoError("Give the game a name.");
  const theme = typeof body.theme === "string" && body.theme in BINGO_THEMES ? body.theme : "gnome";
  const mode = body.card_mode === "words" ? "words" : "numbers";
  let words: string[] | null = null;
  let wordSet: string | null = null;
  if (mode === "words") {
    if (typeof body.word_set === "string" && body.word_set in WORD_SETS) {
      wordSet = body.word_set;
      words = WORD_SETS[wordSet].words;
    } else {
      const res = validateWords(Array.isArray(body.words) ? (body.words as string[]) : String(body.words ?? ""));
      if (!res.ok) throw new BingoError(res.errors.slice(0, 4).join(" "));
      words = res.words;
    }
  }
  const at = typeof body.scheduled_for === "string" && body.scheduled_for ? new Date(body.scheduled_for) : null;
  return {
    name,
    theme,
    card_mode: mode,
    word_set: wordSet,
    words,
    winner_message: String(body.winner_message ?? "").trim().slice(0, 300),
    scheduled_for: at && !Number.isNaN(at.getTime()) ? at.toISOString() : null,
  };
}

// POST { action: "save" (with id to update a draft) | "copy" | "delete" | "launch", ... }
export async function POST(request: NextRequest) {
  const me = await staff();
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const sb = bingoDb();
  try {
    const id = typeof body.id === "string" ? body.id : null;
    if (body.action === "save") {
      const fields = readGame(body);
      if (id) {
        const { data: g } = await sb.from("bingo_night_games").select("status").eq("id", id).maybeSingle();
        if (!g) throw new BingoError("That game doesn't exist.", 404);
        // Once live, only the name, theme, message and date can change (not the cards).
        const patch = g.status === "draft" ? fields : { name: fields.name, theme: fields.theme, winner_message: fields.winner_message, scheduled_for: fields.scheduled_for };
        const { error } = await sb.from("bingo_night_games").update(patch).eq("id", id);
        if (error) throw new Error(error.message);
        return NextResponse.json({ id });
      }
      const { data, error } = await sb.from("bingo_night_games").insert({ ...fields, created_by: me.name }).select("id").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ id: data.id });
    }
    if (!id) throw new BingoError("Pick a game.");
    if (body.action === "copy") {
      const { data: g } = await sb.from("bingo_night_games").select("*").eq("id", id).maybeSingle();
      if (!g) throw new BingoError("That game doesn't exist.", 404);
      const { data, error } = await sb
        .from("bingo_night_games")
        .insert({ name: `${g.name} (copy)`.slice(0, 80), theme: g.theme, card_mode: g.card_mode, word_set: g.word_set, words: g.words, winner_message: g.winner_message, created_by: me.name })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ id: data.id });
    }
    if (body.action === "delete") {
      const { data } = await sb.from("bingo_night_games").delete().eq("id", id).neq("status", "live").select("id");
      if (!data?.length) throw new BingoError("A live game can't be deleted. End it first.", 409);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "launch") {
      await launchGame(sb, id, me);
      return NextResponse.json({ ok: true });
    }
    throw new BingoError("Unknown action.");
  } catch (err) {
    if (err instanceof BingoError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Bingo Night admin error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong." }, { status: 500 });
  }
}
