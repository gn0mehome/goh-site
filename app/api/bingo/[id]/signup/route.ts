import { NextRequest, NextResponse } from "next/server";
import { bingoServiceClient, getBingoViewer } from "@/lib/bingo-server";

async function context(id: string) {
  const supabase = bingoServiceClient();
  if (!supabase) return { error: NextResponse.json({ error: "Supabase not configured" }, { status: 503 }) };
  const viewer = await getBingoViewer(supabase);
  if (!viewer.userId) return { error: NextResponse.json({ error: "Sign in to join." }, { status: 401 }) };
  const { data: event } = await supabase.from("bingo_events").select("id, status").eq("id", id).maybeSingle();
  if (!event || event.status === "draft") return { error: NextResponse.json({ error: "Clan Bingo event not found." }, { status: 404 }) };
  if (event.status !== "signups") return { error: NextResponse.json({ error: "Sign-ups for this bingo are closed." }, { status: 400 }) };
  return { supabase, viewer };
}

// POST - join a bingo during sign-ups, as the member's main RSN.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await context(id);
  if ("error" in ctx) return ctx.error;
  const { supabase, viewer } = ctx;
  if (!viewer.mainRsn || !viewer.verified) {
    return NextResponse.json({ error: "Link and verify your RSN on your Account page first, so staff can put you on a team." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) || null : null;
  const { error } = await supabase
    .from("bingo_signups")
    .upsert({ event_id: id, user_id: viewer.userId, rsn: viewer.mainRsn, note }, { onConflict: "event_id,user_id" });
  if (error) return NextResponse.json({ error: "Couldn't sign you up." }, { status: 500 });
  return NextResponse.json({ signedUp: true });
}

// DELETE - leave during sign-ups.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await context(id);
  if ("error" in ctx) return ctx.error;
  await ctx.supabase.from("bingo_signups").delete().eq("event_id", id).eq("user_id", ctx.viewer.userId);
  return NextResponse.json({ signedUp: false });
}
