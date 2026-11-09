import { NextRequest, NextResponse } from "next/server";
import { validateRsn } from "@/lib/bingo-night/core";
import { BingoError, bingoDb, findCard, hashIp, joinGame, swapCard } from "@/lib/bingo-night/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { resolveEffectiveRole } from "@/lib/clan-access";

/** A signed-in clan member gets a small badge on their card; guests play the same without it. */
async function whoIsPlaying(): Promise<{ userId: string | null; member: boolean }> {
  try {
    const auth = await createSupabaseServerClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return { userId: null, member: false };
    const role = await resolveEffectiveRole(bingoDb(), user.id);
    return { userId: user.id, member: role !== "guest" };
  } catch {
    return { userId: null, member: false };
  }
}

// POST { action: "find" | "join" | "swap", playerKey, rsn? }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  try {
    const sb = bingoDb();
    if (body.action === "find") return NextResponse.json({ card: await findCard(sb, body.playerKey) });
    if (body.action === "join") {
      const rsn = validateRsn(typeof body.rsn === "string" ? body.rsn : "");
      if (!rsn.ok) return NextResponse.json({ error: rsn.error }, { status: 400 });
      const who = await whoIsPlaying();
      return NextResponse.json({ card: await joinGame(sb, { playerKey: body.playerKey, rsn: rsn.rsn, ...who, ipHash: hashIp(request.headers) }) });
    }
    if (body.action === "swap") return NextResponse.json({ card: await swapCard(sb, { playerKey: body.playerKey, ipHash: hashIp(request.headers) }) });
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    if (err instanceof BingoError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Bingo Night card error:", err);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
