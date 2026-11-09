import { NextRequest, NextResponse } from "next/server";
import { BingoError, bingoDb, claimBingo } from "@/lib/bingo-night/server";

// POST { playerKey } -- a BINGO press, checked against the calls.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  try {
    return NextResponse.json(await claimBingo(bingoDb(), body.playerKey));
  } catch (err) {
    if (err instanceof BingoError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Bingo Night claim error:", err);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
