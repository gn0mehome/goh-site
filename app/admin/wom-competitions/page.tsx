"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { bossDifficulty, bossTitleName, DIFFICULTY_LABEL, type BossTiers, type BossTitleNames, type Difficulty } from "@/lib/boss-difficulty";
import { nextWeeklyStart, weeklyTitle, WEEKLY_LABEL, type WeeklyKind } from "@/lib/weekly-title";
import Link from "next/link";
import { SKILLS, BOSSES, ACTIVITIES, COMPUTED_METRICS, MetricProps } from "@wise-old-man/utils";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface TrackedCompetition {
  id: string;
  wom_id: number;
  title: string;
  metric: string;
  type: "classic" | "team";
  starts_at: string;
  ends_at: string;
  group_linked: boolean;
  participants: string[] | null;
  teams: { name: string; participants: string[] }[] | null;
  created_by: string | null;
  created_at: string;
}

type ParticipantMode = "clan" | "participants" | "teams";

const STEPS = ["Basics", "Participants", "Announce", "Review"];

const METRIC_GROUPS: { label: string; metrics: string[] }[] = [
  { label: "Skills", metrics: [...SKILLS] },
  { label: "Bosses", metrics: [...BOSSES] },
  { label: "Activities", metrics: [...ACTIVITIES] },
  { label: "Other", metrics: [...COMPUTED_METRICS] },
];

function metricLabel(metric: string): string {
  return (MetricProps as Record<string, { name: string }>)[metric]?.name ?? metric.replace(/_/g, " ");
}

const inputClass = "w-full px-3 py-2 rounded-md border border-bark-brown-light bg-parchment text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-gnome-green";

function emptyTeam() {
  return { name: "", participants: [""] };
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type BuilderKind = WeeklyKind | "custom";
const WEEK_MS = 7 * 86_400_000;

export default function WomCompetitionsPage() {
  const [step, setStep] = useState(0);

  // Skill / Boss of the Week fill in the title and dates; Custom is the free-form builder.
  const [kind, setKind] = useState<BuilderKind>("custom");
  const [titleAuto, setTitleAuto] = useState(true);
  const [endAuto, setEndAuto] = useState(true);
  const [bossTiers, setBossTiers] = useState<BossTiers>({});
  const [bossNames, setBossNames] = useState<BossTitleNames>({});

  const [title, setTitle] = useState("");
  const [metric, setMetric] = useState("overall");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [payoutWinnerCount, setPayoutWinnerCount] = useState(10);

  const [participantMode, setParticipantMode] = useState<ParticipantMode>("clan");
  const [participants, setParticipants] = useState<string[]>([""]);
  const [teams, setTeams] = useState<{ name: string; participants: string[] }[]>([emptyTeam(), emptyTeam()]);

  const [postToDiscord, setPostToDiscord] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [competitions, setCompetitions] = useState<TrackedCompetition[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [clanAutoIncludeAvailable, setClanAutoIncludeAvailable] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    const res = await fetch("/api/admin/wom-competitions");
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setCompetitions(data.competitions ?? []);
      setClanAutoIncludeAvailable(!!data.clanAutoIncludeAvailable);
    }
    setLoadingList(false);
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  // Boss tiers and title names from Settings › Boss Difficulty.
  useEffect(() => {
    fetch("/api/admin/boss-difficulty")
      .then((r) => r.json())
      .then((d: { tiers?: BossTiers; names?: BossTitleNames }) => {
        setBossTiers(d.tiers ?? {});
        setBossNames(d.names ?? {});
      })
      .catch(() => {});
  }, []);

  // The last Boss of the Week, so the next one can alternate easy / hard.
  const lastBossWeek = useMemo(() => {
    const boss = competitions
      .filter((c) => /boss of the week|\bbotw\b/i.test(c.title) || (BOSSES as readonly string[]).includes(c.metric))
      .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at))[0];
    return boss ? { comp: boss, tier: bossDifficulty(boss.metric, bossTiers) } : null;
  }, [competitions, bossTiers]);
  const suggestedTier: Difficulty | null = lastBossWeek ? (lastBossWeek.tier === "hard" ? "easy" : "hard") : null;

  const titleName = (m: string) => (kind === "botw" ? bossTitleName(m, bossNames) : metricLabel(m));
  const autoTitle = kind === "custom" ? "" : weeklyTitle(kind, startsAt ? new Date(startsAt) : null, titleName(metric));
  // Keep the title in step with the boss/skill and date until someone types their own.
  const shownTitle = kind !== "custom" && titleAuto ? autoTitle : title;

  const pickKind = (k: BuilderKind) => {
    setKind(k);
    setTitleAuto(true);
    if (k === "custom") return;
    const list = k === "sotw" ? [...SKILLS] : [...BOSSES];
    if (!(list as string[]).includes(metric)) {
      const first = k === "botw" && suggestedTier ? (BOSSES as readonly string[]).find((b) => bossDifficulty(b, bossTiers) === suggestedTier) : undefined;
      setMetric(first ?? (k === "sotw" ? "mining" : list[0]));
    }
    if (!startsAt) {
      const start = nextWeeklyStart();
      setStartsAt(toDatetimeLocal(start.toISOString()));
      setEndsAt(toDatetimeLocal(new Date(start.getTime() + WEEK_MS).toISOString()));
      setEndAuto(true);
    }
  };

  const changeStart = (value: string) => {
    setStartsAt(value);
    // A week long by default; stops following once the end is set by hand.
    if (value && (endAuto || !endsAt)) {
      setEndsAt(toDatetimeLocal(new Date(new Date(value).getTime() + WEEK_MS).toISOString()));
      setEndAuto(true);
    }
  };

  const bossOptions = useMemo(() => {
    const order: Difficulty[] = suggestedTier === "easy" ? ["easy", "hard"] : ["hard", "easy"];
    const byName = (a: string, b: string) => bossTitleName(a, bossNames).localeCompare(bossTitleName(b, bossNames));
    return order.map((tier) => ({
      tier,
      metrics: (BOSSES as readonly string[]).filter((b) => bossDifficulty(b, bossTiers) === tier).sort(byName),
    }));
  }, [bossTiers, bossNames, suggestedTier]);

  const resetWizard = () => {
    setStep(0);
    setKind("custom");
    setTitleAuto(true);
    setEndAuto(true);
    setTitle("");
    setMetric("overall");
    setStartsAt("");
    setEndsAt("");
    setPayoutWinnerCount(10);
    setParticipantMode("clan");
    setParticipants([""]);
    setTeams([emptyTeam(), emptyTeam()]);
    setPostToDiscord(true);
  };

  const updateParticipant = (i: number, value: string) => {
    setParticipants((prev) => prev.map((p, idx) => (idx === i ? value : p)));
  };
  const addParticipant = () => setParticipants((prev) => [...prev, ""]);
  const removeParticipant = (i: number) => setParticipants((prev) => prev.filter((_, idx) => idx !== i));

  const updateTeam = (i: number, patch: Partial<{ name: string; participants: string[] }>) => {
    setTeams((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  };
  const addTeam = () => setTeams((prev) => [...prev, emptyTeam()]);
  const removeTeam = (i: number) => setTeams((prev) => prev.filter((_, idx) => idx !== i));
  const updateTeamParticipant = (ti: number, pi: number, value: string) => {
    setTeams((prev) =>
      prev.map((t, idx) => (idx === ti ? { ...t, participants: t.participants.map((p, pidx) => (pidx === pi ? value : p)) } : t))
    );
  };
  const addTeamParticipant = (ti: number) => updateTeam(ti, { participants: [...teams[ti].participants, ""] });
  const removeTeamParticipant = (ti: number, pi: number) =>
    updateTeam(ti, { participants: teams[ti].participants.filter((_, idx) => idx !== pi) });

  const stepValid: boolean[] = [
    !!shownTitle.trim() && !!metric && !!startsAt && !!endsAt && new Date(endsAt) > new Date(startsAt),
    participantMode === "clan"
      ? clanAutoIncludeAvailable
      : participantMode === "participants"
        ? participants.some((p) => p.trim())
        : teams.filter((t) => t.name.trim() && t.participants.some((p) => p.trim())).length >= 2,
    true,
    true,
  ];

  const handleCreate = async () => {
    setSubmitting(true);
    setError(null);
    setStatus(null);

    const body: Record<string, unknown> = {
      title: shownTitle,
      metric,
      startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
      endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
      participantMode,
      postToDiscord,
      payoutWinnerCount,
    };
    if (participantMode === "participants") {
      body.participants = participants.map((p) => p.trim()).filter(Boolean);
    } else if (participantMode === "teams") {
      body.teams = teams
        .map((t) => ({ name: t.name.trim(), participants: t.participants.map((p) => p.trim()).filter(Boolean) }))
        .filter((t) => t.name && t.participants.length > 0);
    }

    const res = await fetch("/api/admin/wom-competitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      setStatus(`Competition created! View it at https://wiseoldman.net/competitions/${data.womId}`);
      resetWizard();
      await loadList();
    } else {
      setError(data.error ?? "Failed to create the competition.");
    }
    setSubmitting(false);
  };

  const handleDelete = async (comp: TrackedCompetition) => {
    if (!confirm(`Delete "${comp.title}" from WOM? This can't be undone.`)) return;
    setDeletingId(comp.id);
    const res = await fetch(`/api/admin/wom-competitions/${comp.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) alert(data.error ?? "Failed to delete.");
    await loadList();
    setDeletingId(null);
  };

  return (
    <div>
      <h1 className="font-display text-3xl text-gnome-green mb-1">WOM Competitions</h1>
      <p className="text-bark-brown-light mb-6">
        Create Wise Old Man competitions directly from the site instead of setting them up by hand.
      </p>

      <Card hover={false} className="mb-8">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1">
              <button
                type="button"
                onClick={() => i < step && setStep(i)}
                disabled={i >= step && i !== step}
                className={`flex items-center gap-2 text-xs font-semibold ${i <= step ? "cursor-pointer" : "cursor-default"}`}
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    i < step ? "bg-gnome-green text-text-light" : i === step ? "bg-gnome-green/20 border-2 border-gnome-green text-gnome-green" : "bg-parchment-dark text-iron-grey"
                  }`}
                >
                  {i + 1}
                </span>
                <span className={i === step ? "text-gnome-green" : "text-iron-grey"}>{label}</span>
              </button>
              {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 ${i < step ? "bg-gnome-green" : "bg-parchment-dark"}`} />}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-red-accent/10 border border-red-accent/30 text-sm text-red-accent">
            {error}
          </div>
        )}
        {status && (
          <div className="mb-4 p-3 rounded-md bg-gnome-green/10 border border-gnome-green/30 text-sm text-gnome-green">
            {status}
          </div>
        )}

        {/* Step 0: Basics */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <p className="block text-sm font-semibold text-bark-brown mb-1">What kind of competition?</p>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Competition kind">
                {([
                  ["sotw", WEEKLY_LABEL.sotw, "Pick a skill; the title and dates fill themselves in."],
                  ["botw", WEEKLY_LABEL.botw, "Pick from your easy / hard boss list."],
                  ["custom", "Custom", "Any metric, your own title and dates."],
                ] as [BuilderKind, string, string][]).map(([k, label, text]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => pickKind(k)}
                    className={`text-left rounded-md border p-2.5 text-sm transition-colors ${kind === k ? "border-gnome-green bg-gnome-green/10" : "border-bark-brown-light/40 hover:bg-parchment-dark/40"}`}
                  >
                    <span className="font-semibold text-bark-brown">{label}</span>
                    <span className="block text-xs text-iron-grey mt-0.5">{text}</span>
                  </button>
                ))}
              </div>
            </div>

            {kind === "botw" && (
              <p className="text-xs text-bark-brown-light">
                {lastBossWeek ? (
                  <>
                    Last boss week was <b>{lastBossWeek.comp.title}</b>, {lastBossWeek.tier === "easy" ? "an easy" : "a hard"} week, so this one would be{" "}
                    <b>{suggestedTier && DIFFICULTY_LABEL[suggestedTier].toLowerCase()}</b>.{" "}
                  </>
                ) : null}
                Easy and hard bosses, and the names used in titles, are set in{" "}
                <Link href="/admin/boss-difficulty" className="text-gnome-green hover:underline">
                  Settings › Boss Difficulty
                </Link>
                .
              </p>
            )}

            <div>
              <label className="block text-sm font-semibold text-bark-brown mb-1">{kind === "sotw" ? "Skill *" : kind === "botw" ? "Boss *" : "Metric *"}</label>
              <select value={metric} onChange={(e) => setMetric(e.target.value)} className={`${inputClass} cursor-pointer`}>
                {kind === "sotw" &&
                  SKILLS.filter((m) => m !== "overall").map((m) => (
                    <option key={m} value={m}>{metricLabel(m)}</option>
                  ))}
                {kind === "botw" &&
                  bossOptions.map(({ tier, metrics }) => (
                    <optgroup key={tier} label={`${DIFFICULTY_LABEL[tier]} bosses${tier === suggestedTier ? " (this week's turn)" : ""}`}>
                      {metrics.map((m) => (
                        <option key={m} value={m}>
                          {bossTitleName(m, bossNames)}
                          {bossTitleName(m, bossNames) !== metricLabel(m) ? ` (${metricLabel(m)})` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                {kind === "custom" &&
                  METRIC_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.metrics.map((m) => (
                        <option key={m} value={m}>{metricLabel(m)}</option>
                      ))}
                    </optgroup>
                  ))}
              </select>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-sm font-semibold text-bark-brown mb-1">Starts *</label>
                <input type="datetime-local" value={startsAt} onChange={(e) => changeStart(e.target.value)} className={inputClass} />
                {kind !== "custom" && <p className="text-xs text-iron-grey mt-1">Defaults to next Sunday, 8 PM Eastern. Your computer&apos;s time zone is shown.</p>}
              </div>
              <div className="flex-1">
                <label className="block text-sm font-semibold text-bark-brown mb-1">Ends *</label>
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => {
                    setEndsAt(e.target.value);
                    setEndAuto(false);
                  }}
                  className={inputClass}
                />
                {kind !== "custom" && endAuto && <p className="text-xs text-iron-grey mt-1">A week after the start, unless you change it.</p>}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-bark-brown mb-1">Title *</label>
              <input
                type="text"
                value={shownTitle}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleAuto(false);
                }}
                className={inputClass}
                placeholder={kind === "custom" ? "Skill of the Week" : undefined}
              />
              {kind !== "custom" &&
                (titleAuto ? (
                  <p className="text-xs text-iron-grey mt-1">Filled in automatically: type | start date (Eastern) | {kind === "botw" ? "boss" : "skill"}. Type over it to change it.</p>
                ) : (
                  <button type="button" onClick={() => setTitleAuto(true)} className="text-xs text-gnome-green hover:underline mt-1">
                    Use the automatic title ({autoTitle})
                  </button>
                ))}
            </div>
            {startsAt && endsAt && new Date(endsAt) <= new Date(startsAt) && (
              <p className="text-xs text-red-accent">End time must be after the start time.</p>
            )}
            <div>
              <label className="block text-sm font-semibold text-bark-brown mb-1">Winners to pay out</label>
              <input
                type="number"
                min={0}
                max={20}
                value={payoutWinnerCount}
                onChange={(e) => setPayoutWinnerCount(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
                className={`${inputClass} sm:w-32`}
              />
              <p className="text-xs text-iron-grey mt-1">
                Once this competition ends, the morning cron auto-adds this many top finishers to Prize Payouts
                as unpaid entries (0 to skip -- e.g. for a competition with no prize).
              </p>
            </div>
          </div>
        )}

        {/* Step 1: Participants */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              {(["clan", "participants", "teams"] as ParticipantMode[]).map((mode) => (
                <label key={mode} className="flex items-start gap-2 text-sm text-bark-brown cursor-pointer">
                  <input type="radio" checked={participantMode === mode} onChange={() => setParticipantMode(mode)} className="mt-1 accent-gnome-green" />
                  <span>
                    <span className="font-semibold">
                      {mode === "clan" ? "Entire clan" : mode === "participants" ? "Specific players" : "Teams"}
                    </span>
                    <span className="block text-xs text-bark-brown-light">
                      {mode === "clan"
                        ? "Every current member of the WOM group, as of right now, is added automatically. Members who join later aren't added on their own -- add them from the competition's Manage panel afterward."
                        : mode === "participants"
                          ? "Only the RSNs you list below."
                          : "A team competition -- ranked by team, not individual."}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            {participantMode === "clan" && !clanAutoIncludeAvailable && (
              <p className="text-xs text-red-accent">
                WOM_GROUP_VERIFICATION_CODE isn&apos;t configured on the server yet, so this option is unavailable. Pick &quot;Specific players&quot; instead, or set that env var.
              </p>
            )}

            {participantMode === "participants" && (
              <div className="space-y-1.5">
                {participants.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" value={p} onChange={(e) => updateParticipant(i, e.target.value)} placeholder="RSN" className={`${inputClass} font-mono`} />
                    {participants.length > 1 && (
                      <button type="button" onClick={() => removeParticipant(i)} className="text-red-accent text-xs cursor-pointer shrink-0 px-2">✕</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={addParticipant} className="text-xs text-gnome-green hover:underline cursor-pointer">+ Add player</button>
              </div>
            )}

            {participantMode === "teams" && (
              <div className="space-y-4">
                {teams.map((team, ti) => (
                  <Card key={ti} hover={false} className="bg-parchment-dark/30">
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={team.name}
                        onChange={(e) => updateTeam(ti, { name: e.target.value })}
                        placeholder={`Team ${ti + 1} name`}
                        className={inputClass}
                      />
                      {teams.length > 2 && (
                        <button type="button" onClick={() => removeTeam(ti)} className="text-red-accent text-xs cursor-pointer shrink-0 px-2">✕ Remove team</button>
                      )}
                    </div>
                    <div className="space-y-1.5 ml-2">
                      {team.participants.map((p, pi) => (
                        <div key={pi} className="flex gap-2">
                          <input
                            type="text"
                            value={p}
                            onChange={(e) => updateTeamParticipant(ti, pi, e.target.value)}
                            placeholder="RSN"
                            className={`${inputClass} font-mono flex-1`}
                          />
                          {team.participants.length > 1 && (
                            <button type="button" onClick={() => removeTeamParticipant(ti, pi)} className="text-red-accent text-xs cursor-pointer px-2">✕</button>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={() => addTeamParticipant(ti)} className="text-xs text-gnome-green hover:underline cursor-pointer">+ Add player</button>
                    </div>
                  </Card>
                ))}
                <button type="button" onClick={addTeam} className="text-xs text-gnome-green hover:underline cursor-pointer">+ Add team</button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Announce */}
        {step === 2 && (
          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <button
                type="button"
                onClick={() => setPostToDiscord(!postToDiscord)}
                className={`mt-0.5 w-6 h-6 rounded border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                  postToDiscord ? "bg-gnome-green border-gnome-green" : "border-bark-brown-light hover:border-gnome-green"
                }`}
              >
                {postToDiscord && (
                  <svg className="w-4 h-4 text-text-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <div>
                <p className="font-semibold text-bark-brown">Post an announcement to Discord</p>
                <p className="text-xs text-bark-brown-light">
                  Posts to the channel configured for &quot;WOM Competitions&quot; under Admin &gt; Settings &gt; Discord Channels. If none is set, this is skipped silently.
                </p>
              </div>
            </label>

            {postToDiscord && (
              <div className="bg-[#313338] text-[#dbdee1] font-sans text-sm leading-relaxed rounded-lg border border-[#1e1f22] p-4">
                <pre className="whitespace-pre-wrap break-words font-sans text-[13px]">
                  {`🏆 New competition: ${shownTitle || "(title)"}\nMetric: ${metricLabel(metric)}\nStarts: ${startsAt ? new Date(startsAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "(date)"}\nhttps://wiseoldman.net/competitions/...`}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="space-y-3 text-sm">
            <div><span className="text-iron-grey">Title:</span> <span className="font-semibold text-bark-brown">{shownTitle}</span></div>
            <div><span className="text-iron-grey">Metric:</span> <span className="font-semibold text-bark-brown">{metricLabel(metric)}</span></div>
            <div>
              <span className="text-iron-grey">Starts:</span>{" "}
              <span className="font-semibold text-bark-brown">{startsAt ? new Date(startsAt).toLocaleString() : "—"}</span>
            </div>
            <div>
              <span className="text-iron-grey">Ends:</span>{" "}
              <span className="font-semibold text-bark-brown">{endsAt ? new Date(endsAt).toLocaleString() : "—"}</span>
            </div>
            <div>
              <span className="text-iron-grey">Participants:</span>{" "}
              <span className="font-semibold text-bark-brown">
                {participantMode === "clan"
                  ? "Entire clan (auto-synced)"
                  : participantMode === "participants"
                    ? `${participants.map((p) => p.trim()).filter(Boolean).length} player(s)`
                    : `${teams.filter((t) => t.name.trim()).length} team(s)`}
              </span>
            </div>
            <div><span className="text-iron-grey">Discord announcement:</span> <span className="font-semibold text-bark-brown">{postToDiscord ? "Yes" : "No"}</span></div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-parchment-dark">
          {step > 0 && (
            <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={!stepValid[step]}>
              Next
            </Button>
          ) : (
            <Button type="button" onClick={handleCreate} disabled={submitting || !stepValid[0] || !stepValid[1]}>
              {submitting ? "Creating..." : "Create Competition"}
            </Button>
          )}
        </div>
      </Card>

      <h3 className="font-display text-lg text-bark-brown mb-4">Existing Competitions</h3>
      {loadingList ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-parchment-dark border-t-gnome-green rounded-full animate-spin" />
        </div>
      ) : competitions.length === 0 ? (
        <Card hover={false}>
          <p className="text-sm text-iron-grey">No competitions created from this site yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {competitions.map((comp) => (
            <Card key={comp.id} hover={false}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-bark-brown truncate">
                    {comp.title}
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-gnome-green/10 text-gnome-green align-middle">
                      {metricLabel(comp.metric)}
                    </span>
                    {comp.type === "team" && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-iron-grey/10 text-iron-grey align-middle">Team</span>
                    )}
                  </p>
                  <p className="text-xs text-iron-grey">
                    {new Date(comp.starts_at).toLocaleDateString()} – {new Date(comp.ends_at).toLocaleDateString()}
                    {comp.created_by && <span> · by {comp.created_by}</span>}
                  </p>
                  <a
                    href={`https://wiseoldman.net/competitions/${comp.wom_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gnome-green hover:underline"
                  >
                    View on WOM →
                  </a>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => setExpandedId((prev) => (prev === comp.id ? null : comp.id))}>
                    {expandedId === comp.id ? "Hide" : "Manage"}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={deletingId === comp.id} onClick={() => handleDelete(comp)}>
                    {deletingId === comp.id ? "..." : "Delete"}
                  </Button>
                </div>
              </div>
              {expandedId === comp.id && <ManagePanel comp={comp} onChanged={loadList} />}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ManagePanel({ comp, onChanged }: { comp: TrackedCompetition; onChanged: () => void }) {
  const [title, setTitle] = useState(comp.title);
  const [metric, setMetric] = useState(comp.metric);
  const [startsAt, setStartsAt] = useState(toDatetimeLocal(comp.starts_at));
  const [endsAt, setEndsAt] = useState(toDatetimeLocal(comp.ends_at));
  const [savingDetails, setSavingDetails] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [addInput, setAddInput] = useState("");
  const [removeInput, setRemoveInput] = useState("");
  const [busyRsn, setBusyRsn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const saveDetails = async () => {
    setSavingDetails(true);
    setError(null);
    setStatus(null);
    const res = await fetch(`/api/admin/wom-competitions/${comp.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        metric,
        startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
        endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setStatus("Saved.");
      onChanged();
    } else {
      setError(data.error ?? "Failed to save.");
    }
    setSavingDetails(false);
  };

  const refreshStats = async () => {
    setRefreshing(true);
    setError(null);
    setStatus(null);
    const res = await fetch(`/api/admin/wom-competitions/${comp.id}/update-all`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setStatus(data.message);
    else setError(data.error ?? "Failed to refresh.");
    setRefreshing(false);
  };

  const addParticipant = async () => {
    const rsn = addInput.trim();
    if (!rsn) return;
    setBusyRsn(rsn);
    setError(null);
    setStatus(null);
    const res = await fetch(`/api/admin/wom-competitions/${comp.id}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participants: [rsn] }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setStatus(data.message);
      setAddInput("");
      onChanged();
    } else {
      setError(data.error ?? "Failed to add.");
    }
    setBusyRsn(null);
  };

  const removeParticipant = async (rsn: string) => {
    setBusyRsn(rsn);
    setError(null);
    setStatus(null);
    const res = await fetch(`/api/admin/wom-competitions/${comp.id}/participants`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participants: [rsn] }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setStatus(data.message);
      setRemoveInput("");
      onChanged();
    } else {
      setError(data.error ?? "Failed to remove.");
    }
    setBusyRsn(null);
  };

  return (
    <div className="mt-4 pt-4 border-t border-parchment-dark space-y-4">
      {error && (
        <div className="p-3 rounded-md bg-red-accent/10 border border-red-accent/30 text-sm text-red-accent">{error}</div>
      )}
      {status && (
        <div className="p-3 rounded-md bg-gnome-green/10 border border-gnome-green/30 text-sm text-gnome-green">{status}</div>
      )}

      <Link href={`/admin/payouts?competitionId=${comp.id}`} className="text-xs text-gnome-green hover:underline inline-block">
        View Payouts for this Competition →
      </Link>

      <div className="space-y-3">
        <p className="text-xs font-semibold text-bark-brown uppercase tracking-wide">Details</p>
        <div>
          <label className="block text-xs font-semibold text-bark-brown mb-1">Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-bark-brown mb-1">Metric</label>
          <select value={metric} onChange={(e) => setMetric(e.target.value)} className={`${inputClass} cursor-pointer`}>
            {METRIC_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.metrics.map((m) => (
                  <option key={m} value={m}>{metricLabel(m)}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-bark-brown mb-1">Starts</label>
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputClass} />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-bark-brown mb-1">Ends</label>
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputClass} />
          </div>
        </div>
        <Button size="sm" disabled={savingDetails} onClick={saveDetails}>
          {savingDetails ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <div className="pt-3 border-t border-parchment-dark/60">
        <Button size="sm" variant="secondary" disabled={refreshing} onClick={refreshStats}>
          {refreshing ? "Refreshing..." : "Refresh outdated participants' stats"}
        </Button>
        <p className="text-xs text-iron-grey mt-1">Re-scans hiscores for anyone whose data looks stale. Doesn&apos;t change who&apos;s competing.</p>
      </div>

      {comp.type === "classic" && (
        <div className="pt-3 border-t border-parchment-dark/60 space-y-3">
          <p className="text-xs font-semibold text-bark-brown uppercase tracking-wide">Participants</p>

          {!comp.group_linked && comp.participants && comp.participants.length > 0 && (
            <ul className="text-sm text-bark-brown space-y-1">
              {comp.participants.map((rsn) => (
                <li key={rsn} className="flex items-center justify-between gap-2 bg-parchment-dark/30 rounded px-2 py-1">
                  <span className="font-mono">{rsn}</span>
                  <button
                    type="button"
                    disabled={busyRsn === rsn}
                    onClick={() => removeParticipant(rsn)}
                    className="text-red-accent text-xs cursor-pointer disabled:opacity-50"
                  >
                    ✕ Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              placeholder="RSN to add"
              className={`${inputClass} font-mono flex-1`}
            />
            <Button size="sm" disabled={busyRsn === addInput.trim() || !addInput.trim()} onClick={addParticipant}>Add</Button>
          </div>

          {comp.group_linked && (
            <>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={removeInput}
                  onChange={(e) => setRemoveInput(e.target.value)}
                  placeholder="RSN to remove"
                  className={`${inputClass} font-mono flex-1`}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyRsn === removeInput.trim() || !removeInput.trim()}
                  onClick={() => removeParticipant(removeInput.trim())}
                >
                  Remove
                </Button>
              </div>
              <p className="text-xs text-iron-grey">
                This was created from the whole clan roster, so we don&apos;t keep a separate copy of that list here -- adds/removes go straight to WOM.
              </p>
            </>
          )}
        </div>
      )}

      {comp.type === "team" && (
        <p className="text-xs text-iron-grey pt-3 border-t border-parchment-dark/60">
          Team membership isn&apos;t editable from here -- manage teams for this competition directly on WOM.
        </p>
      )}
    </div>
  );
}
