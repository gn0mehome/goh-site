import { NextResponse } from "next/server";
import { BingoError, bingoDb, publicState } from "@/lib/bingo-night/server";

// GET -- the live game, round and calls: the same for every player and the
// stream view, so it's cached at the edge for a second (pages poll every ~2s).
export async function GET() {
  try {
    const state = await publicState(bingoDb());
    return NextResponse.json(state, { headers: { "Cache-Control": "public, s-maxage=1, stale-while-revalidate=1" } });
  } catch (err) {
    const status = err instanceof BingoError ? err.status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong." }, { status });
  }
}
