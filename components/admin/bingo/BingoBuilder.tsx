"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { STATUS_LABELS, type BingoEvent, type BingoProgress, type BingoTeam, type BingoTile, type TeamScore } from "@/lib/bingo";
import { BasicsStep } from "./BasicsStep";
import { BoardStep } from "./BoardStep";
import { TeamsStep } from "./TeamsStep";
import { LaunchStep } from "./LaunchStep";

export interface AdminBingo {
  event: BingoEvent;
  teams: BingoTeam[];
  tiles: BingoTile[];
  progress: BingoProgress[];
  standings: TeamScore[];
  signups: { rsn: string; note: string | null; created_at: string; onTeam: boolean }[];
  pendingCount: number;
  launchProblems: string[];
}

const STEPS = [
  { key: "basics", label: "Basics" },
  { key: "board", label: "Board" },
  { key: "teams", label: "Sign-ups & teams" },
  { key: "launch", label: "Launch" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

export const STATUS_CHIP: Record<BingoEvent["status"], string> = {
  draft: "bg-iron-grey/15 text-iron-grey",
  signups: "bg-gold/15 text-gold",
  active: "bg-gnome-green/15 text-gnome-green",
  completed: "bg-bark-brown/10 text-bark-brown",
};

async function fetchBingo(id: string) {
  const res = await fetch(`/api/admin/bingo/${id}`);
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
}

/** The staff side of one bingo: basics, board, teams and launch, as steps that save as you go. */
export function BingoBuilder({ id }: { id: string }) {
  const [data, setData] = useState<AdminBingo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<StepKey>("basics");
  const opened = useRef(false);

  const apply = useCallback((res: { ok: boolean; json: AdminBingo & { error?: string } }) => {
    if (!res.ok) return setError(res.json.error ?? "Couldn't load this bingo.");
    setData(res.json);
    // First load: open on the step that needs work (the board until it's full, launch once it's running).
    if (opened.current) return;
    opened.current = true;
    const { event, tiles } = res.json;
    if (event.status === "active" || event.status === "completed") setStep("launch");
    else if (tiles.length > 0 && tiles.length < event.grid_size * event.grid_size) setStep("board");
  }, []);

  const reload = useCallback(async () => apply(await fetchBingo(id)), [id, apply]);

  useEffect(() => {
    let cancelled = false;
    fetchBingo(id).then((res) => !cancelled && apply(res));
    return () => {
      cancelled = true;
    };
  }, [id, apply]);

  if (!data) return <p className="text-sm text-iron-grey py-10 text-center">{error ?? "Loading..."}</p>;
  const { event } = data;
  const squares = event.grid_size * event.grid_size;
  const done: Record<StepKey, boolean> = {
    basics: !!event.ends_at,
    board: data.tiles.length === squares,
    teams: data.teams.length >= 2 && data.teams.every((t) => t.members.length > 0),
    launch: event.status === "active" || event.status === "completed",
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/admin/bingo" className="text-xs text-gnome-green hover:underline">← All clan bingos</Link>
          <h1 className="font-display text-3xl text-gnome-green break-words">{event.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
            <span className={`px-2 py-0.5 rounded-full font-semibold ${STATUS_CHIP[event.status]}`}>{STATUS_LABELS[event.status]}</span>
            <span className="text-iron-grey">
              {event.grid_size}×{event.grid_size} · {data.tiles.length}/{squares} tiles · {data.teams.length} teams · {data.teams.reduce((n, t) => n + t.members.length, 0)} players
            </span>
            {data.pendingCount > 0 && (
              <Link href={`/admin/bingo/submissions?event=${event.id}`} className="px-2 py-0.5 rounded-full bg-gold/15 text-gold font-semibold hover:underline">
                {data.pendingCount} to review
              </Link>
            )}
          </div>
        </div>
        <Link href={`/bingo/${event.id}`} target="_blank" className="text-sm text-gnome-green hover:underline shrink-0">
          {event.status === "draft" ? "Preview as a member ↗" : "Open member page ↗"}
        </Link>
      </div>

      <nav className="flex flex-wrap gap-1.5" aria-label="Clan Bingo setup steps">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStep(s.key)}
            aria-current={step === s.key ? "step" : undefined}
            className={`px-3.5 py-1.5 rounded-full text-sm cursor-pointer transition-colors ${
              step === s.key ? "bg-gnome-green text-text-light font-semibold" : done[s.key] ? "bg-gnome-green/10 text-gnome-green hover:bg-gnome-green/20" : "bg-parchment-dark text-bark-brown hover:bg-parchment-dark/70"
            }`}
          >
            {done[s.key] && step !== s.key ? "✓ " : `${i + 1}. `}
            {s.label}
          </button>
        ))}
      </nav>

      {step === "basics" && <BasicsStep data={data} onSaved={reload} onNext={() => setStep("board")} />}
      {step === "board" && <BoardStep data={data} onChanged={reload} onNext={() => setStep("teams")} />}
      {step === "teams" && <TeamsStep data={data} onSaved={reload} onNext={() => setStep("launch")} />}
      {step === "launch" && <LaunchStep data={data} onChanged={reload} goTo={(s) => setStep(s as StepKey)} />}
    </div>
  );
}
