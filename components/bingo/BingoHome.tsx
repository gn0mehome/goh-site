"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { BingoEvent } from "@/lib/bingo";
import { Countdown, useNow } from "./Countdown";

interface ListedEvent extends BingoEvent {
  tileCount: number;
  playerCount: number;
  signupCount: number;
  viewerSignedUp: boolean;
  viewerTeamId: string | null;
  standings: { teamId: string; name: string; color: string | null; total: number; tilesDone: number }[];
}

function range(e: BingoEvent): string {
  const f = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (e.starts_at && e.ends_at) return `${f(e.starts_at)} – ${f(e.ends_at)}`;
  return e.ends_at ? `Until ${f(e.ends_at)}` : "";
}

function MiniStandings({ event, max = 4 }: { event: ListedEvent; max?: number }) {
  const top = event.standings[0]?.total || 1;
  return (
    <ol className="space-y-1.5">
      {event.standings.slice(0, max).map((s, i) => (
        <li key={s.teamId} className="text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className={`truncate ${s.teamId === event.viewerTeamId ? "font-bold text-bark-brown" : "text-bark-brown-light"}`}>
              <span className="tabular-nums text-iron-grey mr-1.5">{i + 1}</span>
              {s.name}
              {s.teamId === event.viewerTeamId && " (you)"}
            </span>
            <span className="font-mono text-xs tabular-nums text-bark-brown">{s.total}</span>
          </div>
          <div className="h-1.5 rounded-full bg-bark-brown-light/15 overflow-hidden mt-0.5">
            <div className="h-full rounded-full" style={{ width: `${(s.total / top) * 100}%`, background: s.color ?? "var(--color-gnome-green)" }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

async function fetchList() {
  const res = await fetch("/api/bingo");
  return res.json().catch(() => ({}));
}

export function BingoHome() {
  const [events, setEvents] = useState<ListedEvent[] | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();

  const apply = (data: { events?: ListedEvent[]; signedIn?: boolean }) => {
    setEvents(data.events ?? []);
    setSignedIn(!!data.signedIn);
  };
  const load = async () => apply(await fetchList());

  useEffect(() => {
    let cancelled = false;
    fetchList().then((data) => !cancelled && apply(data));
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleJoin = async (e: ListedEvent) => {
    setBusy(e.id);
    setError(null);
    const res = await fetch(`/api/bingo/${e.id}/signup`, { method: e.viewerSignedUp ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) setError(json.error ?? "Something went wrong.");
    await load();
  };

  if (events === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-parchment-dark border-t-gnome-green rounded-full animate-spin" />
      </div>
    );
  }

  const live = events.filter((e) => e.status === "active");
  const signups = events.filter((e) => e.status === "signups");
  const finished = events.filter((e) => e.status === "completed");
  const featured = live.find((e) => e.viewerTeamId) ?? live[0] ?? null;
  const otherLive = live.filter((e) => e !== featured);

  const joinButton = (e: ListedEvent) =>
    !signedIn ? (
      <p className="text-sm text-iron-grey">Sign in with Discord to join.</p>
    ) : e.viewerTeamId ? (
      <p className="text-sm text-gnome-green font-semibold">You&apos;re on a team.</p>
    ) : (
      <Button size="sm" variant={e.viewerSignedUp ? "ghost" : "primary"} disabled={busy === e.id} onClick={() => toggleJoin(e)}>
        {e.viewerSignedUp ? "✓ Signed up · Leave" : "Join this bingo"}
      </Button>
    );

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
      <header>
        <h1 className="font-display text-4xl sm:text-5xl text-gnome-green">Clan Bingo</h1>
        <p className="text-bark-brown-light mt-1 max-w-2xl">Team up, fill the board, and race the other teams. Every tile you get earns your team points, and full rows, columns and diagonals earn bonuses.</p>
      </header>

      {error && <p className="text-sm text-red-accent">{error}</p>}

      {featured && (
        <Link href={`/bingo/${featured.id}`} className="block group">
          <section className="card-wood overflow-hidden rounded-xl border-2 border-gnome-green/40 transition-shadow group-hover:shadow-lg">
            {featured.banner_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={featured.banner_url} alt="" className="w-full h-40 sm:h-52 object-cover" />
            )}
            <div className="p-5 sm:p-6 grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <div className="space-y-3 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-gnome-green">● Live now</p>
                <h2 className="font-display text-3xl text-bark-brown break-words">{featured.name}</h2>
                {featured.description && <p className="text-bark-brown-light">{featured.description}</p>}
                <p className="text-sm text-iron-grey">
                  <Countdown to={featured.starts_at && Date.parse(featured.starts_at) > now ? featured.starts_at : featured.ends_at} prefix={featured.starts_at && Date.parse(featured.starts_at) > now ? "Board unlocks in" : "Ends in"} ended="Wrapping up" />
                  {" · "}
                  {featured.standings.length} teams · {featured.playerCount} players
                </p>
                <span className="inline-flex items-center rounded-md bg-gnome-green text-text-light font-semibold px-5 py-2.5 group-hover:bg-gnome-green-light transition-colors">
                  {featured.viewerTeamId ? "Open my team's board →" : "View the board →"}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-iron-grey mb-2">Standings</p>
                <MiniStandings event={featured} />
              </div>
            </div>
          </section>
        </Link>
      )}

      {signups.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-2xl text-bark-brown">Sign-ups open</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {signups.map((e) => (
              <Card key={e.id} hover={false} className="space-y-3">
                <div>
                  <Link href={`/bingo/${e.id}`} className="font-display text-xl text-bark-brown hover:text-gnome-green">
                    {e.name}
                  </Link>
                  <p className="text-xs text-iron-grey">
                    {range(e)} · {e.grid_size}×{e.grid_size} board · {e.signupCount} signed up
                  </p>
                </div>
                {e.description && <p className="text-sm text-bark-brown-light line-clamp-3">{e.description}</p>}
                {joinButton(e)}
              </Card>
            ))}
          </div>
        </section>
      )}

      {otherLive.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-2xl text-bark-brown">Also live</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {otherLive.map((e) => (
              <Link key={e.id} href={`/bingo/${e.id}`}>
                <Card className="h-full space-y-3">
                  <div>
                    <h3 className="font-display text-xl text-bark-brown">{e.name}</h3>
                    <p className="text-xs text-iron-grey">
                      <Countdown to={e.ends_at} prefix="Ends in" ended="Wrapping up" />
                    </p>
                  </div>
                  <MiniStandings event={e} max={3} />
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {events.length === 0 && (
        <Card hover={false} className="text-center py-12">
          <p className="text-bark-brown">No bingo running right now.</p>
          <p className="text-sm text-iron-grey mt-1">When staff open sign-ups for the next one, you can join from here.</p>
        </Card>
      )}

      {finished.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-2xl text-bark-brown">Past clan bingos</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {finished.map((e) => {
              const winner = e.standings[0];
              return (
                <Link key={e.id} href={`/bingo/${e.id}`}>
                  <Card className="h-full">
                    <h3 className="font-semibold text-bark-brown">{e.name}</h3>
                    <p className="text-xs text-iron-grey mb-2">{range(e)}</p>
                    {winner && (
                      <p className="text-sm text-bark-brown-light">
                        🏆 <span className="font-semibold text-bark-brown">{winner.name}</span> won with {winner.total} points
                      </p>
                    )}
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
