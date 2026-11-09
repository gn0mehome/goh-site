import { NextRequest, NextResponse } from "next/server";
import { checkPermission } from "@/lib/check-permission";
import {
  BingoError,
  bingoDb,
  consoleState,
  draw,
  endGame,
  endRound,
  getGame,
  openRound,
  reviewClaim,
  setPattern,
  startRound,
  takeControl,
  undoCall,
} from "@/lib/bingo-night/server";

// The host console for one game. GET is polled every ~2s (and keeps the
// host's lock fresh); POST runs one calling action.

async function staff() {
  const { allowed, user } = await checkPermission("host_bingo_night");
  return allowed ? { id: user?.id ?? "dev", name: user?.discord_username || "Staff" } : null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await staff();
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    return NextResponse.json({ ...(await consoleState(bingoDb(), id, me)), me: me.id });
  } catch (err) {
    const status = err instanceof BingoError ? err.status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong." }, { status });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await staff();
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const sb = bingoDb();
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;
  try {
    let result: unknown = { ok: true };
    switch (body.action) {
      case "take_over":
        await takeControl(sb, await getGame(sb, id), me, !!body.force);
        break;
      case "open_round":
        await openRound(sb, id, me, String(body.pattern));
        break;
      case "set_pattern":
        await setPattern(sb, id, me, String(body.pattern));
        break;
      case "start_round":
        await startRound(sb, id, me);
        break;
      case "draw":
        result = await draw(sb, id, me, Number(body.expected));
        break;
      case "undo":
        await undoCall(sb, id, me, Number(body.expected));
        break;
      case "confirm":
      case "reject":
        await reviewClaim(sb, id, me, String(body.claimId), body.action, note);
        break;
      case "end_round":
        await endRound(sb, id, me);
        break;
      case "end_game":
        await endGame(sb, id, me);
        break;
      default:
        throw new BingoError("Unknown action.");
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BingoError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Bingo Night host error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong." }, { status: 500 });
  }
}
