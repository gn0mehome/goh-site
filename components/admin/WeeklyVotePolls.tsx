"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { WeeklyVotePoll } from "@/lib/weekly-poll";

interface Settings {
  poll_auto_create: boolean;
  poll_winner_count: number;
  poll_announce: boolean;
}

const STATUS: Record<WeeklyVotePoll["status"], { label: string; tone: string }> = {
  open: { label: "Voting", tone: "bg-gold/20 text-bark-brown" },
  created: { label: "Competition set up", tone: "bg-gnome-green/15 text-gnome-green" },
  tie: { label: "Tie: pick one", tone: "bg-red-accent/10 text-red-accent" },
  no_votes: { label: "No votes: pick one", tone: "bg-red-accent/10 text-red-accent" },
  failed: { label: "Couldn't set up", tone: "bg-red-accent/10 text-red-accent" },
  waiting: { label: "Waiting for staff", tone: "bg-gold/20 text-bark-brown" },
  skipped: { label: "Skipped", tone: "bg-iron-grey/15 text-iron-grey" },
};

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const weekLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * What happens when the weekly voting poll closes, and the polls being
 * watched: each one's votes and the competition it became, with buttons to
 * settle a tie (or no votes) by hand.
 */
export function WeeklyVotePolls({ refreshKey }: { refreshKey: number }) {
  const [polls, setPolls] = useState<WeeklyVotePoll[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/weekly-competition/vote-polls");
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setPolls(data.polls ?? []);
      setSettings(data.settings);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, refreshKey]);

  const act = async (key: string, body: Record<string, unknown>, done: string) => {
    setBusy(key);
    setMessage(null);
    const res = await fetch("/api/admin/weekly-competition/vote-polls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    setMessage(res.ok ? { ok: true, text: data.note || done } : { ok: false, text: data.error ?? "Something went wrong." });
    await load();
  };

  const saveSetting = (patch: Partial<Settings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    void act("settings", { action: "settings", ...patch }, "Saved.");
  };

  return (
    <Card hover={false} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl text-bark-brown">When the voting poll closes</h2>
        <Button size="sm" variant="ghost" disabled={busy === "check"} onClick={() => act("check", { action: "check" }, "Checked.")}>
          {busy === "check" ? "Checking..." : "Check now"}
        </Button>
      </div>
      <p className="text-sm text-bark-brown-light">
        Polls posted from this page are watched until they close (the bot checks every 30 minutes). The winner becomes a clan-wide Wise Old Man competition starting at 8 PM Eastern on
        the poll&apos;s Sunday, running a week, titled like <i>Boss of the Week | 11/8 | Vorkath</i>. If there&apos;s a tie or no votes, it waits here for you to pick.
      </p>

      {settings && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={settings.poll_auto_create} onChange={(e) => saveSetting({ poll_auto_create: e.target.checked })} className="accent-gnome-green" />
            Set up the winner automatically
          </label>
          <label className="flex items-center gap-2">
            Winners to pay out
            <input
              type="number"
              min={0}
              max={20}
              value={settings.poll_winner_count}
              onChange={(e) => setSettings((s) => (s ? { ...s, poll_winner_count: Number(e.target.value) } : s))}
              onBlur={(e) => saveSetting({ poll_winner_count: Number(e.target.value) })}
              className="w-16 px-2 py-1 rounded-md border border-bark-brown-light bg-parchment text-sm"
            />
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={settings.poll_announce} onChange={(e) => saveSetting({ poll_announce: e.target.checked })} className="accent-gnome-green" />
            Announce it in the WOM Competitions channel
          </label>
        </div>
      )}

      {message && <p className={`text-sm ${message.ok ? "text-gnome-green" : "text-red-accent"}`}>{message.text}</p>}

      {polls === null ? (
        <p className="text-sm text-iron-grey">Loading...</p>
      ) : polls.length === 0 ? (
        <p className="text-sm text-iron-grey">No polls are being watched yet. Post one from the form above with options picked from the lists.</p>
      ) : (
        <ul className="space-y-3">
          {polls.map((p) => {
            const st = STATUS[p.status];
            const counts = p.vote_counts ?? {};
            const needsPick = p.status === "tie" || p.status === "no_votes" || p.status === "waiting" || p.status === "failed";
            const total = Object.values(counts).reduce((a, b) => a + b, 0);
            return (
              <li key={p.id} className="rounded-md border border-bark-brown-light/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-bark-brown">
                    {p.kind === "sotw" ? "Skill" : "Boss"} of the Week for {weekLabel(p.week_start)}
                  </p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.tone}`}>{st.label}</span>
                </div>
                <p className="text-xs text-iron-grey mt-0.5">
                  {p.status === "open" ? `Closes ${when(p.closes_at)}` : `Closed ${when(p.closes_at)}`}
                  {total > 0 && ` · ${total} ${total === 1 ? "vote" : "votes"}`}
                </p>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  {p.options.map((o) => {
                    const votes = counts[String(o.answer_id)];
                    const won = p.winning_answer_id === o.answer_id;
                    return (
                      <li key={o.answer_id} className={`flex items-center justify-between gap-2 text-sm ${won ? "font-semibold text-gnome-green" : "text-bark-brown"}`}>
                        <span>
                          {won && "🏆 "}
                          {o.label}
                          {votes != null && <span className="text-xs text-iron-grey font-normal"> · {votes}</span>}
                        </span>
                        {needsPick && (
                          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act(`${p.id}-${o.answer_id}`, { action: "pick", id: p.id, answerId: o.answer_id }, "Set up.")}>
                            {busy === `${p.id}-${o.answer_id}` ? "Creating..." : "Create this"}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {p.note && <p className={`text-xs mt-2 ${p.status === "failed" ? "text-red-accent" : "text-bark-brown-light"}`}>{p.note}</p>}
                {p.competition_wom_ids.length > 0 && (
                  <p className="text-xs mt-1">
                    {p.competition_wom_ids.map((id) => (
                      <a key={id} href={`https://wiseoldman.net/competitions/${id}`} target="_blank" rel="noopener noreferrer" className="text-gnome-green hover:underline mr-3">
                        View on Wise Old Man →
                      </a>
                    ))}
                  </p>
                )}
                {needsPick && (
                  <button type="button" disabled={!!busy} onClick={() => act(`${p.id}-skip`, { action: "skip", id: p.id }, "Stopped watching that poll.")} className="text-xs text-iron-grey hover:underline mt-2">
                    Don&apos;t set this one up
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
