// The weekly SOTW / BotW voting poll: posted from Admin › Weekly SOTW/BotW
// with each answer tied to a skill or boss (or two bosses), then watched by
// the bot (every 30 minutes) and a daily cron. When the poll closes, the
// winner becomes next week's Wise Old Man competition, clan-wide, in the
// usual "Boss of the Week | 11/8 | Name" format. A tie, no votes, or
// automatic setup being off leaves it for staff to pick on the same page.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPollMessage, postToDestination } from "@/lib/discord";
import { getAlertChannel } from "@/lib/alert-channels";
import { createWomCompetition } from "@/lib/wom";
import { WOM_GROUP_ID } from "@/lib/constants";
import { bossName, bossTitleName } from "@/lib/boss-difficulty";
import { loadBossSettings } from "@/lib/boss-difficulty-server";
import { weeklyStartOn, weeklyTitle, type WeeklyKind } from "@/lib/weekly-title";

export interface VoteOption {
  answer_id: number;
  label: string;
  metrics: string[];
}

/** waiting = a clear winner, but automatic setup is off; skipped = staff chose not to set it up. */
export type VotePollStatus = "open" | "created" | "tie" | "no_votes" | "waiting" | "failed" | "skipped";

export interface WeeklyVotePoll {
  id: string;
  poll_id: string | null;
  channel_id: string;
  message_id: string;
  kind: WeeklyKind;
  week_start: string;
  options: VoteOption[];
  closes_at: string;
  status: VotePollStatus;
  vote_counts: Record<string, number> | null;
  winning_answer_id: number | null;
  competition_wom_ids: number[];
  note: string | null;
  attempts: number;
  processed_at: string | null;
  created_by: string | null;
  created_at: string;
}

const WEEK_MS = 7 * 86_400_000;
/** Discord marks a poll final shortly after it ends; past this, go with the counts it shows. */
const FINALIZE_GRACE_MS = 3 * 3_600_000;
/** Stop retrying a poll that keeps failing after this many tries (staff can still create it by hand). */
const MAX_ATTEMPTS = 5;

export { allowedMetrics } from "@/lib/weekly-poll-metrics";

/** Reads Discord's answer counts into { answer_id: votes }, and who's on top. */
export function tally(options: VoteOption[], answerCounts: { id: number; count: number }[] | undefined) {
  const counts: Record<string, number> = Object.fromEntries(options.map((o) => [String(o.answer_id), 0]));
  for (const a of answerCounts ?? []) if (String(a.id) in counts) counts[String(a.id)] = a.count;
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const top = Math.max(0, ...Object.values(counts));
  const leaders = total ? options.filter((o) => counts[String(o.answer_id)] === top).map((o) => o.answer_id) : [];
  return { counts, total, leaders };
}

/**
 * Creates the week's competition(s) for a poll option -- one per skill/boss
 * (an option like "Nightmare + Phosani's" makes two) -- unless one already
 * exists for that metric and start, which is reused.
 */
export async function createCompetitionsForOption(
  supabase: SupabaseClient,
  poll: Pick<WeeklyVotePoll, "kind" | "week_start">,
  option: VoteOption,
  createdBy: string,
): Promise<{ womIds: number[]; created: string[]; reused: string[] }> {
  const groupVerificationCode = process.env.WOM_GROUP_VERIFICATION_CODE;
  if (!groupVerificationCode) throw new Error("WOM_GROUP_VERIFICATION_CODE isn't set, so clan competitions can't be created.");
  const { data: config } = await supabase.from("weekly_competition_config").select("poll_winner_count, poll_announce").eq("id", 1).maybeSingle();
  const { names } = await loadBossSettings(supabase);

  const start = weeklyStartOn(poll.week_start);
  const end = new Date(start.getTime() + WEEK_MS);
  const womIds: number[] = [];
  const created: string[] = [];
  const reused: string[] = [];

  for (const metric of option.metrics) {
    const title = weeklyTitle(poll.kind, start, poll.kind === "botw" ? bossTitleName(metric, names) : bossName(metric));
    // Already set up by hand (or by an earlier try)? Use that one.
    const { data: existing } = await supabase
      .from("wom_competitions")
      .select("wom_id, title")
      .eq("metric", metric)
      .gte("starts_at", new Date(start.getTime() - 12 * 3_600_000).toISOString())
      .lte("starts_at", new Date(start.getTime() + 12 * 3_600_000).toISOString())
      .maybeSingle();
    if (existing) {
      womIds.push(existing.wom_id);
      reused.push(existing.title);
      continue;
    }

    const result = await createWomCompetition({ title, metric, startsAt: start.toISOString(), endsAt: end.toISOString(), groupId: WOM_GROUP_ID, groupVerificationCode });
    const { error } = await supabase.from("wom_competitions").insert({
      wom_id: result.competition.id,
      title,
      metric,
      type: "classic",
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      group_linked: true,
      verification_code: result.verificationCode,
      payout_winner_count: config?.poll_winner_count ?? 10,
      created_by: createdBy,
    });
    if (error) throw new Error(`"${title}" was created on Wise Old Man (competition ${result.competition.id}) but couldn't be saved on the site: ${error.message}`);
    womIds.push(result.competition.id);
    created.push(title);

    if (config?.poll_announce) {
      try {
        const channelId = await getAlertChannel(supabase, "competitions");
        const when = start.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" });
        if (channelId) await postToDestination(channelId, title, `🏆 **New competition:** ${title}\nVoted in by the clan!\nStarts: ${when}\nhttps://wiseoldman.net/competitions/${result.competition.id}`);
      } catch (err) {
        console.error("Weekly poll: competition announcement failed:", err);
      }
    }
  }
  return { womIds, created, reused };
}

/** Creates the competition(s) for one answer of a tracked poll and records it. */
export async function createFromPoll(supabase: SupabaseClient, poll: WeeklyVotePoll, answerId: number, createdBy: string) {
  const option = poll.options.find((o) => o.answer_id === answerId);
  if (!option) throw new Error("That option isn't on this poll.");
  try {
    const { womIds, created, reused } = await createCompetitionsForOption(supabase, poll, option, createdBy);
    const note = [created.length && `Created ${created.join(" and ")}.`, reused.length && `Already set up: ${reused.join(" and ")}.`].filter(Boolean).join(" ");
    await supabase
      .from("weekly_vote_polls")
      .update({ status: "created", winning_answer_id: answerId, competition_wom_ids: womIds, note, processed_at: new Date().toISOString() })
      .eq("id", poll.id);
    return { womIds, note };
  } catch (err) {
    const note = err instanceof Error ? err.message : "Couldn't create the competition.";
    await supabase
      .from("weekly_vote_polls")
      .update({ status: "failed", winning_answer_id: answerId, note, attempts: poll.attempts + 1, processed_at: new Date().toISOString() })
      .eq("id", poll.id);
    throw new Error(note);
  }
}

/**
 * Checks every weekly poll that has closed and isn't dealt with yet. Safe to
 * call often: open polls are skipped until they close, and handled ones are
 * never touched again.
 */
export async function processWeeklyPolls(supabase: SupabaseClient): Promise<{ checked: number; created: number; waiting: number; errors: string[] }> {
  const now = Date.now();
  const { data } = await supabase
    .from("weekly_vote_polls")
    .select("*")
    .in("status", ["open", "failed"])
    .lt("attempts", MAX_ATTEMPTS)
    .lte("closes_at", new Date(now).toISOString())
    .order("closes_at");
  const polls = (data ?? []) as WeeklyVotePoll[];
  const { data: config } = await supabase.from("weekly_competition_config").select("poll_auto_create").eq("id", 1).maybeSingle();
  const autoCreate = config?.poll_auto_create ?? true;

  let created = 0;
  let waiting = 0;
  const errors: string[] = [];
  for (const poll of polls) {
    // A failed creation is retried with the answer it already picked.
    if (poll.status === "failed" && poll.winning_answer_id != null) {
      try {
        await createFromPoll(supabase, poll, poll.winning_answer_id, "Weekly poll");
        created++;
      } catch (e) {
        errors.push((e as Error).message);
      }
      continue;
    }

    let message: { poll?: { results?: { is_finalized?: boolean; answer_counts?: { id: number; count: number }[] } } };
    try {
      message = await getPollMessage(poll.channel_id, poll.message_id);
    } catch (e) {
      const note = `Couldn't read the poll from Discord: ${(e as Error).message}`;
      await supabase.from("weekly_vote_polls").update({ status: "failed", note, attempts: poll.attempts + 1, processed_at: new Date().toISOString() }).eq("id", poll.id);
      errors.push(note);
      continue;
    }
    const results = message.poll?.results;
    if (!results?.is_finalized && now < Date.parse(poll.closes_at) + FINALIZE_GRACE_MS) {
      waiting++;
      continue;
    }

    const { counts, total, leaders } = tally(poll.options, results?.answer_counts);
    const base = { vote_counts: counts, processed_at: new Date().toISOString() };
    if (total === 0) {
      await supabase.from("weekly_vote_polls").update({ ...base, status: "no_votes", note: "Nobody voted. Pick one below to set it up." }).eq("id", poll.id);
    } else if (leaders.length > 1) {
      const names = poll.options.filter((o) => leaders.includes(o.answer_id)).map((o) => o.label);
      await supabase.from("weekly_vote_polls").update({ ...base, status: "tie", note: `Tied: ${names.join(" and ")}. Pick the winner below.` }).eq("id", poll.id);
    } else if (!autoCreate) {
      const winner = poll.options.find((o) => o.answer_id === leaders[0]);
      await supabase.from("weekly_vote_polls").update({ ...base, status: "waiting", winning_answer_id: leaders[0], note: `${winner?.label} won. Automatic setup is off, so create it below when you're ready.` }).eq("id", poll.id);
    } else {
      await supabase.from("weekly_vote_polls").update(base).eq("id", poll.id);
      try {
        await createFromPoll(supabase, { ...poll, vote_counts: counts }, leaders[0], "Weekly poll");
        created++;
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
  }
  return { checked: polls.length, created, waiting, errors };
}
