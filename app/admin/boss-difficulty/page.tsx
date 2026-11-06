"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/admin/bingo/BasicsStep";
import { bossDifficulty, bossGroups, bossName, DIFFICULTIES, DIFFICULTY_LABEL, type BossTiers, type Difficulty } from "@/lib/boss-difficulty";
import { cn } from "@/lib/utils";

type Show = "all" | Difficulty | "unsaved";

export default function BossDifficultyPage() {
  const groups = useMemo(() => bossGroups(), []);
  const [saved, setSaved] = useState<BossTiers | null>(null);
  const [draft, setDraft] = useState<BossTiers>({});
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/boss-difficulty")
      .then((r) => r.json())
      .then((d: { tiers?: BossTiers }) => {
        if (cancelled) return;
        setSaved(d.tiers ?? {});
        // Every boss starts at its saved tier, or the suggestion if it's never been set.
        setDraft(Object.fromEntries(groups.flatMap((g) => g.metrics).map((m) => [m, bossDifficulty(m, d.tiers ?? {})])));
      })
      .catch(() => !cancelled && setSaved({}));
    return () => {
      cancelled = true;
    };
  }, [groups]);

  const set = (metric: string, d: Difficulty) => {
    setDraft((x) => ({ ...x, [metric]: d }));
    setStatus(null);
  };

  const all = groups.flatMap((g) => g.metrics);
  // A change is a boss set differently from what's in use now (its saved tier, or the suggestion).
  const changed = saved ? all.filter((m) => bossDifficulty(m, saved) !== draft[m]) : [];
  const neverSet = saved ? all.filter((m) => !saved[m]).length : 0;
  const counts = { easy: all.filter((m) => draft[m] === "easy").length, hard: all.filter((m) => draft[m] === "hard").length };

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/admin/boss-difficulty", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tiers: draft }) });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setStatus({ ok: false, text: json.error ?? "Couldn't save." });
    setSaved({ ...draft });
    setStatus({ ok: true, text: "Saved. The SOTW & BotW Dashboard tab uses these straight away." });
  };

  const q = query.trim().toLowerCase();
  const visible = (m: string) =>
    (!q || bossName(m).toLowerCase().includes(q)) && (show === "all" || (show === "unsaved" ? !saved?.[m] || bossDifficulty(m, saved) !== draft[m] : draft[m] === show));

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="font-display text-3xl text-gnome-green">Boss Difficulty</h1>
        <p className="text-bark-brown-light max-w-3xl">
          Boss of the Week runs an easy / hard rotation. Mark each boss and raid as Easy or Hard here, and the{" "}
          <Link href="/admin/competition-insights" className="text-gnome-green hover:underline">
            SOTW &amp; BotW
          </Link>{" "}
          Dashboard tab compares easy weeks with hard weeks. If one week was different from usual, you can change just that week on the Dashboard.
        </p>
      </div>

      {saved === null ? (
        <p className="text-sm text-iron-grey">Loading...</p>
      ) : (
        <>
          <Card hover={false} className="flex flex-wrap items-center gap-3">
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a boss or raid" aria-label="Find a boss or raid" className={`${inputClass} sm:w-64`} />
            <div className="flex flex-wrap gap-1" role="group" aria-label="Show">
              {(["all", "easy", "hard", "unsaved"] as Show[]).map((s) => (
                <Button key={s} size="sm" variant={show === s ? "primary" : "ghost"} onClick={() => setShow(s)} aria-pressed={show === s}>
                  {s === "all" ? "All" : s === "unsaved" ? "Not saved yet" : DIFFICULTY_LABEL[s]}
                </Button>
              ))}
            </div>
            <p className="ml-auto text-sm text-bark-brown">
              <b>{counts.easy}</b> easy · <b>{counts.hard}</b> hard
            </p>
          </Card>

          {neverSet > 0 && (
            <p className="text-sm text-bark-brown-light">
              {neverSet === all.length
                ? "Nothing's been saved yet, so every boss shows a suggestion. Change any that are wrong, then press Save."
                : `${neverSet} ${neverSet === 1 ? "boss shows" : "bosses show"} a suggestion because ${neverSet === 1 ? "it hasn't" : "they haven't"} been saved yet.`}
            </p>
          )}

          {groups.map((g) => {
            const rows = g.metrics.filter(visible);
            if (rows.length === 0) return null;
            return (
              <Card key={g.label} hover={false}>
                <h2 className="font-display text-xl text-bark-brown mb-3">{g.label}</h2>
                <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
                  {rows.map((m) => (
                    <li key={m} className="flex items-center justify-between gap-3 py-1.5 border-b border-bark-brown-light/20">
                      <span className="text-sm text-bark-brown min-w-0">
                        {bossName(m)}
                        {!saved[m] && bossDifficulty(m, saved) === draft[m] && <span className="ml-1.5 text-[11px] text-iron-grey">suggested</span>}
                        {bossDifficulty(m, saved) !== draft[m] && <span className="ml-1.5 text-[11px] text-gold-display font-semibold">changed</span>}
                      </span>
                      <span className="inline-flex shrink-0 rounded-md border border-bark-brown-light/60 overflow-hidden" role="radiogroup" aria-label={`${bossName(m)} difficulty`}>
                        {DIFFICULTIES.map((d) => (
                          <button
                            key={d}
                            type="button"
                            role="radio"
                            aria-checked={draft[m] === d}
                            onClick={() => set(m, d)}
                            className={cn(
                              "px-3 py-1 text-xs font-semibold transition-colors",
                              draft[m] === d ? (d === "hard" ? "bg-[var(--viz-hard)] text-white" : "bg-[var(--viz-easy)] text-[#1a1a1a]") : "text-bark-brown hover:bg-parchment-dark/60",
                            )}
                          >
                            {DIFFICULTY_LABEL[d]}
                          </button>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}

          <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-bark-brown-light bg-parchment/95 backdrop-blur px-4 py-3">
            <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-end gap-3">
              {status ? (
                <span className={`text-sm ${status.ok ? "text-gnome-green" : "text-red-accent"}`}>{status.text}</span>
              ) : (
                <span className="text-sm text-iron-grey">
                  {[
                    changed.length > 0 && `${changed.length} unsaved ${changed.length === 1 ? "change" : "changes"}`,
                    neverSet > 0 && `${neverSet} still on the suggestion`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Everything's saved"}
                </span>
              )}
              <Button onClick={save} disabled={saving || (changed.length === 0 && neverSet === 0)}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
