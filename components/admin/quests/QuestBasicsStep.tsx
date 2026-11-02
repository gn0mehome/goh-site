"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { Field, inputClass } from "@/components/admin/bingo/BasicsStep";
import { DIFFICULTIES, DIFFICULTY_COLOR, eventQuests, questPoints, type QuestScoring } from "@/lib/quests";
import type { AdminQuestEvent } from "./QuestBuilder";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SCORING: [QuestScoring, string, string][] = [
  ["difficulty", "By difficulty", "Harder quests are worth more. You set the points for each difficulty."],
  ["qp", "By quest points", "Each quest scores its in-game quest points (Cook's Assistant 1, Monkey Madness I 3...)."],
  ["flat", "Same for every quest", "Every finished quest scores the same. Good for a most-quests race."],
];

/** A clickable card standing in for a radio button. */
export function ChoiceCard({ checked, disabled, onPick, title, text, name }: { checked: boolean; disabled?: boolean; onPick: () => void; title: string; text: string; name: string }) {
  return (
    <label
      className={`rounded-md border p-3 text-sm ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"} ${checked ? "border-gnome-green bg-gnome-green/10" : "border-bark-brown-light/40 hover:bg-parchment-dark/40"}`}
    >
      <input type="radio" name={name} className="sr-only" checked={checked} disabled={disabled} onChange={onPick} />
      <span className="font-semibold text-bark-brown">{title}</span>
      <span className="block text-xs text-iron-grey mt-0.5">{text}</span>
    </label>
  );
}

export function QuestBasicsStep({ data, onSaved, onNext }: { data: AdminQuestEvent; onSaved: () => Promise<void>; onNext: () => void }) {
  const { event } = data;
  const [form, setForm] = useState({
    name: event.name,
    description: event.description ?? "",
    rules: event.rules ?? "",
    banner: event.banner_url ? [event.banner_url] : ([] as string[]),
    starts: toLocalInput(event.starts_at),
    ends: toLocalInput(event.ends_at),
    format: event.format,
    scoring: event.scoring,
    difficultyPoints: Object.fromEntries(DIFFICULTIES.map((d) => [d, Number(event.difficulty_points?.[d] ?? 0)])) as Record<string, number>,
    flatPoints: event.flat_points,
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setStatus(null);
  };
  const locked = event.status === "active" || event.status === "completed";

  // Live preview with the unsaved scoring.
  const preview = { ...event, scoring: form.scoring, difficulty_points: form.difficultyPoints, flat_points: form.flatPoints };
  const quests = eventQuests(event);
  const total = quests.reduce((s, q) => s + questPoints(preview, q), 0);
  const samples = ["Cook's Assistant", "Dragon Slayer I", "Monkey Madness II", "Desert Treasure II - The Fallen Empire"]
    .map((n) => quests.find((q) => q.name === n))
    .filter((q): q is (typeof quests)[number] => !!q);
  const examples = samples.length >= 2 ? samples : quests.slice(0, 4);

  const save = async (andNext = false) => {
    setSaving(true);
    const res = await fetch(`/api/admin/quests/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description,
        rules: form.rules,
        banner_url: form.banner[0] ?? null,
        starts_at: form.starts ? new Date(form.starts).toISOString() : null,
        ends_at: form.ends ? new Date(form.ends).toISOString() : null,
        format: form.format,
        scoring: form.scoring,
        difficulty_points: form.difficultyPoints,
        flat_points: form.flatPoints,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setStatus({ ok: false, text: json.error ?? "Couldn't save." });
    await onSaved();
    setStatus({ ok: true, text: "Saved." });
    if (andNext) onNext();
  };

  return (
    <div className="space-y-5">
      <Card hover={false} className="space-y-4">
        <Field label="Name">
          <input value={form.name} maxLength={100} onChange={(e) => set("name", e.target.value)} className={inputClass} />
        </Field>
        <Field label="Short description" hint="Shown on the Contests page and at the top of the event.">
          <textarea value={form.description} rows={2} maxLength={2000} onChange={(e) => set("description", e.target.value)} className={inputClass} placeholder="Two weeks to knock out as many quests as you can. Harder quests score more." />
        </Field>
        <Field label="Rules" hint="Shown on the event's Rules tab. Line breaks are kept.">
          <textarea
            value={form.rules}
            rows={5}
            maxLength={4000}
            onChange={(e) => set("rules", e.target.value)}
            className={inputClass}
            placeholder={"Install the WikiSync plugin in RuneLite so your quests count by themselves.\nNo RuneLite? Screenshot the quest complete scroll with your name visible.\nOnly quests finished during the event count."}
          />
        </Field>
        <ImageUploader images={form.banner} onChange={(v) => set("banner", v)} maxImages={1} label="Banner image (optional)" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts" hint="Quests finished before this don't count. Leave empty to start when it goes live.">
            <input type="datetime-local" value={form.starts} onChange={(e) => set("starts", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Ends" hint="Quests finished after this don't count.">
            <input type="datetime-local" value={form.ends} onChange={(e) => set("ends", e.target.value)} className={inputClass} />
          </Field>
        </div>
      </Card>

      <Card hover={false} className="space-y-4">
        <h2 className="font-display text-xl text-bark-brown">Format</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <ChoiceCard name="format" checked={form.format === "solo"} disabled={locked} onPick={() => set("format", "solo")} title="Solo" text="Everyone plays for themselves. One leaderboard of players." />
          <ChoiceCard name="format" checked={form.format === "teams"} disabled={locked} onPick={() => set("format", "teams")} title="Teams" text="Players are split into teams and every member's quests add to the team total." />
        </div>
        {locked && <p className="text-xs text-iron-grey">Solo or teams is fixed once the event is live.</p>}
      </Card>

      <Card hover={false} className="space-y-4">
        <h2 className="font-display text-xl text-bark-brown">Scoring</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {SCORING.map(([value, title, text]) => (
            <ChoiceCard key={value} name="scoring" checked={form.scoring === value} onPick={() => set("scoring", value)} title={title} text={text} />
          ))}
        </div>
        {form.scoring === "difficulty" && (
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {DIFFICULTIES.map((d) => (
              <label key={d} className="rounded-md border border-bark-brown-light/40 p-2 text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-bark-brown">
                  <span className="w-2 h-2 rounded-full" style={{ background: DIFFICULTY_COLOR[d] }} aria-hidden />
                  {d}
                </span>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={form.difficultyPoints[d]}
                  onChange={(e) => set("difficultyPoints", { ...form.difficultyPoints, [d]: Number(e.target.value) })}
                  className={`${inputClass} mt-1 py-1`}
                  aria-label={`Points for a ${d} quest`}
                />
              </label>
            ))}
          </div>
        )}
        {form.scoring === "flat" && (
          <Field label="Points per quest">
            <input type="number" min={0} max={1000} value={form.flatPoints} onChange={(e) => set("flatPoints", Number(e.target.value))} className={`${inputClass} sm:w-32`} />
          </Field>
        )}
        <div className="rounded-md bg-parchment-dark/40 p-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-iron-grey mb-1.5">How it scores</p>
          <ul className="space-y-0.5">
            {examples.map((q) => (
              <li key={q.name} className="flex justify-between gap-3">
                <span className="text-bark-brown truncate">
                  {q.name} <span className="text-xs text-iron-grey">· {q.difficulty}, {q.qp} QP</span>
                </span>
                <span className="font-semibold tabular-nums text-gnome-green shrink-0">{questPoints(preview, q)} {questPoints(preview, q) === 1 ? "pt" : "pts"}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-iron-grey mt-2">
            All {quests.length} quests in this event: {total.toLocaleString()} points possible per player.
          </p>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={saving} onClick={() => save(true)}>
          {saving ? "Saving..." : "Save and pick quests"}
        </Button>
        <Button variant="ghost" disabled={saving} onClick={() => save(false)}>
          Save
        </Button>
        {status && <span className={`text-sm ${status.ok ? "text-gnome-green" : "text-red-accent"}`}>{status.text}</span>}
      </div>
    </div>
  );
}
