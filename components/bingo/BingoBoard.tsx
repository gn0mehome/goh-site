"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  boardLines,
  maxScore,
  STATUS_LABELS,
  type BingoActivity,
  type BingoEvent,
  type BingoProgress,
  type BingoSubmission,
  type BingoTeam,
  type BingoTile,
  type TeamScore,
} from "@/lib/bingo";
import { TileFace, type TileState } from "./TileFace";
import { TileDrawer } from "./TileDrawer";
import { Countdown, useNow } from "./Countdown";
import { Confetti } from "./Confetti";

interface BoardData {
  event: BingoEvent;
  teams: BingoTeam[];
  tiles: BingoTile[];
  tileCount: number;
  boardHidden: boolean;
  fog: boolean;
  progress: BingoProgress[];
  standings: TeamScore[];
  activity: BingoActivity[];
  submissions: BingoSubmission[];
  signupCount: number;
  viewer: { signedIn: boolean; rsn: string | null; verified: boolean; teamId: string | null; isCaptain: boolean; signedUp: boolean; isStaff: boolean; canSubmit: boolean };
}

type Tab = "board" | "standings" | "teams" | "activity" | "rules";

function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Small white glyph for each kind of activity, drawn inside the team-coloured circle. */
function ActivityGlyph({ kind }: { kind: BingoActivity["kind"] }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" aria-hidden {...common}>
      {kind === "tile" && <path d="M3.5 8.5l3 3 6-7" />}
      {kind === "line" && <path d="M8 2.5l1.7 3.6 3.8.5-2.8 2.6.7 3.8L8 11.2l-3.4 1.8.7-3.8-2.8-2.6 3.8-.5z" strokeWidth={1.6} />}
      {kind === "blackout" && <path d="M5 3h6v3a3 3 0 01-6 0zM8 9v3M5.5 13h5M5 4H3v1a2 2 0 002 2M11 4h2v1a2 2 0 01-2 2" strokeWidth={1.6} />}
      {kind === "submitted" && (
        <>
          <rect x="2.5" y="4.5" width="11" height="8" rx="1.5" strokeWidth={1.6} />
          <circle cx="8" cy="8.5" r="2" strokeWidth={1.6} />
        </>
      )}
      {kind === "rejected" && <path d="M6 4L3 7l3 3M3 7h6.5a3.5 3.5 0 010 7H8" strokeWidth={1.8} />}
    </svg>
  );
}

/**
 * One entry in the activity feed: who (bold, with the points it earned),
 * what they did on its own line, then the team and how long ago. Built from
 * the entry's fields rather than its stored sentence so every row lines up.
 */
function ActivityRow({ a, teams, tiles, compact = false }: { a: BingoActivity; teams: BingoTeam[]; tiles: BingoTile[]; compact?: boolean }) {
  const team = teams.find((t) => t.id === a.team_id);
  const tile = tiles.find((t) => t.id === a.tile_id);
  const tileName = tile?.title ?? "a tile";
  const teamName = team?.name ?? "";
  const who = (a.kind === "line" || a.kind === "blackout" ? teamName : a.rsn) || teamName || "Someone";
  const lineText = teamName && a.message.startsWith(teamName) ? a.message.slice(teamName.length).trim() : a.message;
  const action = {
    tile: `Completed ${tileName}`,
    line: lineText.charAt(0).toUpperCase() + lineText.slice(1),
    blackout: "Finished the whole board!",
    submitted: `Sent proof for ${tileName}`,
    rejected: `Proof sent back for ${tileName}`,
  }[a.kind];
  const muted = a.kind === "submitted" || a.kind === "rejected";
  return (
    <li className={`flex items-start gap-2.5 ${compact ? "py-2" : "py-3"}`}>
      <span
        className={`mt-0.5 shrink-0 rounded-full flex items-center justify-center text-white ${compact ? "w-6 h-6" : "w-7 h-7"} ${muted ? "opacity-70" : ""}`}
        style={{ background: a.kind === "rejected" ? "var(--color-red-accent)" : team?.color ?? "var(--color-gnome-green)" }}
      >
        <ActivityGlyph kind={a.kind} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={`font-semibold text-bark-brown truncate ${compact ? "text-[13px]" : "text-sm"}`}>{who}</p>
          {a.points > 0 && (
            <span className="shrink-0 rounded-full bg-gnome-green/15 px-1.5 py-px text-[11px] font-semibold text-gnome-green tabular-nums">+{a.points}</span>
          )}
        </div>
        <p className={`text-bark-brown-light leading-snug ${compact ? "text-xs line-clamp-2" : "text-sm"}`}>{action}</p>
        <p className="text-[11px] text-iron-grey mt-0.5">
          {who !== teamName && teamName ? `${teamName} · ` : ""}
          {ago(a.created_at)} ago
        </p>
      </div>
    </li>
  );
}

/** Read-only miniature of a team's board, for the All teams tab. */
function MiniBoard({ tiles, gridSize, done }: { tiles: BingoTile[]; gridSize: number; done: Set<string> }) {
  const byPos = new Map(tiles.map((t) => [t.position, t]));
  return (
    <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}>
      {Array.from({ length: gridSize * gridSize }, (_, p) => {
        const t = byPos.get(p);
        const isDone = !!t && done.has(t.id);
        return <div key={p} title={t ? `${t.title}${isDone ? " ✓" : ""}` : undefined} className={`aspect-square rounded-sm ${isDone ? "bg-gnome-green" : "bg-bark-brown-light/20"}`} />;
      })}
    </div>
  );
}

async function fetchBoard(eventId: string): Promise<BoardData | null> {
  const res = await fetch(`/api/bingo/${eventId}`);
  return res.ok ? res.json() : null;
}

export function BingoBoard({ eventId }: { eventId: string }) {
  const [data, setData] = useState<BoardData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("board");
  const [openTile, setOpenTile] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const now = useNow();

  const apply = useCallback(
    (json: BoardData | null) => {
      if (!json) return setNotFound(true);
      setData(json);
      setTeamId((prev) => prev ?? json.viewer.teamId ?? json.standings[0]?.teamId ?? json.teams[0]?.id ?? null);
      // Celebrate new lines or a blackout for the viewer's team since they last looked.
      const mine = json.standings.find((s) => s.teamId === json.viewer.teamId);
      if (!mine) return;
      const key = `bingo-celebrated:${eventId}`;
      const score = mine.lines.length + (mine.blackout ? 100 : 0);
      try {
        const seen = Number(localStorage.getItem(key) ?? "-1");
        if (seen >= 0 && score > seen) setConfetti((c) => c + 1);
        localStorage.setItem(key, String(score));
      } catch {
        // Storage blocked; skip the celebration.
      }
    },
    [eventId]
  );
  const load = useCallback(async () => apply(await fetchBoard(eventId)), [eventId, apply]);

  useEffect(() => {
    let cancelled = false;
    fetchBoard(eventId).then((json) => !cancelled && apply(json));
    // Keep a live board fresh while it's open.
    const t = setInterval(() => document.visibilityState === "visible" && fetchBoard(eventId).then((json) => !cancelled && apply(json)), 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [eventId, apply]);

  const myScore = data?.standings.find((s) => s.teamId === data.viewer.teamId);

  const doneByTeam = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const p of data?.progress ?? []) {
      if (!p.completed_at) continue;
      if (!map.has(p.team_id)) map.set(p.team_id, new Set());
      map.get(p.team_id)!.add(p.tile_id);
    }
    return map;
  }, [data?.progress]);

  if (notFound) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-3">
        <p className="text-bark-brown">This bingo isn&apos;t available.</p>
        <Link href="/bingo" className="text-gnome-green hover:underline">
          See all clan bingos
        </Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-parchment-dark border-t-gnome-green rounded-full animate-spin" />
      </div>
    );
  }

  const { event, teams, tiles, viewer, standings } = data;
  const n = event.grid_size;
  const team = teams.find((t) => t.id === teamId) ?? null;
  const isMine = !!team && team.id === viewer.teamId;
  const teamScore = standings.find((s) => s.teamId === teamId);
  const rank = standings.findIndex((s) => s.teamId === teamId) + 1;
  const lineSet = new Set((teamScore?.lines ?? []).flatMap((key) => boardLines(n).find((l) => l.key === key)?.positions ?? []));
  const byPos = new Map(tiles.map((t) => [t.position, t]));
  const progressFor = (tileId: string, tid: string | null) => data.progress.find((p) => p.tile_id === tileId && p.team_id === tid);
  const fogged = data.fog && !isMine;
  const startsLater = !!event.starts_at && Date.parse(event.starts_at) > now;

  const stateOf = (tile: BingoTile): TileState => {
    const p = progressFor(tile.id, teamId);
    if (p?.completed_at) return "done";
    if (isMine) {
      const subs = data.submissions.filter((s) => s.tile_id === tile.id);
      if (subs.some((s) => s.status === "pending")) return "pending";
      if (subs[0]?.status === "rejected") return "rejected";
    }
    return (p?.progress ?? 0) > 0 ? "progress" : "open";
  };

  const toggleJoin = async () => {
    setJoinBusy(true);
    setJoinError(null);
    const res = await fetch(`/api/bingo/${eventId}/signup`, { method: viewer.signedUp ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const json = await res.json().catch(() => ({}));
    setJoinBusy(false);
    if (!res.ok) setJoinError(json.error ?? "Something went wrong.");
    await load();
  };

  const tabs: { key: Tab; label: string; hidden?: boolean }[] = [
    { key: "board", label: isMine ? "Our board" : "Board" },
    { key: "standings", label: "Standings" },
    { key: "teams", label: "All teams", hidden: data.fog },
    { key: "activity", label: "Activity" },
    { key: "rules", label: "Rules", hidden: !event.rules && !event.description },
  ];
  const openTileData = tiles.find((t) => t.id === openTile) ?? null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <Confetti fire={confetti} />
      <Link href="/bingo" className="text-sm text-gnome-green hover:underline">
        ← All clan bingos
      </Link>

      {event.banner_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.banner_url} alt="" className="w-full h-40 sm:h-56 object-cover rounded-xl" />
      )}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-iron-grey">
            {STATUS_LABELS[event.status]}
            {event.status === "active" && " · "}
            {event.status === "active" && <Countdown to={startsLater ? event.starts_at : event.ends_at} prefix={startsLater ? "starts in" : "ends in"} ended="time's up" />}
            {event.status === "signups" && event.starts_at && (
              <>
                {" · "}
                <Countdown to={event.starts_at} prefix="starts in" />
              </>
            )}
          </p>
          <h1 className="font-display text-4xl text-gnome-green break-words">{event.name}</h1>
          {event.description && <p className="text-bark-brown-light mt-1 max-w-2xl">{event.description}</p>}
        </div>
        {myScore && (
          <div className="rounded-xl bg-gnome-green text-text-light px-4 py-3 min-w-48">
            <p className="text-xs opacity-80">{teams.find((t) => t.id === viewer.teamId)?.name} (your team)</p>
            <p className="font-display text-3xl leading-none mt-0.5">
              {myScore.total} <span className="text-sm font-body opacity-80">pts</span>
            </p>
            <p className="text-xs opacity-90 mt-1">
              {ordinal(standings.indexOf(myScore) + 1)} of {standings.length} · {myScore.tilesDone}/{tiles.length || data.tileCount} tiles · {myScore.lines.length} {myScore.lines.length === 1 ? "line" : "lines"}
            </p>
          </div>
        )}
      </header>

      {data.boardHidden ? (
        <Card hover={false} className="text-center py-10 space-y-4">
          <p className="font-display text-2xl text-bark-brown">
            {data.tileCount} tiles are waiting on a {n}×{n} board
          </p>
          <p className="text-bark-brown-light">
            {event.starts_at ? <Countdown to={event.starts_at} prefix="The board is revealed in" ended="The board is revealed soon." /> : "The board is revealed when the bingo starts."}
          </p>
          {event.status === "signups" &&
            (!viewer.signedIn ? (
              <p className="text-sm text-iron-grey">Sign in with Discord to join.</p>
            ) : viewer.teamId ? (
              <p className="text-gnome-green font-semibold">You&apos;re on {teams.find((t) => t.id === viewer.teamId)?.name}.</p>
            ) : (
              <div className="space-y-1">
                <Button variant={viewer.signedUp ? "ghost" : "primary"} disabled={joinBusy} onClick={toggleJoin}>
                  {viewer.signedUp ? "✓ You're signed up · Leave" : "Join this bingo"}
                </Button>
                <p className="text-xs text-iron-grey">
                  {data.signupCount} signed up{viewer.signedUp ? ". Staff will put you on a team before it starts." : ""}
                </p>
              </div>
            ))}
          {joinError && <p className="text-sm text-red-accent">{joinError}</p>}
          {teams.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {teams.map((t) => (
                <span key={t.id} className="text-sm px-3 py-1 rounded-full border border-bark-brown-light/40">
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: t.color ?? "#999" }} />
                  {t.name} · {t.members.length}
                </span>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <>
          <nav className="flex gap-1 border-b border-bark-brown-light/30 overflow-x-auto" aria-label="Clan Bingo sections">
            {tabs
              .filter((t) => !t.hidden)
              .map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  aria-current={tab === t.key ? "page" : undefined}
                  className={`px-3.5 py-2 text-sm whitespace-nowrap cursor-pointer border-b-2 -mb-px ${tab === t.key ? "border-gnome-green text-gnome-green font-semibold" : "border-transparent text-bark-brown-light hover:text-bark-brown"}`}
                >
                  {t.label}
                </button>
              ))}
          </nav>

          {tab === "board" && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] items-start">
              <div className="space-y-3 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  {teams.map((t) => {
                    const hidden = data.fog && t.id !== viewer.teamId;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={hidden}
                        onClick={() => setTeamId(t.id)}
                        className={`text-sm px-3 py-1 rounded-full border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${t.id === teamId ? "text-text-light border-transparent" : "border-bark-brown-light/40 text-bark-brown hover:bg-parchment-dark"}`}
                        style={t.id === teamId ? { background: t.color ?? "var(--color-gnome-green)" } : undefined}
                      >
                        {t.name}
                        {t.id === viewer.teamId && " (you)"}
                      </button>
                    );
                  })}
                </div>
                {team && !fogged && (
                  <p className="text-sm text-iron-grey">
                    {ordinal(rank)} place · {teamScore?.total ?? 0} points · {teamScore?.tilesDone ?? 0} of {tiles.length} tiles
                    {teamScore?.blackout && " · 🏆 blackout!"}
                  </p>
                )}
                <div className="grid gap-1.5 sm:gap-2.5 p-0.5" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
                  {Array.from({ length: n * n }, (_, p) => {
                    const tile = byPos.get(p) ?? null;
                    if (!tile) return <TileFace key={p} tile={null} state="empty" />;
                    return (
                      <TileFace
                        key={p}
                        tile={tile}
                        state={fogged ? "open" : stateOf(tile)}
                        progress={fogged ? 0 : progressFor(tile.id, teamId)?.progress ?? 0}
                        inLine={!fogged && lineSet.has(p)}
                        onClick={() => setOpenTile(tile.id)}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-iron-grey">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded border-2 border-gnome-green bg-gnome-green/[0.14]" /> Done
                  </span>
                  {isMine && (
                    <>
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded border-2 border-gold bg-gold/10" /> Waiting on staff
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded border-2 border-red-accent/80 bg-red-accent/[0.07]" /> Sent back
                      </span>
                    </>
                  )}
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded border-2 border-bark-brown-light/40 ring-2 ring-gold-display" /> Finished line (+{event.line_bonus})
                  </span>
                  <span>Number in the corner = points</span>
                </div>
                {viewer.canSubmit && isMine && <p className="text-sm text-bark-brown-light">Tap a tile to see what counts and send a screenshot.</p>}
                {viewer.signedIn && !viewer.teamId && event.status === "active" && <p className="text-sm text-iron-grey">You&apos;re not on a team for this bingo. Ask staff if you should be.</p>}
                {!viewer.signedIn && event.status === "active" && <p className="text-sm text-iron-grey">Sign in with Discord to see your team&apos;s board and send proof.</p>}
              </div>

              <aside className="space-y-4">
                <Card hover={false} className="space-y-3">
                  <h2 className="font-semibold text-bark-brown text-sm">Standings</h2>
                  <ol className="space-y-2">
                    {standings.map((s, i) => {
                      const t = teams.find((x) => x.id === s.teamId);
                      const top = standings[0]?.total || 1;
                      return (
                        <li key={s.teamId} className="text-sm">
                          <div className="flex justify-between gap-2">
                            <span className={`truncate ${s.teamId === viewer.teamId ? "font-bold" : ""}`}>
                              <span className="text-iron-grey tabular-nums mr-1">{i + 1}</span>
                              {t?.name}
                            </span>
                            <span className="font-mono text-xs tabular-nums">{s.total}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-bark-brown-light/15 overflow-hidden mt-0.5">
                            <div className="h-full rounded-full" style={{ width: `${(s.total / top) * 100}%`, background: t?.color ?? "var(--color-gnome-green)" }} />
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </Card>
                {data.activity.length > 0 && (
                  <Card hover={false} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <h2 className="font-semibold text-bark-brown text-sm">Latest</h2>
                      <button type="button" onClick={() => setTab("activity")} className="text-xs text-gnome-green hover:underline cursor-pointer">
                        See all
                      </button>
                    </div>
                    <ul className="divide-y divide-bark-brown-light/20">
                      {data.activity
                        .filter((a) => a.kind === "tile" || a.kind === "line" || a.kind === "blackout")
                        .slice(0, 6)
                        .map((a) => (
                          <ActivityRow key={a.id} a={a} teams={teams} tiles={tiles} compact />
                        ))}
                    </ul>
                  </Card>
                )}
              </aside>
            </div>
          )}

          {tab === "standings" && (
            <Card hover={false} className="space-y-4">
              <p className="text-sm text-iron-grey">
                Tiles score their points, every finished row, column or diagonal adds {event.line_bonus}, and a full board adds {event.blackout_bonus}. Best possible: {maxScore(event, tiles)}.
                {event.win_rule === "blackout" && " The first team to finish the whole board wins."}
              </p>
              <div className="space-y-3">
                {standings.map((s, i) => {
                  const t = teams.find((x) => x.id === s.teamId);
                  const max = maxScore(event, tiles) || 1;
                  return (
                    <div key={s.teamId} className={`rounded-lg p-3 ${s.teamId === viewer.teamId ? "bg-gnome-green/10" : "bg-parchment-dark/30"}`}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-semibold text-bark-brown">
                          <span className="font-display text-2xl mr-2" style={{ color: t?.color ?? undefined }}>
                            {i + 1}
                          </span>
                          {t?.name}
                          {s.blackout && " 🏆"}
                        </p>
                        <p className="text-sm tabular-nums text-bark-brown">
                          <span className="font-bold text-lg">{s.total}</span> pts · {s.tilesDone} tiles · {s.lines.length} lines
                        </p>
                      </div>
                      <div className="h-2.5 rounded-full bg-bark-brown-light/15 overflow-hidden mt-2">
                        <div className="h-full rounded-full" style={{ width: `${(s.total / max) * 100}%`, background: t?.color ?? "var(--color-gnome-green)" }} />
                      </div>
                      <p className="text-xs text-iron-grey mt-1.5">
                        {t?.members.length} players
                        {t?.members.some((m) => m.is_captain) && ` · captain ${t.members.filter((m) => m.is_captain).map((m) => m.rsn).join(", ")}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {tab === "teams" && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {standings.map((s, i) => {
                const t = teams.find((x) => x.id === s.teamId);
                if (!t) return null;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTeamId(t.id);
                      setTab("board");
                    }}
                    className="text-left cursor-pointer"
                  >
                    <Card className="space-y-3 h-full">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-bark-brown truncate">
                          <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style={{ background: t.color ?? "#999" }} />
                          {i + 1}. {t.name}
                        </p>
                        <span className="text-sm font-mono tabular-nums">{s.total}</span>
                      </div>
                      <MiniBoard tiles={tiles} gridSize={n} done={doneByTeam.get(t.id) ?? new Set()} />
                      <p className="text-xs text-iron-grey line-clamp-2">{t.members.map((m) => m.rsn).join(", ")}</p>
                    </Card>
                  </button>
                );
              })}
            </div>
          )}

          {tab === "activity" && (
            <Card hover={false}>
              {data.activity.length === 0 ? (
                <p className="text-sm text-iron-grey text-center py-6">Nothing yet. The first completed tile will show up here.</p>
              ) : (
                <ul className="divide-y divide-bark-brown-light/20 -my-1">
                  {data.activity.map((a) => (
                    <ActivityRow key={a.id} a={a} teams={teams} tiles={tiles} />
                  ))}
                </ul>
              )}
            </Card>
          )}

          {tab === "rules" && (
            <Card hover={false} className="space-y-3">
              {event.description && <p className="text-bark-brown">{event.description}</p>}
              {event.rules && <p className="text-bark-brown-light whitespace-pre-line">{event.rules}</p>}
              <p className="text-sm text-iron-grey">
                Scoring: tile points, +{event.line_bonus} per finished line, +{event.blackout_bonus} for a full board. {event.win_rule === "blackout" ? "First full board wins." : "Most points at the end wins."}
              </p>
            </Card>
          )}
        </>
      )}

      {viewer.isStaff && (
        <p className="text-xs text-iron-grey">
          Staff:{" "}
          <Link href={`/admin/bingo/${event.id}`} className="text-gnome-green hover:underline">
            manage this bingo
          </Link>
          {event.status === "draft" && " (this is a preview; members can't see drafts)"}
        </p>
      )}

      {openTileData && (
        <TileDrawer
          eventId={event.id}
          tile={openTileData}
          team={fogged ? null : team}
          progress={fogged ? undefined : progressFor(openTileData.id, teamId)}
          submissions={isMine ? data.submissions.filter((s) => s.tile_id === openTileData.id) : []}
          canSubmit={viewer.canSubmit && isMine}
          lastSynced={event.last_synced_at}
          onClose={() => setOpenTile(null)}
          onSubmitted={load}
        />
      )}
    </div>
  );
}
