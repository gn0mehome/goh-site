"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { shuffled, TEAM_COLORS } from "@/lib/bingo";
import { normalizeRsn } from "@/lib/wom";
import { inputClass } from "@/components/admin/bingo/BasicsStep";
import type { AdminQuestEvent } from "./QuestBuilder";

interface Player {
  rsn: string;
  team: number | null;
  is_captain: boolean;
}
interface TeamDraft {
  id?: string;
  name: string;
  color: string;
}

const TEAM_NAMES = ["Wise Old Men", "Quest Cape Club", "Lumbridge Locals", "Gnome Guard", "Tree Gnome Trotters", "Spirit Trees"];

function splitList(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** WikiSync status for a player, as a short coloured label. */
export function WikiSyncBadge({ has, checked }: { has: boolean | null; checked: string | null }) {
  if (has === true) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gnome-green/15 text-gnome-green font-semibold">WikiSync ✓</span>;
  if (has === false) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-accent/10 text-red-accent font-semibold" title="No WikiSync data. They'll need screenshots, or to turn on the WikiSync plugin and log out once.">No WikiSync</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-iron-grey/15 text-iron-grey" title={checked ? undefined : "Checked when sign-ups open, the event goes live, or on Refresh."}>Not checked</span>;
}

export function QuestPlayersStep({ data, onSaved, onNext }: { data: AdminQuestEvent; onSaved: () => Promise<void>; onNext: () => void }) {
  const { event } = data;
  const isTeams = event.format === "teams";
  const teamIndex = (id: string | null) => (id ? data.teams.findIndex((t) => t.id === id) : -1);
  const [teams, setTeams] = useState<TeamDraft[]>(() =>
    isTeams ? (data.teams.length ? data.teams.map((t, i) => ({ id: t.id, name: t.name, color: t.color ?? TEAM_COLORS[i % TEAM_COLORS.length] })) : [0, 1].map((i) => ({ name: TEAM_NAMES[i], color: TEAM_COLORS[i] }))) : []
  );
  const [players, setPlayers] = useState<Player[]>(() => data.participants.map((p) => ({ rsn: p.rsn, team: teamIndex(p.team_id) >= 0 ? teamIndex(p.team_id) : null, is_captain: p.is_captain })));
  const [dirty, setDirty] = useState(isTeams && data.teams.length === 0);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [roster, setRoster] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);

  useEffect(() => {
    fetch("/api/clan-members")
      .then((r) => r.json())
      .then((d) => setRoster((d.members ?? []).map((m: { displayName: string }) => m.displayName)))
      .catch(() => setRoster([]));
  }, []);

  const info = useMemo(() => new Map(data.participants.map((p) => [normalizeRsn(p.rsn), p])), [data.participants]);
  const scored = useMemo(() => new Set(data.completions.map((c) => c.participant_id)), [data.completions]);
  const keys = useMemo(() => new Set(players.map((p) => normalizeRsn(p.rsn))), [players]);

  const change = (fn: (p: Player[]) => Player[]) => {
    setPlayers(fn);
    setDirty(true);
    setNotice(null);
  };
  const changeTeams = (fn: (t: TeamDraft[]) => TeamDraft[]) => {
    setTeams(fn);
    setDirty(true);
    setNotice(null);
  };

  const add = (names: string[]) => {
    const fresh: Player[] = [];
    const seen = new Set(keys);
    for (const raw of names) {
      const rsn = roster.find((r) => normalizeRsn(r) === normalizeRsn(raw)) ?? raw;
      if (seen.has(normalizeRsn(rsn))) continue;
      seen.add(normalizeRsn(rsn));
      fresh.push({ rsn, team: null, is_captain: false });
    }
    if (fresh.length) change((p) => [...p, ...fresh]);
  };
  const remove = (rsn: string) => change((p) => p.filter((x) => x.rsn !== rsn));
  const move = (rsn: string, team: number | null) => {
    change((p) => p.map((x) => (x.rsn === rsn ? { ...x, team, is_captain: team === null ? false : x.is_captain } : x)));
    setSelected(null);
  };

  // Spread players so each team has about the same number of quests left to
  // do (from their WikiSync snapshot); players without one count as average.
  const balance = () => {
    const known = players.map((p) => info.get(normalizeRsn(p.rsn))?.remaining).filter((n): n is number => n != null);
    const avg = known.length ? known.reduce((s, n) => s + n, 0) / known.length : 0;
    const sorted = [...players].sort((a, b) => (info.get(normalizeRsn(b.rsn))?.remaining ?? avg) - (info.get(normalizeRsn(a.rsn))?.remaining ?? avg));
    const cap = Math.ceil(players.length / teams.length);
    const load = teams.map(() => ({ n: 0, left: 0 }));
    const assigned = new Map<string, number>();
    for (const p of sorted) {
      const open = load.map((l, i) => ({ ...l, i })).filter((l) => l.n < cap);
      const target = open.reduce((best, l) => (l.left < best.left || (l.left === best.left && l.n < best.n) ? l : best), open[0]);
      assigned.set(p.rsn, target.i);
      load[target.i].n += 1;
      load[target.i].left += info.get(normalizeRsn(p.rsn))?.remaining ?? avg;
    }
    change((prev) => prev.map((p) => ({ ...p, team: assigned.get(p.rsn) ?? null })));
    const missing = players.length - known.length;
    setNotice({ ok: true, text: `Balanced by quests left to do.${missing ? ` ${missing} without WikiSync data counted as average.` : ""} Save to keep it.` });
  };
  const randomise = () => {
    const order = shuffled(players.map((p) => p.rsn));
    change((prev) => prev.map((p) => ({ ...p, team: order.indexOf(p.rsn) % teams.length, is_captain: false })));
  };

  const save = async () => {
    setBusy(true);
    const res = await fetch(`/api/admin/quests/${event.id}/players`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teams, players }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setNotice({ ok: false, text: json.error ?? "Couldn't save the players." });
    setTeams((prev) => prev.map((t, i) => ({ ...t, id: json.teamIds?.[i] ?? t.id })));
    setDirty(false);
    setNotice({ ok: true, text: "Players saved." });
    await onSaved();
  };

  const toggleSignups = async () => {
    setBusy(true);
    await fetch(`/api/admin/quests/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: event.status === "signups" ? "draft" : "signups" }),
    });
    setBusy(false);
    await onSaved();
  };

  const notAdded = roster.filter((r) => !keys.has(normalizeRsn(r))).length;

  const toggleWholeClan = async (on: boolean) => {
    setBusy(true);
    await fetch(`/api/admin/quests/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auto_add_members: on }),
    });
    setBusy(false);
    setNotice({
      ok: true,
      text: on
        ? event.status === "draft"
          ? "The whole clan will be added when you open sign-ups or go live."
          : "Adding the whole clan now. Refresh in a minute to see everyone."
        : "New clan members won't be added any more. Everyone already in stays.",
    });
    await onSaved();
  };

  const suggestions = query.trim() ? roster.filter((r) => r.toLowerCase().includes(query.trim().toLowerCase()) && !keys.has(normalizeRsn(r))).slice(0, 8) : [];

  const chip = (p: Player) => {
    const row = info.get(normalizeRsn(p.rsn));
    const hasPoints = row && scored.has(row.id);
    return (
      <div
        key={p.rsn}
        draggable={isTeams}
        onDragStart={() => setDrag(p.rsn)}
        onDragEnd={() => setDrag(null)}
        className={`group rounded-md border px-2 py-1 text-xs bg-parchment ${isTeams ? "cursor-grab" : ""} ${selected === p.rsn ? "border-gnome-green ring-2 ring-gnome-green/40" : "border-bark-brown-light/40"}`}
      >
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => isTeams && setSelected(selected === p.rsn ? null : p.rsn)} className="flex-1 min-w-0 text-left truncate font-mono text-bark-brown cursor-pointer" title={p.rsn}>
            {p.is_captain && <span title="Captain">★ </span>}
            {p.rsn}
          </button>
          {isTeams && p.team !== null && (
            <button
              type="button"
              aria-label={p.is_captain ? `Remove ${p.rsn} as captain` : `Make ${p.rsn} captain`}
              onClick={() => change((prev) => prev.map((x) => (x.rsn === p.rsn ? { ...x, is_captain: !x.is_captain } : x)))}
              className="text-gold opacity-40 group-hover:opacity-100 cursor-pointer"
            >
              {p.is_captain ? "★" : "☆"}
            </button>
          )}
          <button
            type="button"
            aria-label={`Remove ${p.rsn}`}
            title={hasPoints ? "Removes them and the quests they've scored" : "Remove"}
            onClick={() => remove(p.rsn)}
            className="text-red-accent opacity-40 group-hover:opacity-100 cursor-pointer px-0.5"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
          {row ? <WikiSyncBadge has={row.has_wikisync} checked={row.last_checked_at} /> : <span className="text-[10px] text-gold">new, save to check WikiSync</span>}
          {row?.remaining != null && <span className="text-[10px] text-iron-grey" title="Quests in this event they hadn't done yet when we first checked">{row.remaining} left</span>}
        </div>
      </div>
    );
  };

  const adder = (
    <div className="space-y-1.5 pt-1">
      <div className="relative">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Add from the clan..." aria-label="Add a player from the clan list" className={`${inputClass} py-1 text-xs`} />
        {suggestions.length > 0 && (
          <div className="absolute left-0 right-0 mt-1 z-10 card-wood py-1 shadow-xl max-h-48 overflow-y-auto">
            {suggestions.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  add([r]);
                  setQuery("");
                }}
                className="block w-full text-left px-3 py-1 text-xs font-mono text-bark-brown hover:bg-parchment-dark cursor-pointer"
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <button type="button" onClick={() => setShowPaste((v) => !v)} className="text-[11px] text-gnome-green hover:underline cursor-pointer">
          {showPaste ? "Hide" : "Paste a list of names"}
        </button>
        {notAdded > 0 && (
          <button type="button" onClick={() => add(roster)} className="text-[11px] text-gnome-green hover:underline cursor-pointer">
            Add everyone in the clan ({notAdded})
          </button>
        )}
      </div>
      {showPaste && (
        <>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={3} className={`${inputClass} text-xs font-mono`} placeholder="One per line or comma-separated" />
          <Button
            size="sm"
            variant="ghost"
            disabled={!paste.trim()}
            onClick={() => {
              add(splitList(paste));
              setPaste("");
              setShowPaste(false);
            }}
          >
            Add names
          </Button>
        </>
      )}
    </div>
  );

  const column = (team: number | null, header: React.ReactNode, members: Player[], footer?: React.ReactNode) => (
    <div
      key={team ?? "pool"}
      onDragOver={(e) => drag && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (drag) move(drag, team);
        setDrag(null);
      }}
      className={`rounded-lg border p-2.5 space-y-2 min-h-32 ${drag ? "border-dashed border-gnome-green/60" : "border-bark-brown-light/40"} bg-parchment-dark/30`}
    >
      {header}
      {selected && !members.some((m) => m.rsn === selected) && (
        <button type="button" onClick={() => move(selected, team)} className="w-full text-xs rounded-md border border-dashed border-gnome-green text-gnome-green py-1 cursor-pointer hover:bg-gnome-green/10">
          Move {selected} here
        </button>
      )}
      <div className="space-y-1">{members.map(chip)}</div>
      {footer}
    </div>
  );

  const withoutWikiSync = data.participants.filter((p) => p.has_wikisync === false).length;

  return (
    <div className="space-y-5">
      <Card hover={false} className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl text-bark-brown">Sign-ups</h2>
            <p className="text-sm text-iron-grey">
              {event.status === "signups"
                ? `Open: members can see this event on the Contests page and join it themselves. ${data.participants.length} in so far.`
                : event.status === "draft"
                  ? "Open sign-ups to list the event and let members join themselves. You can also add people here."
                  : "Members can still join while it's live. Their starting point is taken when they join."}
            </p>
          </div>
          {(event.status === "draft" || event.status === "signups") && (
            <Button size="sm" variant={event.status === "signups" ? "ghost" : "primary"} disabled={busy} onClick={toggleSignups}>
              {event.status === "signups" ? "Close sign-ups (back to draft)" : "Open sign-ups"}
            </Button>
          )}
        </div>
        <label className="flex items-start gap-2 text-sm text-bark-brown cursor-pointer pt-1">
          <input type="checkbox" checked={event.auto_add_members} disabled={busy || event.status === "completed"} onChange={(e) => toggleWholeClan(e.target.checked)} className="accent-gnome-green mt-1" />
          <span>
            Everyone in the clan takes part
            <span className="block text-xs text-iron-grey">
              Adds everyone on the clan&apos;s Wise Old Man group, and keeps adding people who join the clan during the event{event.format === "teams" ? " (each to the team with the fewest players)" : ""}. Newcomers only score quests finished after they&apos;re added. People who leave the clan stay in; anyone you remove comes back on the next check while this is on.
            </span>
          </span>
        </label>
        {withoutWikiSync > 0 && (
          <p className="text-xs text-gold">
            {withoutWikiSync} {withoutWikiSync === 1 ? "player has" : "players have"} no WikiSync data. They can turn on the WikiSync plugin in RuneLite and log out once, or send screenshots instead.
          </p>
        )}
      </Card>

      <Card hover={false} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl text-bark-brown">{isTeams ? "Teams" : `Players (${players.length})`}</h2>
          {isTeams && (
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" disabled={busy || players.length === 0} onClick={balance}>
                Balance teams
              </Button>
              <Button size="sm" variant="ghost" disabled={busy || players.length === 0} onClick={randomise}>
                Randomise
              </Button>
              <Button size="sm" variant="ghost" disabled={teams.length >= 12} onClick={() => changeTeams((t) => [...t, { name: TEAM_NAMES[t.length % TEAM_NAMES.length], color: TEAM_COLORS[t.length % TEAM_COLORS.length] }])}>
                + Add team
              </Button>
            </div>
          )}
        </div>
        {isTeams ? (
          <>
            <p className="text-xs text-iron-grey">
              Balance gives each team about the same number of quests left to do, using everyone&apos;s WikiSync. Drag players between columns, or click a name and then &quot;Move here&quot;. ☆ marks a captain.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {column(
                null,
                <div>
                  <p className="text-sm font-semibold text-bark-brown">Waiting ({players.filter((p) => p.team === null).length})</p>
                  <p className="text-[11px] text-iron-grey">Joined or added, not on a team yet.</p>
                </div>,
                players.filter((p) => p.team === null),
                adder
              )}
              {teams.map((team, i) =>
                column(
                  i,
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <input type="color" value={team.color} aria-label={`${team.name} colour`} onChange={(e) => changeTeams((p) => p.map((t, k) => (k === i ? { ...t, color: e.target.value } : t)))} className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0" />
                      <input value={team.name} maxLength={40} aria-label="Team name" onChange={(e) => changeTeams((p) => p.map((t, k) => (k === i ? { ...t, name: e.target.value } : t)))} className={`${inputClass} py-1 text-sm font-semibold`} />
                      {teams.length > 2 && (
                        <button
                          type="button"
                          aria-label={`Remove ${team.name}`}
                          onClick={() => {
                            changeTeams((p) => p.filter((_, k) => k !== i));
                            change((prev) => prev.map((x) => (x.team === i ? { ...x, team: null, is_captain: false } : x.team !== null && x.team > i ? { ...x, team: x.team - 1 } : x)));
                          }}
                          className="text-red-accent text-xs cursor-pointer px-1"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-iron-grey">
                      {players.filter((p) => p.team === i).length} players
                      {(() => {
                        const left = players.filter((p) => p.team === i).map((p) => info.get(normalizeRsn(p.rsn))?.remaining).filter((n): n is number => n != null);
                        return left.length ? ` · ${left.reduce((s, n) => s + n, 0)} quests left` : "";
                      })()}
                    </p>
                  </div>,
                  players.filter((p) => p.team === i)
                )
              )}
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{players.map(chip)}</div>
            {players.length === 0 && <p className="text-sm text-iron-grey">Nobody yet. Open sign-ups so members can join, or add them here.</p>}
            <div className="sm:w-80">{adder}</div>
          </>
        )}
        {event.status === "active" && <p className="text-xs text-gold">This event is live. Removing a player also removes the quests they&apos;ve scored.</p>}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy || !dirty} onClick={save}>
          {dirty ? "Save players" : "Players saved"}
        </Button>
        <Button variant="ghost" disabled={dirty} onClick={onNext}>
          Next: launch
        </Button>
        {notice && <span className={`text-sm ${notice.ok ? "text-gnome-green" : "text-red-accent"}`}>{notice.text}</span>}
        {dirty && !notice && <span className="text-sm text-gold">Unsaved changes</span>}
      </div>
    </div>
  );
}
