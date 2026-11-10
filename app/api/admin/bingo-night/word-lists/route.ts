import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/check-permission";
import { BingoError, bingoDb } from "@/lib/bingo-night/server";
import { deleteWordList, listWordLists, saveWordList } from "@/lib/bingo-night/word-lists";

// Bingo Night word lists: list, create/edit, delete.

async function staff() {
  const { allowed, user } = await checkPermission("host_bingo_night");
  return allowed ? { name: user?.discord_username || "Staff" } : null;
}

export async function GET() {
  if (!(await staff())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ lists: await listWordLists(bingoDb()) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't load the lists." }, { status: err instanceof BingoError ? err.status : 500 });
  }
}

// POST { action: "save", id?, name, words } | { action: "delete", id }
export async function POST(request: NextRequest) {
  const me = await staff();
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  try {
    const sb = bingoDb();
    if (body.action === "save") return NextResponse.json({ id: await saveWordList(sb, body, me.name) });
    if (body.action === "delete" && typeof body.id === "string") {
      await deleteWordList(sb, body.id);
      return NextResponse.json({ ok: true });
    }
    throw new BingoError("Unknown action.");
  } catch (err) {
    if (err instanceof BingoError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Bingo Night word list error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong." }, { status: 500 });
  }
}
