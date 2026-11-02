"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Countdown, useNow } from "@/components/bingo/Countdown";
import { ProofUploader } from "@/components/bingo/ProofUploader";
import {
  DIFFICULTIES,
  DIFFICULTY_COLOR,
  eventQuests,
  questPoints,
  STATUS_LABELS,
  wikiUrl,
  type Quest,
  type QuestCompletion,
  type QuestEvent,
  type QuestTeam,
  type Standing,
} from "@/lib/quests";

interface Player {
  id: string;
  rsn: string;
  team_id: string | null;
  is_captain: boolean;
  has_wikisync: boolean | null;
  last_checked_at: string | null;
  joined_at: string;
}
interface Activity {
  id: string;
  participant_id: string | null;
  quest_name: string | null;
  kind: "completed" | "submitted" | "rejected" | "joined";
  created_at: string;
}
interface Submission {
  id: string;
  participant_id: string;
  quest_name: string;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  created_at: string;
}
interface EventData {
  event: QuestEvent;
  teams: QuestTeam[];
  participants: Player[];
  completions: QuestCompletion[];
  standings: Standing[];
  activity: Activity[];
  submissions: Submission[];
  viewer: { signedIn: boolean; rsn: string | null; verified: boolean; isStaff: boolean; participantIds: string[]; canJoin: boolean; canLeave: boolean; canSubmit: boolean };
}

type Tab = "leaderboard" | "quests" | "activity" | "rules";
type Filter = "todo" | "done" | "all";

function ago(iso: string, now: number): string {
  const mins = Math.round((now - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const SOURCE_LABEL = { wikisync: "via WikiSync", proof: "screenshot approved", staff: "added by staff", broadcast: "via clan broadcast" } as const;

/** How to get WikiSync going, for anyone without it. */
function WikiSyncHelp() {
  return (
    <ol className="text-sm text-bark-brown-light list-decimal pl-5 space-y-0.5">
      <li>In RuneLite, open the Plugin Hub and install <span className="font-semibold text-bark-brown">WikiSync</span>.</li>
      <li>Log in to your account, then log out (or hop worlds). That sends your quest list to the OSRS Wiki.</li>
      <li>Come back here and press <span className="font-semibold text-bark-brown">Check my quests</span>.</li>
    </ol>
  );
}

function QuestDot({ q }: { q: Pick<Quest, "difficulty"> }) {
  return <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: DIFFICULTY_COLOR[q.difficulty] }} title={q.difficulty} aria-hidden />;
}

async function fetchEvent(id: string): Promise<EventData | { error: string }> {
  const res = await fetch(`/api/quests/${id}`);
  const json = await res.json().catch(() => ({}));
  return res.ok ? json : { error: json.error ?? "Couldn't load this event." };
}

export function QuestEventPage({ eventId }: { eventId: string }) {
  const [data, setData] = useState<EventData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [filter, setFilter] = useState<Filter>("todo");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [proofFor, setProofFor] = useState<string | null>(null);
  const [proof, setProof] = useState<{ images: string[]; note: string }>({ images: [], note: "" });
  const [openTeam, setOpenTeam] = useState<string | null>(null);
  const now = useNow();

  const apply = useCallback((res: EventData | { error: string }) => {
    if ("error" in res) setError(res.error);
    else setData(res);
  }, []);
  const load = useCallback(async () => apply(await fetchEvent(eventId)), [eventId, apply]);

  useEffect(() => {
    let cancelled = false;
    fetchEvent(eventId).then((res) => !cancelled && apply(res));
    return () => {
      cancelled = true;
    };
  }, [eventId, apply]);

  const quests = useMemo(() => (data ? eventQuests(data.event) : []), [data]);

  if (!data) {
    return error ? (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-3">
        <p className="text-bark-brown">{error}</p>
        <Link href="/contests" className="text-gnome-green hover:underline text-sm">
          ← Back to Contests
        </Link>
      </div>
    ) : (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-parchment-dark border-t-gnome-green rounded-full animate-spin" />
      </div>
    );
  }

  const { event, teams, participants, completions, standings, viewer } = data;
  const joined = viewer.participantIds.length > 0;
  const me = participants.find((p) => viewer.participantIds.includes(p.id)) ?? null;
  const activeTab: Tab = tab ?? (event.status === "signups" && !joined ? "rules" : "leaderboard");
  const byId = new Map(participants.map((p) => [p.id, p]));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const myKey = event.format === "teams" ? me?.team_id : me?.id;
  const myStanding = standings.find((s) => s.id === myKey) ?? null;
  const myDone = new Map(completions.filter((c) => viewer.participantIds.includes(c.participant_id)).map((c) => [c.quest_name, c]));
  const mySubs = new Map<string, Submission>();
  for (const s of data.submissions) if (!mySubs.has(s.quest_name)) mySubs.set(s.quest_name, s);
  const startsLater = !!event.starts_at && Date.parse(event.starts_at) > now;
  const ended = event.status === "completed" || (!!event.ends_at && Date.parse(event.ends_at) <= now);
  const totalPossible = quests.reduce((s, q) => s + questPoints(event, q), 0);
  const counted = new Set(quests.map((q) => q.name));
  const pointsOf = (participantId: string) =>
    completions.filter((c) => c.participant_id === participantId && counted.has(c.quest_name)).reduce((s, c) => {
      const q = quests.find((x) => x.name === c.quest_name);
      return s + (q ? questPoints(event, q) : 0);
    }, 0);

  const join = async (leave = false) => {
    setBusy(true);
    setNotice(null);
    const res = await fetch(`/api/quests/${event.id}/join`, { method: leave ? "DELETE" : "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setNotice({ ok: false, text: json.error ?? "Something went wrong." });
    setNotice({ ok: true, text: leave ? "You've left the event." : "You're in! We're reading your quest list from WikiSync now." });
    await load();
    if (!leave) setTimeout(load, 4000);
  };

  const checkNow = async () => {
    setBusy(true);
    setNotice(null);
    const res = await fetch(`/api/quests/${event.id}/sync`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setNotice({ ok: false, text: json.error ?? "Couldn't check right now." });
    setNotice(
      !json.hasWikiSync
        ? { ok: false, text: "WikiSync has nothing for you yet. Set it up (below) or send screenshots instead." }
        : json.newQuests.length
          ? { ok: true, text: `Nice! ${json.newQuests.length} new: ${json.newQuests.join(", ")}.` }
          : { ok: true, text: startsLater || event.status === "signups" ? "Got your starting quest list. Anything you finish after the start will count." : "Up to date. Nothing new since the last check. Log out in game to send WikiSync your latest quests." }
    );
    await load();
  };

  const sendProof = async (questName: string) => {
    setBusy(true);
    setNotice(null);
    const res = await fetch(`/api/quests/${event.id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questName, imageUrls: proof.images, note: proof.note }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setNotice({ ok: false, text: json.error ?? "Couldn't send it." });
    setProofFor(null);
    setProof({ images: [], note: "" });
    setNotice({ ok: true, text: `Sent! Staff will check your ${questName} screenshot soon.` });
    await load();
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "leaderboard", label: "Leaderboard" },
    { key: "quests", label: joined ? `My quests (${myDone.size}/${quests.length})` : `Quests (${quests.length})` },
    { key: "activity", label: "Activity" },
    { key: "rules", label: "How it works" },
  ];

  const q = query.trim().toLowerCase();
  const listed = quests.filter((x) => {
    if (q && !x.name.toLowerCase().includes(q)) return false;
    if (!joined || filter === "all") return true;
    return filter === "done" ? myDone.has(x.name) : !myDone.has(x.name);
  });
  const top = standings[0]?.points || 1;

  const activityText = (a: Activity) => {
    const quest = a.quest_name ?? "a quest";
    return { completed: `Completed ${quest}`, submitted: `Sent a screenshot for ${quest}`, rejected: `Screenshot for ${quest} sent back`, joined: "Joined the event" }[a.kind];
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <Link href="/contests" className="text-sm text-gnome-green hover:underline">
        ← Contests
      </Link>

      {event.banner_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.banner_url} alt="" className="w-full h-40 sm:h-56 object-cover rounded-xl" />
      )}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-iron-grey">
            Quest event · {STATUS_LABELS[event.status]}
            {event.status !== "completed" && (startsLater || event.ends_at) && " · "}
            {event.status !== "completed" && <Countdown to={startsLater ? event.starts_at : event.ends_at} prefix={startsLater ? "starts in" : "ends in"} ended={event.ends_at ? "time's up" : undefined} />}
          </p>
          <h1 className="font-display text-4xl text-gnome-green break-words">{event.name}</h1>
          {event.description && <p className="text-bark-brown-light mt-1 max-w-2xl">{event.description}</p>}
          <p className="text-xs text-iron-grey mt-1">
            {event.format === "teams" ? `${teams.length} teams` : "Solo"} · {participants.length} {participants.length === 1 ? "player" : "players"} · {quests.length} quests · {totalPossible.toLocaleString()} points up for grabs
          </p>
        </div>
        {myStanding && (event.status === "active" || event.status === "completed") && (
          <div className="rounded-xl bg-gnome-green text-text-light px-4 py-3 min-w-48">
            <p className="text-xs opacity-80">{event.format === "teams" ? `${myStanding.name} (your team)` : "You"}</p>
            <p className="font-display text-3xl leading-none mt-0.5">
              {myStanding.points} <span className="text-sm font-body opacity-80">pts</span>
            </p>
            <p className="text-xs opacity-90 mt-1">
              {ordinal(standings.indexOf(myStanding) + 1)} of {standings.length} · {myStanding.quests} {myStanding.quests === 1 ? "quest" : "quests"}
            </p>
          </div>
        )}
      </header>

      {/* Joining, and the viewer's tracking status */}
      {!joined && !ended && (
        <Card hover={false} className="space-y-3">
          <h2 className="font-display text-xl text-bark-brown">Join in</h2>
          {!viewer.signedIn ? (
            <p className="text-sm text-iron-grey">Sign in with Discord to join.</p>
          ) : !viewer.rsn || !viewer.verified ? (
            <p className="text-sm text-bark-brown-light">
              Link and verify your RSN on your{" "}
              <Link href="/account" className="text-gnome-green hover:underline">
                Account page
              </Link>{" "}
              first, so we know whose quests to track.
            </p>
          ) : (
            <>
              <p className="text-sm text-bark-brown-light">
                You&apos;ll play as <span className="font-mono font-semibold text-bark-brown">{viewer.rsn}</span>.
                {event.format === "teams" && " Staff put everyone on a team before the start."} Quests you finish {startsLater || event.status === "signups" ? "after the start" : "from now on"} count.
              </p>
              <Button disabled={busy || !viewer.canJoin} onClick={() => join()}>
                Join {event.name}
              </Button>
            </>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer text-gnome-green">How are quests tracked?</summary>
            <div className="mt-2 space-y-2 text-bark-brown-light">
              <p>With the WikiSync plugin, your quests count by themselves every time you log out. Without it, send a screenshot of the quest complete scroll for each one.</p>
              <WikiSyncHelp />
            </div>
          </details>
        </Card>
      )}

      {joined && me && (
        <Card hover={false} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-bark-brown">
                Playing as <span className="font-mono font-semibold">{me.rsn}</span>
                {me.team_id && teamById.get(me.team_id) && (
                  <>
                    {" on "}
                    <span className="font-semibold" style={{ color: teamById.get(me.team_id)?.color ?? undefined }}>
                      {teamById.get(me.team_id)?.name}
                    </span>
                  </>
                )}
                {event.format === "teams" && !me.team_id && <span className="text-iron-grey"> · waiting for a team</span>}
              </p>
              <p className="text-xs text-iron-grey">
                {me.has_wikisync === true
                  ? `WikiSync connected · checked ${me.last_checked_at ? ago(me.last_checked_at, now) : "soon"}. Log out in game to send your latest quests.`
                  : me.has_wikisync === false
                    ? "No WikiSync data found. Set it up below, or send screenshots from My quests."
                    : "Checking WikiSync..."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!ended && (
                <Button size="sm" disabled={busy} onClick={checkNow}>
                  {busy ? "Checking..." : "Check my quests"}
                </Button>
              )}
              {viewer.canLeave && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => join(true)}>
                  Leave
                </Button>
              )}
            </div>
          </div>
          {me.has_wikisync === false && <WikiSyncHelp />}
        </Card>
      )}

      {notice && <p className={`text-sm ${notice.ok ? "text-gnome-green" : "text-red-accent"}`}>{notice.text}</p>}

      <nav className="flex gap-1 border-b border-bark-brown-light/30 overflow-x-auto" aria-label="Quest event sections">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={activeTab === t.key ? "page" : undefined}
            className={`px-3.5 py-2 text-sm whitespace-nowrap cursor-pointer border-b-2 -mb-px ${activeTab === t.key ? "border-gnome-green text-gnome-green font-semibold" : "border-transparent text-bark-brown-light hover:text-bark-brown"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {activeTab === "leaderboard" && (
        <Card hover={false}>
          {standings.length === 0 ? (
            <p className="text-sm text-iron-grey text-center py-6">Nobody&apos;s in yet. Be the first to join!</p>
          ) : (
            <ol className="divide-y divide-bark-brown-light/20">
              {standings.map((s, i) => {
                const mine = s.id === myKey;
                const members = event.format === "teams" ? participants.filter((p) => p.team_id === s.id) : [];
                const open = openTeam === s.id;
                return (
                  <li key={s.id} className={`py-2.5 ${mine ? "bg-gnome-green/5 -mx-3 px-3 rounded-md" : ""}`}>
                    <button type="button" disabled={event.format !== "teams"} onClick={() => setOpenTeam(open ? null : s.id)} className="w-full text-left disabled:cursor-default cursor-pointer">
                      <div className="flex items-center gap-3">
                        <span className={`w-7 text-center font-display text-lg tabular-nums ${i < 3 && s.points > 0 ? "text-gold" : "text-iron-grey"}`}>{i < 3 && s.points > 0 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`truncate ${mine ? "font-bold text-bark-brown" : "text-bark-brown"} ${event.format === "solo" ? "font-mono" : "font-semibold"}`}>
                              {s.color && <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style={{ background: s.color }} />}
                              {s.name}
                              {mine && <span className="text-xs font-body text-gnome-green"> (you)</span>}
                            </span>
                            <span className="shrink-0 text-sm tabular-nums">
                              <span className="font-semibold text-bark-brown">{s.points}</span> <span className="text-xs text-iron-grey">pts<span className="hidden sm:inline"> · {s.quests} {s.quests === 1 ? "quest" : "quests"}</span></span>
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-bark-brown-light/15 overflow-hidden mt-1">
                            <div className="h-full rounded-full transition-all" style={{ width: `${(s.points / top) * 100}%`, background: s.color ?? "var(--color-gnome-green)" }} />
                          </div>
                        </div>
                        {event.format === "teams" && <span className="text-xs text-iron-grey w-10 text-right">{open ? "Hide" : `${s.members} ▾`}</span>}
                      </div>
                    </button>
                    {open && (
                      <ul className="mt-2 ml-10 space-y-0.5">
                        {members
                          .map((m) => ({ m, pts: pointsOf(m.id) }))
                          .sort((a, b) => b.pts - a.pts)
                          .map(({ m, pts }) => (
                            <li key={m.id} className="flex justify-between text-sm">
                              <span className="font-mono text-bark-brown-light">
                                {m.is_captain && "★ "}
                                {m.rsn}
                              </span>
                              <span className="tabular-nums text-bark-brown">{pts}</span>
                            </li>
                          ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      )}

      {activeTab === "quests" && (
        <Card hover={false} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {joined && (
              <div className="flex gap-1" role="group" aria-label="Show">
                {(
                  [
                    ["todo", `To do (${quests.length - myDone.size})`],
                    ["done", `Done (${myDone.size})`],
                    ["all", "All"],
                  ] as const
                ).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setFilter(key)} className={`px-2.5 py-1 rounded-full text-xs cursor-pointer ${filter === key ? "bg-gnome-green text-text-light font-semibold" : "bg-parchment-dark text-bark-brown"}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search quests..."
              aria-label="Search quests"
              className="ml-auto w-full sm:w-56 px-3 py-1.5 rounded-md border border-bark-brown-light bg-parchment text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-gnome-green"
            />
          </div>
          <ul className="divide-y divide-bark-brown-light/20">
            {listed.map((quest) => {
              const done = myDone.get(quest.name);
              const sub = mySubs.get(quest.name);
              const pending = !done && sub?.status === "pending";
              const rejected = !done && sub?.status === "rejected";
              return (
                <li key={quest.name} className="py-2.5">
                  <div className="flex items-center gap-3">
                    <QuestDot q={quest} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${done ? "text-iron-grey line-through decoration-gnome-green/60" : "text-bark-brown"}`}>
                        <a href={wikiUrl(quest)} target="_blank" rel="noreferrer" className="hover:text-gnome-green">
                          {quest.name}
                        </a>
                      </p>
                      <p className="text-[11px] text-iron-grey">
                        {quest.difficulty} · {quest.qp} QP{quest.length ? ` · ${quest.length}` : ""}
                        {done && <span className="text-gnome-green"> · ✓ {SOURCE_LABEL[done.source]}</span>}
                        {pending && <span className="text-gold"> · screenshot waiting for review</span>}
                        {rejected && <span className="text-red-accent"> · sent back: {sub?.review_note}</span>}
                      </p>
                    </div>
                    <span className={`text-xs tabular-nums font-semibold shrink-0 ${done ? "text-gnome-green" : "text-bark-brown-light"}`}>
                      {done ? "+" : ""}
                      {questPoints(event, quest)} pts
                    </span>
                    {joined && viewer.canSubmit && !done && !pending && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setProofFor(proofFor === quest.name ? null : quest.name);
                          setProof({ images: [], note: "" });
                        }}
                      >
                        {proofFor === quest.name ? "Cancel" : "Screenshot"}
                      </Button>
                    )}
                  </div>
                  {proofFor === quest.name && (
                    <div className="mt-3 ml-5 p-3 rounded-md border border-bark-brown-light/30 bg-parchment-dark/30 space-y-2">
                      <p className="text-xs text-bark-brown-light">Screenshot the quest complete scroll for {quest.name} with your name visible. You can paste it here with Ctrl+V.</p>
                      <ProofUploader images={proof.images} onChange={(images) => setProof((p) => ({ ...p, images }))} max={2} />
                      <input
                        value={proof.note}
                        onChange={(e) => setProof((p) => ({ ...p, note: e.target.value }))}
                        maxLength={300}
                        placeholder="Note for staff (optional)"
                        className="w-full px-3 py-1.5 rounded-md border border-bark-brown-light bg-parchment text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-gnome-green"
                      />
                      <Button size="sm" disabled={busy || proof.images.length === 0} onClick={() => sendProof(quest.name)}>
                        {busy ? "Sending..." : "Send for review"}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
            {listed.length === 0 && <li className="py-8 text-center text-sm text-iron-grey">{filter === "todo" && joined && !q ? "You've done every quest in this event. Legend!" : "No quests match."}</li>}
          </ul>
          {joined && me?.has_wikisync && <p className="text-xs text-iron-grey">Quests tick off by themselves through WikiSync. Only send a screenshot if one hasn&apos;t shown up after you logged out and pressed Check my quests.</p>}
        </Card>
      )}

      {activeTab === "activity" && (
        <Card hover={false}>
          {data.activity.length === 0 ? (
            <p className="text-sm text-iron-grey text-center py-6">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-bark-brown-light/20">
              {data.activity.map((a) => {
                const p = a.participant_id ? byId.get(a.participant_id) : undefined;
                const team = p?.team_id ? teamById.get(p.team_id) : undefined;
                const quest = a.quest_name ? quests.find((x) => x.name === a.quest_name) : undefined;
                const pts = a.kind === "completed" && quest ? questPoints(event, quest) : 0;
                return (
                  <li key={a.id} className={`flex items-start gap-2.5 py-3 ${a.kind === "submitted" || a.kind === "joined" ? "opacity-80" : ""}`}>
                    <span
                      className="mt-0.5 shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs"
                      style={{ background: a.kind === "rejected" ? "var(--color-red-accent)" : team?.color ?? (quest ? DIFFICULTY_COLOR[quest.difficulty] : "var(--color-gnome-green)") }}
                      aria-hidden
                    >
                      {{ completed: "✓", submitted: "📷", rejected: "↩", joined: "+" }[a.kind]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-bark-brown truncate text-sm font-mono">{p?.rsn ?? "A player"}</p>
                        {pts > 0 && <span className="shrink-0 rounded-full bg-gnome-green/15 px-1.5 py-px text-[11px] font-semibold text-gnome-green tabular-nums">+{pts}</span>}
                      </div>
                      <p className="text-sm text-bark-brown-light leading-snug">{activityText(a)}</p>
                      <p className="text-[11px] text-iron-grey mt-0.5">
                        {team ? `${team.name} · ` : ""}
                        {ago(a.created_at, now)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {activeTab === "rules" && (
        <Card hover={false} className="space-y-4">
          {event.rules && <p className="text-bark-brown whitespace-pre-line">{event.rules}</p>}
          <div>
            <h3 className="font-semibold text-bark-brown mb-1">Scoring</h3>
            {event.scoring === "flat" && <p className="text-sm text-bark-brown-light">Every quest is worth {event.flat_points} {event.flat_points === 1 ? "point" : "points"}.</p>}
            {event.scoring === "qp" && <p className="text-sm text-bark-brown-light">Each quest is worth its quest points, from 1 for Cook&apos;s Assistant up to 6 for the biggest ones.</p>}
            {event.scoring === "difficulty" && (
              <div className="flex flex-wrap gap-2 mt-1">
                {DIFFICULTIES.filter((d) => quests.some((x) => x.difficulty === d)).map((d) => (
                  <span key={d} className="text-sm px-2.5 py-1 rounded-full border border-bark-brown-light/30 flex items-center gap-1.5">
                    <QuestDot q={{ difficulty: d }} />
                    {d} <span className="font-semibold text-gnome-green">{questPoints(event, { difficulty: d, qp: 0 })}</span>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-iron-grey mt-2">
              {event.format === "teams" ? "Every member's points add to their team. " : ""}Most points when it ends wins. Ties go to whoever got there first.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-bark-brown mb-1">Tracking</h3>
            <p className="text-sm text-bark-brown-light mb-2">
              When you join, we save the quests you&apos;ve already done. Anything you finish {event.starts_at ? `after ${new Date(event.starts_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "once it starts"}
              {event.ends_at ? ` and before ${new Date(event.ends_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""} counts. WikiSync updates when you log out; we check it every half hour, or press Check my quests.
            </p>
            <WikiSyncHelp />
            <p className="text-sm text-bark-brown-light mt-2">No RuneLite? Send a screenshot of the quest complete scroll from the Quests tab instead, and staff will approve it.</p>
          </div>
        </Card>
      )}

      {viewer.isStaff && (
        <p className="text-xs text-iron-grey">
          Staff:{" "}
          <Link href={`/admin/quests/${event.id}`} className="text-gnome-green hover:underline">
            manage this event
          </Link>
          {event.status === "draft" && " (this is a preview; members can't see drafts)"}
        </p>
      )}
    </div>
  );
}
