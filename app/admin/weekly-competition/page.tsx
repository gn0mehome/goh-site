"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RolePingSelector } from "@/components/admin/RolePingSelector";
import { DISCORD_MESSAGE_LIMIT, nextJagexWeekStart, splitDiscordMessage } from "@/lib/weekly-announcement-templates";
import { PollChoicesEditor, type PollChoice } from "@/components/admin/PollChoicesEditor";
import { WeeklyVotePolls } from "@/components/admin/WeeklyVotePolls";
import { bossDifficulty, type BossTiers, type BossTitleNames, type Difficulty } from "@/lib/boss-difficulty";
import { allowedMetrics } from "@/lib/weekly-poll-metrics";

const inputClass = "w-full px-3 py-2 rounded-md border border-bark-brown-light bg-parchment text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-gnome-green";

interface WeeklyConfig {
  current_competition_ids: number[];
  current_forum_thread_id: string | null;
  ping_role_ids: string[] | null;
  raffle_prize_amount: number | string | null;
  voting_thread_id: string | null;
  last_run_at: string | null;
}

interface Competition {
  id: number;
  title: string;
  metric: string;
  type: "sotw" | "botw";
  startsAt: string;
  endsAt: string;
}

type Step = "results" | "forum" | "raffle" | "poll";
type TextStep = Exclude<Step, "poll">;

interface Preview {
  results: { channelId: string; content: string } | null;
  forum: { channelId: string; title: string; content: string };
  raffle: { channelId: string; content: string } | null;
  poll: { channelId: string; question: string; answers: string[]; durationHours: number } | null;
  nextEmoji: string;
  nextIds: number[];
  nextType: "sotw" | "botw";
  nextName: string;
  startDate: string;
  warnings: string[];
}

const STEP_LABEL: Record<Step, string> = {
  results: "Results (last week's thread)",
  forum: "New forum thread",
  raffle: "Raffle winners (announcements)",
  poll: "Voting poll (voting thread)",
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" of an instant's New York calendar day (what the posts' dates show). */
function nyDateInput(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Starting values for the voting poll: the week after next week's
 * competition, and the opposite type (weeks usually alternate) -- both
 * editable on the form.
 */
function defaultPoll(competitions: Competition[], nextIds: number[]): { week: string; type: "sotw" | "botw" } | null {
  const next = competitions.find((c) => c.id === nextIds[0]);
  if (!next) return null;
  return {
    week: nyDateInput(new Date(new Date(next.startsAt).getTime() + WEEK_MS)),
    type: next.type === "sotw" ? "botw" : "sotw",
  };
}

interface LatestRaffle {
  id: string;
  title: string;
  occurred_on: string;
  winners: { rsn: string; prize: string }[];
}

/** "1,000,000 GP" -> 1000000; null when the prizes differ or can't be read. */
function sharedPrizeAmount(winners: LatestRaffle["winners"]): number | null {
  const amounts = winners.map((w) => Number(w.prize.replace(/[^\d.]/g, "")));
  if (amounts.length === 0 || amounts.some((a) => !a) || new Set(amounts).size !== 1) return null;
  return amounts[0];
}

function lines(text: string): string[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

// Competitions within this much of the Sunday turnover count as "ending" /
// "starting" at it, for preselecting the pickers.
const BOUNDARY_SLACK_MS = 36 * 60 * 60 * 1000;

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function statusOf(c: Competition, now: number): "Ended" | "Running" | "Upcoming" {
  if (new Date(c.endsAt).getTime() <= now) return "Ended";
  if (new Date(c.startsAt).getTime() <= now) return "Running";
  return "Upcoming";
}

/** Sensible defaults: what the last turnover posted (else whatever ends at this turnover) as finished, whatever starts at it as next. */
function defaultPicks(competitions: Competition[], lastPostedIds: number[]): { finished: number[]; next: number[] } {
  const boundary = nextJagexWeekStart(new Date()).getTime();
  const near = (iso: string) => Math.abs(new Date(iso).getTime() - boundary) <= BOUNDARY_SLACK_MS;
  const stored = lastPostedIds.filter((id) => competitions.some((c) => c.id === id));
  const finished = stored.length ? stored : competitions.filter((c) => near(c.endsAt)).map((c) => c.id);
  const next = competitions.filter((c) => near(c.startsAt) && !finished.includes(c.id)).map((c) => c.id);
  return { finished, next };
}

function CompetitionPicker({
  label,
  hint,
  competitions,
  now,
  selected,
  onChange,
}: {
  label: string;
  hint: string;
  competitions: Competition[];
  now: number;
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const toggle = (id: number) => onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  return (
    <div className="flex-1 min-w-0">
      <label className="block text-sm font-semibold text-bark-brown mb-1">{label}</label>
      <p className="text-xs text-iron-grey mb-2">{hint}</p>
      <div className="max-h-56 overflow-y-auto rounded-md border border-bark-brown-light bg-parchment divide-y divide-parchment-dark">
        {competitions.length === 0 && <p className="p-3 text-xs text-iron-grey">No competitions found in the WOM group.</p>}
        {competitions.map((c) => {
          const status = statusOf(c, now);
          return (
            <label key={c.id} className="flex items-start gap-2 p-2 text-sm text-bark-brown cursor-pointer hover:bg-parchment-dark/40">
              <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} className="accent-gnome-green mt-1" />
              <span className="min-w-0">
                <span className="block truncate">{c.title}</span>
                <span className="block text-xs text-iron-grey">
                  {shortDate(c.startsAt)} – {shortDate(c.endsAt)} · {status} · #{c.id}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function WeeklyCompetitionPage() {
  const [config, setConfig] = useState<WeeklyConfig | null>(null);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  // When the competition list was fetched -- the reference time for the
  // Ended/Running/Upcoming split (kept in state so rendering stays pure).
  const [loadedAt, setLoadedAt] = useState(0);

  const [finishedIds, setFinishedIds] = useState<number[]>([]);
  const [nextIds, setNextIds] = useState<number[]>([]);
  const [previousThread, setPreviousThread] = useState("");
  const [pingRoleIds, setPingRoleIds] = useState<string[]>([]);
  const [raffleText, setRaffleText] = useState("");
  const [raffleAmount, setRaffleAmount] = useState("1000000");
  const [latestRaffle, setLatestRaffle] = useState<LatestRaffle | null>(null);
  // Which raffle the winners box was filled from (cleared once it's edited by hand).
  const [raffleSource, setRaffleSource] = useState<string | null>(null);
  const [votingThread, setVotingThread] = useState("");
  // The poll's options, each tied to a skill or boss(es) so the winner can be set up automatically.
  const [pollChoices, setPollChoices] = useState<PollChoice[]>([]);
  const [bossTiers, setBossTiers] = useState<BossTiers>({});
  const [bossNames, setBossNames] = useState<BossTitleNames>({});
  const [pollsRefresh, setPollsRefresh] = useState(0);
  const [pollWeek, setPollWeek] = useState("");
  const [pollType, setPollType] = useState<"sotw" | "botw">("botw");
  // Once the admin edits the poll's week/type, stop re-defaulting them when the next-week picks change.
  const [pollTouched, setPollTouched] = useState(false);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [include, setInclude] = useState<Record<Step, boolean>>({ results: true, forum: true, raffle: true, poll: true });
  const [done, setDone] = useState<Step[]>([]);
  const [imageUrl, setImageUrl] = useState("");

  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyRaffle = (raffle: LatestRaffle) => {
    setRaffleText(raffle.winners.map((w) => w.rsn).join("\n"));
    const amount = sharedPrizeAmount(raffle.winners);
    if (amount) setRaffleAmount(String(amount));
    setRaffleSource(raffle.id);
  };

  const applyLoaded = (data: { config?: WeeklyConfig; competitions?: Competition[]; latestRaffle?: LatestRaffle | null }, first = false) => {
    const c = data.config;
    const comps = data.competitions ?? [];
    setLatestRaffle(data.latestRaffle ?? null);
    setCompetitions(comps);
    setLoadedAt(Date.now());
    if (c) {
      setConfig(c);
      setPreviousThread(c.current_forum_thread_id ?? "");
      setPingRoleIds(c.ping_role_ids ?? []);
      if (c.raffle_prize_amount != null) setRaffleAmount(String(Number(c.raffle_prize_amount)));
      setVotingThread(c.voting_thread_id ?? "");
    }
    // On first load, fill the raffle winners from the latest raffle if it's
    // from the last two weeks and has winners.
    const recent = data.latestRaffle && Date.now() - Date.parse(`${data.latestRaffle.occurred_on}T12:00:00`) < 14 * 86_400_000;
    if (first && recent && data.latestRaffle!.winners.length > 0) applyRaffle(data.latestRaffle!);
    const picks = defaultPicks(comps, c?.current_competition_ids ?? []);
    setFinishedIds(picks.finished);
    setNextIds(picks.next);
    const poll = defaultPoll(comps, picks.next);
    if (poll) {
      setPollWeek(poll.week);
      setPollType(poll.type);
    }
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/weekly-competition")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (ok) applyLoaded(data, true);
        else {
          setError(data.error ?? "Failed to load.");
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Boss tiers and title names (Settings › Boss Difficulty) for the poll's boss list.
  useEffect(() => {
    fetch("/api/admin/boss-difficulty")
      .then((r) => r.json())
      .then((d: { tiers?: BossTiers; names?: BossTitleNames }) => {
        setBossTiers(d.tiers ?? {});
        setBossNames(d.names ?? {});
      })
      .catch(() => {});
  }, []);

  // Boss weeks alternate easy / hard: the poll's turn is the opposite of the latest boss week.
  const suggestedTier = useMemo<Difficulty | null>(() => {
    const last = competitions.filter((c) => c.type === "botw").sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))[0];
    if (!last) return null;
    return bossDifficulty(last.metric, bossTiers) === "hard" ? "easy" : "hard";
  }, [competitions, bossTiers]);

  // Only complete options go on the poll.
  const readyChoices = pollChoices.map((c) => ({ ...c, metrics: c.metrics.filter(Boolean) })).filter((c) => c.metrics.length > 0 && c.label.trim());

  // A skill doesn't fit a boss poll (and vice versa): drop picks that don't match the type.
  const changePollType = (type: "sotw" | "botw") => {
    setPollType(type);
    const ok = allowedMetrics(type);
    setPollChoices((cs) => cs.map((c) => ({ ...c, metrics: c.metrics.filter((m) => !m || ok.has(m)) })).map((c) => (c.metrics.length ? c : { ...c, label: c.labelAuto ? "" : c.label })));
  };

  const reload = async () => {
    const res = await fetch("/api/admin/weekly-competition");
    const data = await res.json().catch(() => ({}));
    if (res.ok) applyLoaded(data);
  };

  const generatePreview = async () => {
    setGenerating(true);
    setError(null);
    setStatus(null);
    const res = await fetch("/api/admin/weekly-competition/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        finishedIds,
        nextIds,
        previousThread,
        pingRoleIds,
        raffleWinners: lines(raffleText),
        raffleAmount: Number(raffleAmount.replace(/[^\d.]/g, "")) || 0,
        votingThread,
        pollOptions: readyChoices.map((c) => c.label.trim()),
        pollWeek,
        pollType,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.preview) {
      setPreview(data.preview);
      setInclude({ results: !!data.preview.results, forum: true, raffle: !!data.preview.raffle, poll: !!data.preview.poll });
      setDone([]);
    } else {
      setError(data.error ?? "Failed to build the preview.");
    }
    setGenerating(false);
  };

  const postAll = async () => {
    if (!preview) return;
    const pending = (["results", "forum", "raffle", "poll"] as const).filter((s) => include[s] && !done.includes(s) && preview[s]);
    if (pending.length === 0) return;
    if (!confirm(`Post to Discord now?\n\n${pending.map((s) => `• ${STEP_LABEL[s]}`).join("\n")}`)) return;
    setRunning(true);
    setError(null);
    setStatus(null);
    const res = await fetch("/api/admin/weekly-competition/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        results: pending.includes("results") ? preview.results : undefined,
        forum: pending.includes("forum") ? { title: preview.forum.title, content: preview.forum.content, imageUrl: imageUrl.trim() } : undefined,
        raffle: pending.includes("raffle") ? preview.raffle : undefined,
        poll:
          pending.includes("poll") && preview.poll
            ? { ...preview.poll, answers: readyChoices.map((c) => c.label.trim()), kind: pollType, weekStart: pollWeek, choices: readyChoices.map((c) => c.metrics) }
            : undefined,
        nextEmoji: preview.nextEmoji,
        nextIds: preview.nextIds,
        nextType: preview.nextType,
        nextName: preview.nextName,
        startDate: preview.startDate,
      }),
    });
    const data = await res.json().catch(() => ({}));
    const completed: Step[] = data.completed ?? [];
    // A forum thread that got created counts as done even if its follow-up
    // messages failed -- retrying would make a second thread.
    setDone((prev) => [...prev, ...completed, ...(data.forumThreadId && !completed.includes("forum") ? (["forum"] as Step[]) : [])]);
    if (completed.includes("poll")) setPollsRefresh((n) => n + 1);
    if (res.ok) {
      setStatus(`Posted: ${completed.map((s) => STEP_LABEL[s]).join(", ")}.`);
    } else {
      setError(`${data.error ?? "Posting failed."}${completed.length ? ` (Already posted: ${completed.map((s) => STEP_LABEL[s]).join(", ")} -- those won't re-post on retry.)` : ""}`);
    }
    if (data.rotated) {
      const { config: refreshed } = await fetch("/api/admin/weekly-competition").then((r) => r.json()).catch(() => ({ config: null }));
      if (refreshed) setConfig(refreshed);
    }
    setRunning(false);
  };

  const updatePreview = (step: TextStep, field: "content" | "title", value: string) => {
    setPreview((p) => {
      if (!p) return p;
      if (step === "forum") return { ...p, forum: { ...p.forum, [field]: value } };
      const current = p[step];
      return current ? { ...p, [step]: { ...current, content: value } } : p;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-parchment-dark border-t-gnome-green rounded-full animate-spin" />
      </div>
    );
  }

  const now = loadedAt;

  return (
    <div>
      <h1 className="font-display text-3xl text-gnome-green mb-1">Weekly SOTW/BotW</h1>
      <p className="text-bark-brown-light mb-6">
        Sunday turnover: posts the finished competition&apos;s results in its forum thread, opens the new week&apos;s
        forum thread, announces the raffle winners, and opens the vote for the week after. Create the competitions
        themselves under Admin {" > "}WOM Competitions first.
      </p>

      {error && <div className="mb-4 p-3 rounded-md bg-red-accent/10 border border-red-accent/30 text-sm text-red-accent">{error}</div>}
      {status && <div className="mb-4 p-3 rounded-md bg-gnome-green/10 border border-gnome-green/30 text-sm text-gnome-green">{status}</div>}

      <Card hover={false}>
        <div className="space-y-5">
          <div className="flex flex-col md:flex-row gap-4">
            <CompetitionPicker
              label="Finished competition(s)"
              hint="Results get posted for these. Pick two for a combined week (e.g. Gauntlet + Corrupted Gauntlet)."
              competitions={competitions.filter((c) => new Date(c.startsAt).getTime() <= now)}
              now={now}
              selected={finishedIds}
              onChange={setFinishedIds}
            />
            <CompetitionPicker
              label="Next week's competition(s)"
              hint="The new forum thread is for these. Pick two for a combined week (e.g. Nightmare + Phosani's)."
              competitions={competitions.filter((c) => new Date(c.endsAt).getTime() > now)}
              now={now}
              selected={nextIds}
              onChange={(ids) => {
                setNextIds(ids);
                const poll = pollTouched ? null : defaultPoll(competitions, ids);
                if (poll) {
                  setPollWeek(poll.week);
                  setPollType(poll.type);
                }
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-bark-brown mb-1">Finished competition&apos;s forum thread (results get posted here)</label>
            <input type="text" value={previousThread} onChange={(e) => setPreviousThread(e.target.value)} className={inputClass} placeholder="Paste the thread link or id" />
            <p className="text-xs text-iron-grey mt-1">Filled in automatically after each turnover. Leave blank to skip the results post.</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-bark-brown mb-1">Results ping</label>
            <RolePingSelector selectedRoles={pingRoleIds} onChange={setPingRoleIds} />
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                <label className="block text-sm font-semibold text-bark-brown">Raffle winners (one per line)</label>
                {latestRaffle && latestRaffle.winners.length > 0 && raffleSource !== latestRaffle.id && (
                  <button type="button" onClick={() => applyRaffle(latestRaffle)} className="text-xs text-gnome-green hover:underline cursor-pointer">
                    Use {latestRaffle.title}
                  </button>
                )}
              </div>
              <textarea
                value={raffleText}
                onChange={(e) => {
                  setRaffleText(e.target.value);
                  setRaffleSource(null);
                }}
                rows={4}
                className={inputClass}
                placeholder={"Gn0me Rika\nKryssyWolf\nGn0me Pack"}
              />
              <p className="text-xs text-iron-grey mt-1">
                {raffleSource && latestRaffle && raffleSource === latestRaffle.id ? (
                  <>
                    Filled in from <span className="font-semibold">{latestRaffle.title}</span> ({new Date(`${latestRaffle.occurred_on}T12:00:00`).toLocaleDateString()}).
                  </>
                ) : latestRaffle && latestRaffle.winners.length === 0 ? (
                  <>
                    The latest raffle, {latestRaffle.title}, has no winners yet. Draw them on the{" "}
                    <Link href="/admin/raffles" className="text-gnome-green hover:underline">Raffles page</Link>.
                  </>
                ) : (
                  <>
                    Draw the winners on the <Link href="/admin/raffles" className="text-gnome-green hover:underline">Raffles page</Link> and they fill in here.
                  </>
                )}
              </p>
            </div>
            <div className="sm:w-48">
              <label className="block text-sm font-semibold text-bark-brown mb-1">GP per raffle winner</label>
              <input type="text" inputMode="numeric" value={raffleAmount} onChange={(e) => setRaffleAmount(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-bark-brown mb-1">Voting poll options</label>
              <PollChoicesEditor kind={pollType} choices={pollChoices} onChange={setPollChoices} tiers={bossTiers} names={bossNames} suggestedTier={pollType === "botw" ? suggestedTier : null} />
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-bark-brown mb-1">Poll is for</label>
                  <select
                    value={pollType}
                    onChange={(e) => {
                      changePollType(e.target.value as "sotw" | "botw");
                      setPollTouched(true);
                    }}
                    className={`${inputClass} cursor-pointer`}
                  >
                    <option value="sotw">Skill of the Week</option>
                    <option value="botw">Boss of the Week</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-bark-brown mb-1">Week of</label>
                  <input
                    type="date"
                    value={pollWeek}
                    onChange={(e) => {
                      setPollWeek(e.target.value);
                      setPollTouched(true);
                    }}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-bark-brown mb-1">Voting thread</label>
                <input type="text" value={votingThread} onChange={(e) => setVotingThread(e.target.value)} className={inputClass} placeholder="Paste the SOTW / BOTW VOTING POLL thread link" />
                <p className="text-xs text-iron-grey mt-1">Remembered for next time. Leave blank (or no options) to skip the poll.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={generating || running || finishedIds.length === 0 || nextIds.length === 0} onClick={generatePreview}>
            {generating ? "Generating (can take ~30s)..." : preview ? "Regenerate Preview" : "Generate Preview"}
          </Button>
          <button type="button" onClick={reload} className="text-xs text-gnome-green hover:underline cursor-pointer">
            Refresh competitions
          </button>
          <span className="text-xs text-iron-grey">
            Last turnover: {config?.last_run_at ? new Date(config.last_run_at).toLocaleString() : "never"}
          </span>
        </div>

        {preview && (
          <div className="mt-6 pt-4 border-t border-parchment-dark space-y-6">
            {preview.warnings.length > 0 && (
              <ul className="p-3 rounded-md bg-amber-100/60 border border-amber-300 text-xs text-bark-brown list-disc pl-6 space-y-1">
                {preview.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            )}

            {(["results", "forum", "raffle"] as const).map((step) => {
              const post = preview[step];
              if (!post) return null;
              const messageCount = splitDiscordMessage(post.content).length;
              const isDone = done.includes(step);
              return (
                <div key={step}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="flex items-center gap-2 text-sm font-semibold text-bark-brown cursor-pointer">
                      <input type="checkbox" checked={include[step]} disabled={isDone} onChange={(e) => setInclude((i) => ({ ...i, [step]: e.target.checked }))} className="accent-gnome-green" />
                      {STEP_LABEL[step]}
                    </label>
                    <span className={`text-xs ${isDone ? "text-gnome-green font-semibold" : "text-iron-grey"}`}>
                      {isDone ? "Posted ✓" : `${post.content.length.toLocaleString()} chars${messageCount > 1 ? ` · ${messageCount} messages (${DISCORD_MESSAGE_LIMIT} max each)` : ""}`}
                    </span>
                  </div>
                  {step === "forum" && (
                    <input type="text" value={preview.forum.title} disabled={isDone} onChange={(e) => updatePreview("forum", "title", e.target.value)} className={`${inputClass} mb-2 font-semibold`} />
                  )}
                  <textarea
                    value={post.content}
                    disabled={isDone}
                    onChange={(e) => updatePreview(step, "content", e.target.value)}
                    rows={step === "forum" ? 24 : 12}
                    className={`${inputClass} font-mono text-xs`}
                  />
                  {step === "forum" && (
                    <input type="text" value={imageUrl} disabled={isDone} onChange={(e) => setImageUrl(e.target.value)} className={`${inputClass} mt-2`} placeholder="Optional image URL shown at the bottom (https://...)" />
                  )}
                </div>
              );
            })}

            {preview.poll && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="flex items-center gap-2 text-sm font-semibold text-bark-brown cursor-pointer">
                    <input type="checkbox" checked={include.poll} disabled={done.includes("poll")} onChange={(e) => setInclude((i) => ({ ...i, poll: e.target.checked }))} className="accent-gnome-green" />
                    {STEP_LABEL.poll}
                  </label>
                  <span className={`text-xs ${done.includes("poll") ? "text-gnome-green font-semibold" : "text-iron-grey"}`}>
                    {done.includes("poll") ? "Posted ✓" : `${readyChoices.length} options`}
                  </span>
                </div>
                <input
                  type="text"
                  value={preview.poll.question}
                  disabled={done.includes("poll")}
                  maxLength={300}
                  onChange={(e) => setPreview((p) => (p && p.poll ? { ...p, poll: { ...p.poll, question: e.target.value } } : p))}
                  className={`${inputClass} mb-2 font-semibold`}
                />
                <ol className="list-decimal pl-6 text-sm text-bark-brown space-y-0.5">
                  {readyChoices.map((c, i) => (
                    <li key={i}>{c.label}</li>
                  ))}
                </ol>
                <p className="text-xs text-iron-grey mt-1">Change the options in the form above; this list follows it. The winner is set up automatically when the poll closes.</p>
                <div className="flex items-center gap-2 mt-2">
                  <label className="text-xs text-iron-grey">Closes after</label>
                  <select
                    value={preview.poll.durationHours}
                    disabled={done.includes("poll")}
                    onChange={(e) => setPreview((p) => (p && p.poll ? { ...p, poll: { ...p.poll, durationHours: Number(e.target.value) } } : p))}
                    className={`${inputClass.replace("w-full ", "")} cursor-pointer`}
                  >
                    {[3, 4, 5, 6, 7].map((d) => (
                      <option key={d} value={d * 24}>{d} days</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <Button size="sm" disabled={running || generating} onClick={postAll}>
              {running ? "Posting..." : done.length ? "Post Remaining" : "Post Everything"}
            </Button>
          </div>
        )}
      </Card>

      <WeeklyVotePolls refreshKey={pollsRefresh} />
    </div>
  );
}
