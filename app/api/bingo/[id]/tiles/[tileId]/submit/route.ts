import { NextRequest, NextResponse } from "next/server";
import { bingoServiceClient, createSubmission, findTeamFor, getBingoViewer, loadBingoBundle } from "@/lib/bingo-server";

// POST - a team member sends screenshots for a proof tile. Their team is
// worked out here from their own linked RSNs, never taken from the request.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; tileId: string }> }) {
  const { id, tileId } = await params;
  const supabase = bingoServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const viewer = await getBingoViewer(supabase);
  if (!viewer.userId) return NextResponse.json({ error: "Sign in to submit proof." }, { status: 401 });

  const bundle = await loadBingoBundle(supabase, id);
  if (!bundle || bundle.event.status === "draft") return NextResponse.json({ error: "Clan Bingo event not found." }, { status: 404 });
  const mine = findTeamFor(bundle.teams, viewer.rsns);
  if (!mine) return NextResponse.json({ error: "You aren't on a team for this bingo. Ask staff if that's a mistake." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const result = await createSubmission(supabase, bundle, {
    tileId,
    teamId: mine.teamId,
    rsn: mine.rsn,
    userId: viewer.userId,
    source: "web",
    imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls : [],
    quantity: body.quantity,
    note: typeof body.note === "string" ? body.note : null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ submitted: true, id: result.id });
}
