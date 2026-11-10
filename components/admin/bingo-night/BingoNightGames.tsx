"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MAX_WORDS, MAX_WORD_LENGTH, MIN_WORDS, validateWords } from "@/lib/bingo-night/core";
import { BINGO_THEME_CHOICES, bingoThemeName, themeProps } from "@/lib/bingo-night/themes";
import type { GameRow } from "@/lib/bingo-night/server";
import { InviteQr } from "./InviteQr";
import { WikiIcon } from "@/components/bingo-night/WikiIcon";

const inputClass = "w-full px-3 py-2 rounded-md border border-bark-brown-light bg-parchment text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-gnome-green";

interface Draft {
  id: string | null;
  name: string;
  theme: string;
  card_mode: "numbers" | "words";
  word_set: string; // a saved word list's id, or "custom"
  words: string;
  winner_message: string;
  scheduled_for: string; // datetime-local
  status: GameRow["status"];
  /** Word games: show OSRS Wiki item pictures. */
  show_pictures: boolean;
  /** The pictures found for a word list (and which words they belong to). */
  pictures: { words: string[]; icons: (string | null)[] } | null;
  /** Live games keep their words; pictures line up with these. */
  liveWords?: string[] | null;
}

const EMPTY: Draft = { id: null, name: "", theme: "gnome", card_mode: "numbers", word_set: "osrs_classic", words: "", winner_message: "Meet the host at the Clan Hall to collect your prize.", scheduled_for: "", status: "draft", show_pictures: false, pictures: null };

/** A saved word list (Admin › Settings › Bingo Night Word Lists). */
export interface WordListSummary {
  id: string;
  name: string;
  words: string[];
}

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
  const [lists, setLists] = useState<WordListSummary[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/bingo-night");
    const data = await res.json().catch(() => ({}));
    setGames(res.ok ? data.games : []);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    fetch("/api/admin/bingo-night/word-lists")
      .then((r) => r.json())
      .then((d: { lists?: WordListSummary[] }) => setLists(d.lists ?? []))
      .catch(() => {});
  }, [load]);
  const listName = (id: string | null) => (id ? lists.find((l) => l.id === id)?.name ?? "a deleted list" : "own list");
  const newDraft = (): Draft => ({ ...EMPTY, word_set: lists.some((l) => l.id === EMPTY.word_set) ? EMPTY.word_set : lists[0]?.id ?? "custom" });

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
      // A list that's since been deleted: carry on with the game's own copy of its words.
      word_set: g.word_set && lists.some((l) => l.id === g.word_set) ? g.word_set : "custom",
      words: g.word_set && lists.some((l) => l.id === g.word_set) ? "" : (g.words ?? []).join("\n"),
      winner_message: g.winner_message,
      scheduled_for: toLocal(g.scheduled_for),
      status: g.status,
      show_pictures: g.show_pictures,
      pictures: g.words && g.word_icons && g.word_icons.length === g.words.length ? { words: g.words, icons: g.word_icons } : null,
      liveWords: g.status === "draft" ? null : g.words,
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
      show_pictures: draft.card_mode === "words" && draft.show_pictures,
      // Only send the preview if it's for these exact words; otherwise the server looks them up.
      word_icons: draft.pictures && sameWords(draft.pictures.words, currentWords(draft, lists)) ? draft.pictures.icons : undefined,
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
              <div className="mt-1 flex items-center gap-2">
                <select className={`${inputClass} cursor-pointer`} value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value })}>
                  {BINGO_THEME_CHOICES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <ThemeSwatch theme={draft.theme} />
              </div>
              <span className="text-xs text-iron-grey">The same themes as the site. Auto changes with the holidays.</span>
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
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <select className={`${inputClass} cursor-pointer flex-1 min-w-[12rem]`} value={draft.word_set} onChange={(e) => setDraft({ ...draft, word_set: e.target.value })}>
                    {lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.words.length} words)
                      </option>
                    ))}
                    <option value="custom">My own list (just for this game)</option>
                  </select>
                  <Link href="/admin/bingo-night/word-lists" className="text-xs text-gnome-green hover:underline">
                    Edit word lists →
                  </Link>
                </div>
                {draft.word_set === "custom" ? (
                  <>
                    <div className="flex flex-wrap gap-3 text-xs">
                      {lists.map((l) => (
                        <button key={l.id} type="button" className="text-gnome-green hover:underline" onClick={() => setDraft({ ...draft, words: l.words.join("\n") })}>
                          Start from {l.name}
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
                  <p className="text-xs text-iron-grey">{lists.find((l) => l.id === draft.word_set)?.words.join(" · ")}</p>
                )}
              </div>
            )}
          </fieldset>

          {draft.card_mode === "words" && <PicturesPanel draft={draft} setDraft={setDraft} lists={lists} />}

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
        <Button onClick={() => setDraft(newDraft())}>+ New game</Button>
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
                    {g.card_mode === "numbers" ? "Numbers" : `Words: ${listName(g.word_set)} (${g.words?.length ?? 0})`} · {bingoThemeName(g.theme)}
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

      <InviteQr />
    </div>
  );
}

/** The words a draft's cards will use. */
function currentWords(d: Draft, lists: WordListSummary[]): string[] {
  if (d.liveWords) return d.liveWords;
  if (d.word_set !== "custom") return lists.find((l) => l.id === d.word_set)?.words ?? [];
  return validateWords(d.words).words;
}
const sameWords = (a: string[], b: string[]) => a.length === b.length && a.every((w, i) => w === b[i]);

/**
 * "Show item pictures": finds each word's picture on the OSRS Wiki and shows
 * them, so staff can see what players will get and click to remove any.
 */
function PicturesPanel({ draft, setDraft, lists }: { draft: Draft; setDraft: (d: Draft) => void; lists: WordListSummary[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const words = currentWords(draft, lists);
  const fresh = !!draft.pictures && sameWords(draft.pictures.words, words);
  const found = fresh ? draft.pictures!.icons.filter(Boolean).length : 0;

  const find = async (d: Draft) => {
    const ws = currentWords(d, lists);
    if (ws.length < MIN_WORDS) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/bingo-night", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pictures", words: ws }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Couldn't find pictures.");
    setDraft({ ...d, show_pictures: true, pictures: { words: ws, icons: data.icons } });
  };

  const toggle = (on: boolean) => {
    const next = { ...draft, show_pictures: on };
    setDraft(next);
    if (on && !fresh) void find(next);
  };

  const drop = (i: number) => {
    if (!draft.pictures) return;
    const icons = [...draft.pictures.icons];
    icons[i] = null;
    setDraft({ ...draft, pictures: { ...draft.pictures, icons } });
  };

  return (
    <div className="space-y-2 rounded-md border border-bark-brown-light/40 p-3">
      <label className="flex items-center gap-2 text-sm text-bark-brown cursor-pointer">
        <input type="checkbox" checked={draft.show_pictures} onChange={(e) => toggle(e.target.checked)} className="accent-gnome-green" />
        Show item pictures from the OSRS Wiki
      </label>
      <p className="text-xs text-iron-grey">
        Words that are OSRS items (foods, gear, drops) get their inventory picture on the cards and the stream. Places, bosses and other words stay as text.
      </p>
      {draft.show_pictures && (
        <>
          {busy ? (
            <p className="text-sm text-iron-grey">Looking up pictures on the OSRS Wiki…</p>
          ) : !fresh ? (
            <Button size="sm" variant="secondary" onClick={() => find(draft)} disabled={words.length < MIN_WORDS}>
              Find pictures
            </Button>
          ) : (
            <>
              <p className="text-xs text-bark-brown">
                {found} of {words.length} words have a picture. Click one to remove its picture.{" "}
                <button type="button" className="text-gnome-green hover:underline" onClick={() => find(draft)}>
                  Look them up again
                </button>
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {words.map((w, i) => {
                  const icon = draft.pictures!.icons[i];
                  return (
                    <li key={w}>
                      <button
                        type="button"
                        disabled={!icon}
                        onClick={() => drop(i)}
                        title={icon ? "Click to remove this picture" : "No picture"}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${icon ? "border-bark-brown-light/60 bg-parchment hover:border-red-accent hover:line-through cursor-pointer" : "border-transparent text-iron-grey"}`}
                      >
                        <WikiIcon src={icon} size={22} />
                        {w}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {error && <p className="text-xs text-red-accent">{error}</p>}
        </>
      )}
    </div>
  );
}

/** A tiny look at a theme: the backdrop, a card square, a called square and the accent. */
function ThemeSwatch({ theme }: { theme: string }) {
  return (
    <span {...themeProps(theme, "shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-1")} style={{ background: "linear-gradient(160deg, var(--bn-bg2), var(--bn-bg))" }} aria-hidden>
      <span className="w-4 h-4 rounded-sm" style={{ background: "var(--bn-panel)" }} />
      <span className="w-4 h-4 rounded-sm" style={{ background: "var(--bn-hit)" }} />
      <span className="w-4 h-4 rounded-sm" style={{ background: "var(--bn-accent)" }} />
    </span>
  );
}
