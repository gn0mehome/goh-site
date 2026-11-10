"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MAX_WORDS, MAX_WORD_LENGTH, MIN_WORDS, validateWords } from "@/lib/bingo-night/core";

const inputClass = "w-full px-3 py-2 rounded-md border border-bark-brown-light bg-parchment text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-gnome-green";

interface WordList {
  id: string;
  name: string;
  words: string[];
  updated_at: string | null;
  updated_by: string | null;
}

interface Draft {
  id: string | null;
  name: string;
  words: string;
}

/** Admin › Settings › Bingo Night Word Lists: create, edit, copy and delete the lists. */
export function WordListsEditor() {
  const [lists, setLists] = useState<WordList[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/bingo-night/word-lists");
    const data = await res.json().catch(() => ({}));
    setLists(res.ok ? data.lists : []);
    if (!res.ok) setMessage({ ok: false, text: data.error ?? "Couldn't load the lists." });
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const post = async (key: string, body: Record<string, unknown>, done: string) => {
    setBusy(key);
    setMessage(null);
    const res = await fetch("/api/admin/bingo-night/word-lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setMessage({ ok: false, text: data.error ?? "Something went wrong." });
      return false;
    }
    setMessage({ ok: true, text: done });
    await load();
    return true;
  };

  const checked = draft ? validateWords(draft.words) : null;
  const save = async () => {
    if (!draft) return;
    if (await post("save", { action: "save", id: draft.id, name: draft.name, words: draft.words }, `Saved "${draft.name.trim()}".`)) setDraft(null);
  };
  const copyName = (name: string) => {
    const taken = new Set((lists ?? []).map((l) => l.name.toLowerCase()));
    let n = `${name} (copy)`.slice(0, 60);
    for (let i = 2; taken.has(n.toLowerCase()); i++) n = `${name} (copy ${i})`.slice(0, 60);
    return n;
  };

  return (
    <div className="space-y-6">
      {message && <p className={`text-sm ${message.ok ? "text-gnome-green" : "text-red-accent"}`}>{message.text}</p>}

      {draft ? (
        <Card hover={false} className="space-y-4">
          <h2 className="font-display text-xl text-bark-brown">{draft.id ? "Edit list" : "New list"}</h2>
          <label className="block text-sm text-bark-brown">
            Name
            <input className={`${inputClass} mt-1`} value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Wintertodt Bingo" />
          </label>
          <label className="block text-sm text-bark-brown">
            Words
            <textarea
              className={`${inputClass} mt-1 font-mono text-[13px]`}
              rows={14}
              value={draft.words}
              onChange={(e) => setDraft({ ...draft, words: e.target.value })}
              placeholder={"One word or phrase per line, e.g.\nAbyssal whip\nZulrah\nClue scroll"}
            />
          </label>
          <p className={`text-xs ${checked?.ok ? "text-gnome-green" : "text-iron-grey"}`}>
            {checked?.words.length ?? 0} words. A list needs {MIN_WORDS}–{MAX_WORDS} words (a card has {MIN_WORDS} squares), each up to {MAX_WORD_LENGTH} characters. Blank
            lines are ignored.
          </p>
          {checked && !checked.ok && checked.words.length > 0 && (
            <ul className="text-xs text-red-accent list-disc pl-5">
              {checked.errors.slice(0, 6).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy === "save" || !draft.name.trim() || !checked?.ok}>
              {busy === "save" ? "Saving..." : "Save list"}
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setDraft({ id: null, name: "", words: "" })}>+ New list</Button>
          <Link href="/admin/bingo-night" className="text-sm text-gnome-green hover:underline">
            ← Back to Bingo Night games
          </Link>
        </div>
      )}

      <Card hover={false}>
        <h2 className="font-display text-xl text-bark-brown mb-3">Lists</h2>
        {lists === null ? (
          <p className="text-sm text-iron-grey">Loading...</p>
        ) : lists.length === 0 ? (
          <p className="text-sm text-iron-grey">No word lists yet. Press + New list to make one.</p>
        ) : (
          <ul className="divide-y divide-bark-brown-light/30">
            {lists.map((l) => (
              <li key={l.id} className="py-3 space-y-1">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-bark-brown">{l.name}</p>
                    <p className="text-xs text-iron-grey">
                      {l.words.length} words
                      {l.updated_at && ` · changed ${new Date(l.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}
                      {l.updated_by && ` by ${l.updated_by}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setDraft({ id: l.id, name: l.name, words: l.words.join("\n") })}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDraft({ id: null, name: copyName(l.name), words: l.words.join("\n") })}>
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!busy}
                      onClick={() => confirm(`Delete the "${l.name}" list? Games already set up with it keep their words.`) && post(`del-${l.id}`, { action: "delete", id: l.id }, `Deleted "${l.name}".`)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-bark-brown-light line-clamp-2">{l.words.join(" · ")}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
