"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PATTERN_MENU, type PatternId } from "@/lib/bingo-night/core";
import { themeVars } from "@/lib/bingo-night/themes";
import { PATTERN_TIMES, configFor, patternDescription, patternName, plainBangs, safeLabel } from "@/lib/bingo-night/ui";
import type { ConsoleClaim, ConsoleState } from "@/lib/bingo-night/server";
import { BingoCard } from "@/components/bingo-night/BingoCard";
import { PatternPicture } from "@/components/bingo-night/PatternPicture";
import { WikiIcon } from "@/components/bingo-night/WikiIcon";
import { InviteQr } from "./InviteQr";

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });

const CLAIM_TONE: Record<ConsoleClaim["status"], string> = {
  pending: "bg-gold/25 text-bark-brown",
  confirmed: "bg-gnome-green/15 text-gnome-green",
  rejected: "bg-iron-grey/15 text-iron-grey",
  not_bingo: "bg-red-accent/10 text-red-accent",
};
const CLAIM_LABEL: Record<ConsoleClaim["status"], string> = { pending: "Waiting", confirmed: "Winner", rejected: "Rejected", not_bingo: "Not bingo" };

function PatternMenu({ mode, value, onChange }: { mode: "numbers" | "words"; value: PatternId; onChange: (p: PatternId) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {PATTERN_MENU.map((p) => (
        <label key={p} className={`flex items-center gap-3 rounded-md border p-2 cursor-pointer ${value === p ? "border-gnome-green bg-gnome-green/10" : "border-bark-brown-light/40"}`}>
          <input type="radio" checked={value === p} onChange={() => onChange(p)} className="accent-gnome-green" />
          <PatternPicture pattern={p} size={34} />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-bark-brown">{patternName(p)}</span>
            <span className="block text-xs text-iron-grey">
              {patternDescription(p)} · ~{PATTERN_TIMES[p][mode]}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}

/** The host's console: open and start rounds, draw calls, review BINGO claims. Polls every 2s. */
export function BingoNightConsole({ id }: { id: string }) {
  const [s, setS] = useState<ConsoleState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pattern, setPattern] = useState<PatternId>("single_line");
  const [openClaim, setOpenClaim] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/admin/bingo-night/${id}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setS(data);
        setLoadError(null);
      } else setLoadError(data.error ?? "Couldn't load the game.");
    } catch {
      setLoadError("Connection lost. Retrying…");
    } finally {
      inFlight.current = false;
    }
  }, [id]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (key: string, body: Record<string, unknown>, done?: string) => {
    setBusy(key);
    setMessage(null);
    const res = await fetch(`/api/admin/bingo-night/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) setMessage({ ok: false, text: data.error ?? "Something went wrong." });
    else if (done) setMessage({ ok: true, text: done });
    await load();
    return res.ok ? data : null;
  };

  const game = s?.game;
  const round = s?.round ?? null;
  const config = useMemo(() => configFor(game?.card_mode ?? "numbers", game?.words ?? null), [game?.card_mode, game?.words]);
  const calls = useMemo(() => (round?.calls ?? []).map((c) => c.v), [round?.calls]);
  const called = useMemo(() => new Set(calls), [calls]);

  if (!s || !game) return <p className="text-sm text-iron-grey">{loadError ?? "Loading..."}</p>;

  const isHost = s.control === "host";
  const live = game.status === "live";
  const canAct = live && isHost && !busy;
  const nextNumber = (s.rounds.at(-1)?.number ?? 0) + 1;
  const pending = s.claims.filter((c) => c.status === "pending");
  const lastLabel = calls.length ? safeLabel(config, calls[calls.length - 1]) : null;
  const icons = game.card_mode === "words" && game.show_pictures ? game.word_icons : null;

  const takeOver = async () => {
    if (s.control === "ask_to_take_over" && !confirm(`Take over from ${game.host_name ?? "the current host"}? They're still active.`)) return;
    await act("take", { action: "take_over", force: s.control === "ask_to_take_over" }, "You have the controls.");
  };

  const copyCalls = async () => {
    try {
      await navigator.clipboard.writeText(calls.map((v) => safeLabel(config, v)).join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setMessage({ ok: false, text: "Couldn't copy. Select the calls and copy them by hand." });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/bingo-night" className="text-sm text-gnome-green hover:underline">
            ← All games
          </Link>
          <h1 className="font-display text-3xl text-gnome-green">{plainBangs(game.name)}</h1>
          <p className="text-sm text-bark-brown-light">
            {live ? "Live" : game.status === "draft" ? "Draft (not launched)" : "Finished"} · {game.card_mode === "numbers" ? "Number cards" : `Word cards (${game.words?.length ?? 0} words)`} · {s.players}{" "}
            {s.players === 1 ? "player" : "players"} · {s.cardsMade} cards made
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/bingo-night/display" target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" size="sm">
              Open stream view
            </Button>
          </a>
          <a href="/bingo-night" target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm">
              Player page
            </Button>
          </a>
        </div>
      </div>

      {live && (
        <div className={`rounded-md px-4 py-2 text-sm flex flex-wrap items-center justify-between gap-2 ${isHost ? "bg-gnome-green/10 text-gnome-green" : "bg-gold/20 text-bark-brown"}`}>
          <span>{isHost ? "You have the controls." : `${game.host_name ?? "Another staff member"} is hosting. You're watching read-only.`}</span>
          {!isHost && (
            <Button size="sm" onClick={takeOver} disabled={!!busy}>
              Take over
            </Button>
          )}
        </div>
      )}
      {loadError && <p className="text-sm text-red-accent">{loadError}</p>}
      {message && <p className={`text-sm ${message.ok ? "text-gnome-green" : "text-red-accent"}`}>{message.text}</p>}
      {s.duplicateRsns.length > 0 && <p className="text-sm text-bark-brown">⚠️ On more than one card: {s.duplicateRsns.join(", ")}</p>}

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Calling */}
        <Card hover={false} className="lg:col-span-3 space-y-4">
          {!live ? (
            <p className="text-sm text-bark-brown-light">{game.status === "draft" ? "Launch this game from the games list to start calling." : "This game has ended. The rounds and winners are below."}</p>
          ) : !round || round.status === "closed" ? (
            <>
              <h2 className="font-display text-xl text-bark-brown">Open round {nextNumber}</h2>
              {round && (
                <p className="text-sm text-bark-brown-light">
                  Round {round.number} is over{s.rounds.at(-1)?.winners.length ? `. Winner: ${s.rounds.at(-1)?.winners.join(", ")}` : " with no confirmed winner"}.
                </p>
              )}
              <PatternMenu mode={game.card_mode} value={pattern} onChange={setPattern} />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => act("open", { action: "open_round", pattern })} disabled={!canAct}>
                  {busy === "open" ? "Opening..." : `Open round ${nextNumber}`}
                </Button>
                <Button
                  variant="ghost"
                  disabled={!canAct}
                  onClick={() => confirm("End the whole game? The bingo page closes for everyone.") && act("end_game", { action: "end_game" }, "Game ended. Results are saved.")}
                >
                  End game
                </Button>
              </div>
              <p className="text-xs text-iron-grey">Players can get a card and swap it while the round is open.</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <PatternPicture pattern={round.pattern} size={48} />
                <div className="flex-1">
                  <h2 className="font-display text-xl text-bark-brown">
                    Round {round.number}: {patternName(round.pattern)}
                  </h2>
                  <p className="text-xs text-iron-grey">
                    {round.status === "open" ? "Open: players are getting and swapping cards." : "Live: cards are locked and BINGO is open."} · ~{PATTERN_TIMES[round.pattern][game.card_mode]}
                  </p>
                </div>
              </div>

              {round.status === "open" ? (
                <>
                  <details className="text-sm">
                    <summary className="cursor-pointer text-gnome-green">Change the pattern</summary>
                    <div className="mt-2">
                      <PatternMenu mode={game.card_mode} value={round.pattern} onChange={(p) => act("pattern", { action: "set_pattern", pattern: p })} />
                    </div>
                  </details>
                  <Button size="lg" onClick={() => act("start", { action: "start_round" }, "Round started. Cards are locked.")} disabled={!canAct}>
                    {busy === "start" ? "Starting..." : "Start round"}
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={() => act("draw", { action: "draw", expected: calls.length })}
                      disabled={!canAct}
                      className="px-10 py-5 rounded-xl bg-gnome-green text-white font-display text-3xl shadow-md hover:brightness-110 disabled:opacity-50"
                    >
                      {busy === "draw" ? "Drawing…" : "Draw"}
                    </button>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-iron-grey">Last call ({calls.length})</p>
                      <p className="font-display text-4xl text-bark-brown leading-none flex items-center gap-2">
                        <WikiIcon src={calls.length ? icons?.[calls[calls.length - 1]] : null} size={36} />
                        {lastLabel ?? "–"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!canAct || !calls.length || (s.rounds.at(-1)?.winners.length ?? 0) > 0}
                      onClick={() => confirm(`Undo the last call (${lastLabel})?`) && act("undo", { action: "undo", expected: calls.length }, "Call taken back. Waiting claims were rechecked.")}
                    >
                      Undo last call
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!canAct}
                      onClick={() =>
                        confirm(pending.length ? `${pending.length} claim(s) are still waiting. End the round anyway?` : `End round ${round.number}?`) &&
                        act("end_round", { action: "end_round" }, "Round ended.")
                      }
                    >
                      End round
                    </Button>
                  </div>
                </>
              )}

              {calls.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs uppercase tracking-wide text-iron-grey">Call log</p>
                    <button type="button" onClick={copyCalls} className="text-xs text-gnome-green hover:underline">
                      {copied ? "Copied!" : "Copy all"}
                    </button>
                  </div>
                  <ol className="flex flex-wrap gap-1.5">
                    {calls.map((v, i) => (
                      <li key={v} className={`text-xs px-2 py-1 rounded ${i === calls.length - 1 ? "bg-gnome-green text-white" : "bg-bark-brown-light/15 text-bark-brown"}`}>
                        <span className="opacity-60">{i + 1}.</span> <WikiIcon src={icons?.[v]} size={14} className="align-[-2px]" /> {safeLabel(config, v)}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Claims */}
        <Card hover={false} className="lg:col-span-2 space-y-3">
          <h2 className="font-display text-xl text-bark-brown">
            Claims{pending.length > 0 && <span className="ml-2 text-sm font-sans px-2 py-0.5 rounded-full bg-gold/30 text-bark-brown">{pending.length} waiting</span>}
          </h2>
          {!round ? (
            <p className="text-sm text-iron-grey">Claims show here once a round is live.</p>
          ) : s.claims.length === 0 ? (
            <p className="text-sm text-iron-grey">No BINGO presses yet this round.</p>
          ) : (
            <ul className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
              {[...s.claims]
                .sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || (a.wonAtCall ?? 999) - (b.wonAtCall ?? 999))
                .map((c) => {
                  const open = openClaim === c.id;
                  return (
                    <li key={c.id} className={`rounded-md border p-2 ${c.status === "pending" ? "border-gold" : "border-bark-brown-light/30"}`}>
                      <button type="button" className="w-full text-left flex items-center gap-2" onClick={() => setOpenClaim(open ? null : c.id)}>
                        <span className="flex-1 min-w-0">
                          <span className="font-semibold text-bark-brown">{c.rsn}</span>
                          {c.member && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gnome-green/15 text-gnome-green align-middle">member</span>}
                          {c.duplicateRsn && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gold/30 text-bark-brown align-middle">2+ cards</span>}
                          <span className="block text-xs text-iron-grey">
                            {time(c.createdAt)} · at call {c.callCount}
                            {c.valid && c.wonAtCall != null && ` · had it at call ${c.wonAtCall}`}
                          </span>
                        </span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.valid ? "bg-gnome-green/15 text-gnome-green" : "bg-red-accent/10 text-red-accent"}`}>{c.valid ? "Valid" : "Not valid"}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CLAIM_TONE[c.status]}`}>{CLAIM_LABEL[c.status]}</span>
                      </button>
                      {open && (
                        <div className="mt-2 space-y-2">
                          <div className="max-w-[280px] mx-auto" style={themeVars(game.theme)}>
                            <BingoCard squares={c.squares} config={config} marked={new Set(c.squares.flatMap((v, pos) => (v !== null && called.has(v) ? [pos] : [])))} outline={new Set(c.matched ?? [])} compact />
                          </div>
                          <p className="text-xs text-iron-grey text-center">Called squares are filled; the winning squares are outlined.</p>
                          {c.note && <p className="text-xs text-bark-brown-light">Note: {c.note}</p>}
                          {c.reviewedBy && <p className="text-xs text-iron-grey">Reviewed by {c.reviewedBy}</p>}
                          {live && (c.status === "pending" || c.status === "confirmed") && round.id === s.game.current_round_id && (
                            <>
                              <input
                                className="w-full px-2 py-1 rounded-md border border-bark-brown-light bg-parchment text-sm"
                                placeholder="Note (optional)"
                                value={notes[c.id] ?? ""}
                                onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })}
                              />
                              <div className="flex gap-2">
                                {c.status === "pending" && c.valid && (
                                  <Button size="sm" disabled={!canAct} onClick={() => act(`confirm-${c.id}`, { action: "confirm", claimId: c.id, note: notes[c.id] }, `${c.rsn} confirmed as a winner.`)}>
                                    Confirm winner
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost" disabled={!canAct} onClick={() => act(`reject-${c.id}`, { action: "reject", claimId: c.id, note: notes[c.id] }, "Claim rejected.")}>
                                  Reject
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
            </ul>
          )}
        </Card>
      </div>

      {live && <InviteQr />}

      {s.rounds.length > 0 && (
        <Card hover={false}>
          <h2 className="font-display text-xl text-bark-brown mb-2">Rounds</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-iron-grey border-b border-bark-brown-light/40">
                <th className="text-left py-1.5">Round</th>
                <th className="text-left py-1.5">Pattern</th>
                <th className="text-right py-1.5">Calls</th>
                <th className="text-left py-1.5 pl-4">Winners</th>
              </tr>
            </thead>
            <tbody>
              {s.rounds.map((r) => (
                <tr key={r.number} className="border-b border-bark-brown-light/20 last:border-0">
                  <td className="py-1.5">
                    {r.number}
                    {r.status !== "closed" && <span className="ml-1 text-xs text-gnome-green">({r.status})</span>}
                  </td>
                  <td className="py-1.5">{patternName(r.pattern)}</td>
                  <td className="py-1.5 text-right font-stats">{r.calls}</td>
                  <td className="py-1.5 pl-4">{r.winners.join(", ") || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
