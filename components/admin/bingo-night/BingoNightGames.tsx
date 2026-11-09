"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MAX_WORDS, MAX_WORD_LENGTH, MIN_WORDS, validateWords, WORD_SETS } from "@/lib/bingo-night/core";
import { BINGO_THEMES } from "@/lib/bingo-night/themes";
import type { GameRow } from "@/lib/bingo-night/server";

const inputClass = "w-full px-3 py-2 rounded-md border border-bark-brown-light bg-parchment text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-gnome-green";

interface Draft {
  id: string | null;
  name: string;
  theme: string;
  card_mode: "numbers" | "words";
  word_set: string; // a WORD_SETS key, or "custom"
  words: string;
  winner_message: string;
  scheduled_for: string; // datetime-local
  status: GameRow["status"];
}

const EMPTY: Draft = { id: null, name: "", theme: "gnome", card_mode: "numbers", word_set: "osrs_classic", words: "", winner_message: "Meet the host at the Clan Hall to collect your prize.", scheduled_for: "", status: "draft" };

const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

const STATUS: Record<GameRow["status"], { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "bg-iron-grey/15 text-iron-grey" },
  live: { label: "Live", tone: "bg-red-accent/15 text-red-accent" },
  finished: { label: "Finished", tone: "bg-gnome-green/15 text-gnome-green" },
};

/** Bingo Night games: the editor for drafts, and the list to launch, copy or open. */
export function BingoNightGames() {
  const [games, setGames] = useState<GameRow[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/bingo-night");
    const data = await res.json().catch(() => ({}));
    setGames(res.ok ? data.games : []);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const act = async (key: string, body: Record<string, unknown>, done?: string) => {
    setBusy(key);
    setMessage(null);
    const res = await fetch("/api/admin/bingo-night", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setMessage({ ok: false, text: data.error ?? "Something went wrong." });
      return null;
    }
    if (done) setMessage({ ok: true, text: done });
    await load();
    return data;
  };

  const edit = (g: GameRow) =>
    setDraft({
      id: g.id,
      name: g.name,
      theme: g.theme,
      card_mode: g.card_mode,
      word_set: g.word_set ?? "custom",
      words: g.word_set ? "" : (g.words ?? []).join("\n"),
      winner_message: g.winner_message,
      scheduled_for: toLocal(g.scheduled_for),
      status: g.status,
    });

  const save = async () => {
    if (!draft) return;
    const body = {
      action: "save",
      id: draft.id,
      name: draft.name,
      theme: draft.theme,
      card_mode: draft.card_mode,
      word_set: draft.card_mode === "words" && draft.word_set !== "custom" ? draft.word_set : null,
      words: draft.words,
      winner_message: draft.winner_message,
      scheduled_for: draft.scheduled_for ? new Date(draft.scheduled_for).toISOString() : "",
    };
    if (await act("save", body, "Saved.")) setDraft(null);
  };

  const custom = draft?.card_mode === "words" && draft.word_set === "custom" ? validateWords(draft.words) : null;
  const locked = !!draft && draft.status !== "draft";
  const live = games?.find((g) => g.status === "live");

  return (
    <div className="space-y-6">
      {live && (
        <Card hover={false} className="border-2 border-red-accent/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-red-accent">Live now</p>
              <p className="font-display text-2xl text-bark-brown">{live.name}</p>
              {live.host_name && <p className="text-sm text-bark-brown-light">Hosted by {live.host_name}</p>}
            </div>
            <div className="flex gap-2">
              <Link href={`/admin/bingo-night/${live.id}`}>
                <Button>Open host console</Button>
              </Link>
              <a href="/bingo-night/display" target="_blank" rel="noopener noreferrer">
                <Button variant="secondary">Stream view</Button>
              </a>
            </div>
          </div>
        </Card>
      )}

      {message && <p className={`text-sm ${message.ok ? "text-gnome-green" : "text-red-accent"}`}>{message.text}</p>}

      {draft ? (
        <Card hover={false} className="space-y-4">
          <h2 className="font-display text-xl text-bark-brown">{draft.id ? "Edit game" : "New game"}</h2>
          <label className="block text-sm text-bark-brown">
            Name
            <input className={`${inputClass} mt-1`} value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Friendsgiving Feast Bingo" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-bark-brown">
              Colour theme
              <select className={`${inputClass} mt-1 cursor-pointer`} value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value })}>
                {Object.entries(BINGO_THEMES).map(([k, t]) => (
                  <option key={k} value={k}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-bark-brown">
              Date and time (optional)
              <input type="datetime-local" className={`${inputClass} mt-1`} value={draft.scheduled_for} onChange={(e) => setDraft({ ...draft, scheduled_for: e.target.value })} />
              <span className="text-xs text-iron-grey">Shown on the bingo page as the next game until you launch it.</span>
            </label>
          </div>

          <fieldset className="space-y-2" disabled={locked}>
            <legend className="text-sm text-bark-brown mb-1">Card type{locked && <span className="text-xs text-iron-grey"> (can&apos;t change once launched)</span>}</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={draft.card_mode === "numbers"} onChange={() => setDraft({ ...draft, card_mode: "numbers" })} className="accent-gnome-green" />
                Numbers (G-N-O-M-E, 1–75)
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={draft.card_mode === "words"} onChange={() => setDraft({ ...draft, card_mode: "words" })} className="accent-gnome-green" />
                Words
              </label>
            </div>
            {draft.card_mode === "words" && (
              <div className="space-y-2">
                <select className={`${inputClass} cursor-pointer`} value={draft.word_set} onChange={(e) => setDraft({ ...draft, word_set: e.target.value })}>
                  {Object.entries(WORD_SETS).map(([k, s]) => (
                    <option key={k} value={k}>
                      {s.name} ({s.words.length} words)
                    </option>
                  ))}
                  <option value="custom">My own list</option>
                </select>
                {draft.word_set === "custom" ? (
                  <>
                    <div className="flex flex-wrap gap-3 text-xs">
                      {Object.entries(WORD_SETS).map(([k, s]) => (
                        <button key={k} type="button" className="text-gnome-green hover:underline" onClick={() => setDraft({ ...draft, words: s.words.join("\n") })}>
                          Start from {s.name}
                        </button>
                      ))}
                    </div>
                    <textarea className={`${inputClass} font-mono text-[13px]`} rows={10} value={draft.words} onChange={(e) => setDraft({ ...draft, words: e.target.value })} placeholder="One word or phrase per line" />
                    <p className={`text-xs ${custom?.ok ? "text-gnome-green" : "text-iron-grey"}`}>
                      {custom?.words.length ?? 0} words. {MIN_WORDS}–{MAX_WORDS} words, each up to {MAX_WORD_LENGTH} characters.
                    </p>
                    {custom && !custom.ok && custom.words.length > 0 && (
                      <ul className="text-xs text-red-accent list-disc pl-5">
                        {custom.errors.slice(0, 5).map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-iron-grey">{WORD_SETS[draft.word_set]?.words.join(" · ")}</p>
                )}
              </div>
            )}
          </fieldset>

          <label className="block text-sm text-bark-brown">
            Winner message
            <input className={`${inputClass} mt-1`} value={draft.winner_message} maxLength={300} onChange={(e) => setDraft({ ...draft, winner_message: e.target.value })} />
            <span className="text-xs text-iron-grey">Each confirmed winner sees this on their screen.</span>
          </label>
          <p className="text-xs text-iron-grey">No need to plan rounds: you pick each round&apos;s pattern when you open it.</p>
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy === "save" || !draft.name.trim() || (!!custom && !custom.ok)}>
              {busy === "save" ? "Saving..." : "Save"}
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : (
        <Button onClick={() => setDraft({ ...EMPTY })}>+ New game</Button>
      )}

      <Card hover={false}>
        <h2 className="font-display text-xl text-bark-brown mb-3">Games</h2>
        {games === null ? (
          <p className="text-sm text-iron-grey">Loading...</p>
        ) : games.length === 0 ? (
          <p className="text-sm text-iron-grey">No games yet. Press + New game to set one up.</p>
        ) : (
          <ul className="divide-y divide-bark-brown-light/30">
            {games.map((g) => (
              <li key={g.id} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-bark-brown">
                    {g.name}{" "}
                    <span className={`ml-1 text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS[g.status].tone}`}>{STATUS[g.status].label}</span>
                  </p>
                  <p className="text-xs text-iron-grey">
                    {g.card_mode === "numbers" ? "Numbers" : `Words: ${g.word_set ? WORD_SETS[g.word_set]?.name : "own list"} (${g.words?.length ?? 0})`} · {BINGO_THEMES[g.theme]?.name.split(" (")[0] ?? g.theme}
                    {g.status === "draft" && g.scheduled_for && ` · ${when(g.scheduled_for)}`}
                    {g.status === "finished" && g.ended_at && ` · played ${when(g.launched_at)}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.status === "draft" && (
                    <Button
                      size="sm"
                      disabled={!!busy || !!live}
                      title={live ? "Another game is live" : undefined}
                      onClick={async () => {
                        if (!confirm(`Launch "${g.name}"? The bingo page goes live for everyone.`)) return;
                        if (await act(`launch-${g.id}`, { action: "launch", id: g.id })) window.location.href = `/admin/bingo-night/${g.id}`;
                      }}
                    >
                      {busy === `launch-${g.id}` ? "Launching..." : "Launch"}
                    </Button>
                  )}
                  {g.status !== "draft" && (
                    <Link href={`/admin/bingo-night/${g.id}`}>
                      <Button size="sm" variant={g.status === "live" ? "primary" : "ghost"}>
                        {g.status === "live" ? "Host console" : "Results"}
                      </Button>
                    </Link>
                  )}
                  {g.status !== "finished" && (
                    <Button size="sm" variant="ghost" onClick={() => edit(g)}>
                      Edit
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act(`copy-${g.id}`, { action: "copy", id: g.id }, "Copied. The copy is a new draft.")}>
                    Copy
                  </Button>
                  {g.status !== "live" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!busy}
                      onClick={() => confirm(`Delete "${g.name}"${g.status === "finished" ? " and its results" : ""}?`) && act(`del-${g.id}`, { action: "delete", id: g.id }, "Deleted.")}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
