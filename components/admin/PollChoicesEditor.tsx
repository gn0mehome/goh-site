"use client";

import { SKILLS, BOSSES, MetricProps } from "@wise-old-man/utils";
import { bossDifficulty, bossTitleName, DIFFICULTY_LABEL, type BossTiers, type BossTitleNames, type Difficulty } from "@/lib/boss-difficulty";

export interface PollChoice {
  /** One skill, or one or two bosses (e.g. Nightmare + Phosani's Nightmare makes two competitions). */
  metrics: string[];
  /** What the poll answer says. Follows the picks until it's typed over. */
  label: string;
  labelAuto: boolean;
}

const inputClass = "px-3 py-2 rounded-md border border-bark-brown-light bg-parchment text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-gnome-green";
export const MAX_POLL_CHOICES = 10;
const MAX_LABEL = 55;

const skillName = (m: string) => (MetricProps as Record<string, { name: string }>)[m]?.name ?? m;

/** The poll answer for a set of picks: "Vorkath", or "Nightmare + Phosani's Nightmare". */
export function choiceLabel(kind: "sotw" | "botw", metrics: string[], names: BossTitleNames): string {
  return metrics.filter(Boolean).map((m) => (kind === "botw" ? bossTitleName(m, names) : skillName(m))).join(" + ").slice(0, MAX_LABEL);
}

/**
 * The weekly voting poll's options, picked from the same skill and boss lists
 * as the competition builder, so the winner can be set up automatically.
 */
export function PollChoicesEditor({
  kind,
  choices,
  onChange,
  tiers,
  names,
  suggestedTier,
}: {
  kind: "sotw" | "botw";
  choices: PollChoice[];
  onChange: (next: PollChoice[]) => void;
  tiers: BossTiers;
  names: BossTitleNames;
  suggestedTier: Difficulty | null;
}) {
  const set = (i: number, patch: Partial<PollChoice>) =>
    onChange(
      choices.map((c, idx) => {
        if (idx !== i) return c;
        const next = { ...c, ...patch };
        if (patch.metrics && next.labelAuto) next.label = choiceLabel(kind, next.metrics, names);
        return next;
      }),
    );
  const add = () => onChange([...choices, { metrics: [], label: "", labelAuto: true }]);
  const remove = (i: number) => onChange(choices.filter((_, idx) => idx !== i));

  const order: Difficulty[] = suggestedTier === "easy" ? ["easy", "hard"] : ["hard", "easy"];
  const bossName = (m: string) => bossTitleName(m, names);
  const options = (exclude: string[]) =>
    kind === "sotw"
      ? SKILLS.filter((s) => s !== "overall" && !exclude.includes(s)).map((m) => (
          <option key={m} value={m}>
            {skillName(m)}
          </option>
        ))
      : order.map((tier) => (
          <optgroup key={tier} label={`${DIFFICULTY_LABEL[tier]} bosses${tier === suggestedTier ? " (this poll's turn)" : ""}`}>
            {(BOSSES as readonly string[])
              .filter((b) => bossDifficulty(b, tiers) === tier && !exclude.includes(b))
              .sort((a, b) => bossName(a).localeCompare(bossName(b)))
              .map((m) => (
                <option key={m} value={m}>
                  {bossName(m)}
                </option>
              ))}
          </optgroup>
        ));

  const labels = choices.map((c) => c.label.trim().toLowerCase()).filter(Boolean);
  const duplicate = labels.length !== new Set(labels).size;

  return (
    <div className="space-y-2">
      {choices.map((c, i) => (
        <div key={i} className="rounded-md border border-bark-brown-light/40 p-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-iron-grey w-5">{i + 1}.</span>
            <select
              value={c.metrics[0] ?? ""}
              onChange={(e) => set(i, { metrics: [e.target.value, ...c.metrics.slice(1)].filter(Boolean) })}
              className={`${inputClass} flex-1 min-w-[10rem] cursor-pointer`}
              aria-label={`Option ${i + 1} ${kind === "sotw" ? "skill" : "boss"}`}
            >
              <option value="">{kind === "sotw" ? "Pick a skill" : "Pick a boss"}</option>
              {options(choices.flatMap((x, idx) => (idx === i ? x.metrics.slice(1) : [])))}
            </select>
            {kind === "botw" &&
              (c.metrics.length > 1 ? (
                <>
                  <span className="text-xs text-iron-grey">+</span>
                  <select
                    value={c.metrics[1]}
                    onChange={(e) => set(i, { metrics: [c.metrics[0], e.target.value].filter(Boolean) })}
                    className={`${inputClass} flex-1 min-w-[10rem] cursor-pointer`}
                    aria-label={`Option ${i + 1} second boss`}
                  >
                    <option value="">No second boss</option>
                    {options([c.metrics[0]])}
                  </select>
                </>
              ) : (
                c.metrics[0] && (
                  <button type="button" onClick={() => set(i, { metrics: [c.metrics[0], ""] })} className="text-xs text-gnome-green hover:underline">
                    + second boss
                  </button>
                )
              ))}
            <button type="button" onClick={() => remove(i)} className="ml-auto text-xs text-red-accent hover:underline" aria-label={`Remove option ${i + 1}`}>
              Remove
            </button>
          </div>
          <div className="flex items-center gap-2 pl-7">
            <span className="text-xs text-iron-grey shrink-0">Poll says</span>
            <input
              type="text"
              value={c.label}
              maxLength={MAX_LABEL}
              onChange={(e) => set(i, { label: e.target.value, labelAuto: false })}
              className={`${inputClass} flex-1 py-1`}
              placeholder={kind === "sotw" ? "Skill name" : "Boss name"}
            />
            {!c.labelAuto && c.metrics.filter(Boolean).length > 0 && (
              <button type="button" onClick={() => set(i, { label: choiceLabel(kind, c.metrics.filter(Boolean), names), labelAuto: true })} className="text-xs text-gnome-green hover:underline shrink-0">
                reset
              </button>
            )}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        {choices.length < MAX_POLL_CHOICES && (
          <button type="button" onClick={add} className="text-sm text-gnome-green hover:underline">
            + Add an option
          </button>
        )}
        <span className="text-xs text-iron-grey">2-10 options. Two bosses in one option make two competitions if it wins.</span>
      </div>
      {duplicate && <p className="text-xs text-red-accent">Two options say the same thing; Discord needs each answer to be different.</p>}
    </div>
  );
}
