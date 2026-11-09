import { NextResponse, after } from "next/server";
import { bingoServiceClient, findTeamFor, getBingoViewer, loadBingoBundle } from "@/lib/bingo-server";
import { syncEventAutoTiles } from "@/lib/bingo-sync";
import { computeStandings } from "@/lib/bingo";

const STALE_MINUTES = 15;

// GET - one board for the member page: event, teams, tiles, progress,
// standings, the activity feed, and the viewer's own team, sign-up and
// submissions. Drafts are only visible to staff (as a preview); during
// sign-ups the tiles stay hidden until the board goes live. With "hide
// other teams" on, members only get their own team's progress until the
// event finishes.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = bingoServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const [bundle, viewer] = await Promise.all([loadBingoBundle(supabase, id), getBingoViewer(supabase)]);
  if (!bundle || (bundle.event.status === "draft" && !viewer.isStaff)) {
    return NextResponse.json({ error: "Clan Bingo event not found." }, { status: 404 });
  }
  const { event, teams, tiles, progress } = bundle;

  const mine = findTeamFor(teams, viewer.rsns);
  const fog = event.hide_other_teams && event.status === "active" && !viewer.isStaff;
  const notStarted = !!event.starts_at && Date.parse(event.starts_at) > Date.now();
  const boardHidden = (event.status === "signups" || (event.status === "active" && notStarted)) && !viewer.isStaff;
  const visibleProgress = fog ? progress.filter((p) => p.team_id === mine?.teamId) : progress;

  const [{ data: activity }, { data: submissions }, { data: signup }, { count: signupCount }] = await Promise.all([
    supabase.from("bingo_activity").select("id, team_id, tile_id, kind, rsn, points, message, created_at").eq("event_id", id).order("created_at", { ascending: false }).limit(60),
    mine
      ? supabase
          .from("bingo_submissions")
          .select("id, tile_id, team_id, submitter_rsn, source, image_urls, quantity, note, status, reviewed_by, reviewed_at, review_note, created_at")
          .eq("event_id", id)
          .eq("team_id", mine.teamId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    viewer.userId ? supabase.from("bingo_signups").select("rsn").eq("event_id", id).eq("user_id", viewer.userId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("bingo_signups").select("*", { count: "exact", head: true }).eq("event_id", id),
  ]);

  // Refresh auto-tracked tiles in the background when they're getting old.
  if (event.status === "active" && tiles.some((t) => t.kind === "auto")) {
    const stale = !event.last_synced_at || Date.now() - Date.parse(event.last_synced_at) > STALE_MINUTES * 60_000;
    if (stale) after(() => syncEventAutoTiles(supabase, id, { minAgeMinutes: STALE_MINUTES }).then(() => undefined).catch(() => undefined));
  }

  const standings = computeStandings(event, tiles, teams.map((t) => t.id), progress);
  const now = Date.now();
  const live = event.status === "active" && (!event.ends_at || Date.parse(event.ends_at) > now) && (!event.starts_at || Date.parse(event.starts_at) <= now);

  return NextResponse.json({
    event,
    teams,
    tiles: boardHidden ? [] : tiles,
    tileCount: tiles.length,
    boardHidden,
    fog,
    progress: visibleProgress,
    standings,
    activity: (activity ?? []).filter((a) => !fog || a.team_id === mine?.teamId || a.kind === "blackout"),
    submissions: submissions ?? [],
    signupCount: signupCount ?? 0,
    viewer: {
      signedIn: !!viewer.userId,
      rsn: mine?.rsn ?? viewer.mainRsn,
      verified: viewer.verified,
      teamId: mine?.teamId ?? null,
      isCaptain: mine?.isCaptain ?? false,
      signedUp: !!signup,
      isStaff: viewer.isStaff,
      canSubmit: !!mine && live,
    },
  });
}
