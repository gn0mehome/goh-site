import { WOMClient, SKILLS, BOSSES, SkillProps, BossProps, NameChangeStatus } from "@wise-old-man/utils";
import { WOM_GROUP_ID, WOM_BASE_URL } from "./constants";

const womClient = new WOMClient({
  apiKey: process.env.WOM_API_KEY,
  userAgent: "Gn0meHome-Website",
});

export interface ClanMember {
  username: string;
  displayName: string;
  type: string;
  build: string;
  role: string;
  exp: number;
  ehp: number;
  ehb: number;
  ttm: number;
  registeredAt: string;
  lastChangedAt: string | null;
}

/** WOM usernames/RSNs vary in spacing/casing (e.g. "gn0me_vlad" vs "Gn0me Vlad") — normalize before matching. */
export function normalizeRsn(s: string): string {
  return s.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

type GroupDetails = Awaited<ReturnType<typeof womClient.groups.getGroupDetails>>;

// getGroupMembers/getGroupDetails both hit the same WOM endpoint, and a
// single page load can trigger many independent role/eligibility checks
// (section visibility resolves all 16 registered sections, each re-checking
// the caller's role) -- without sharing one fetch, that's a dozen-plus
// simultaneous calls to WOM per request, which reliably tripped WOM's rate
// limit and made every feature that depends on this data (staff detection,
// section visibility, RSN matching) silently fall back to its
// least-privileged default. A short cache plus in-flight de-duplication
// collapses concurrent callers onto one real request; failures are cached
// too, briefly, so a rate-limit response doesn't get hammered with retries
// from every caller still in flight.
let groupDetailsCache: { data: GroupDetails | null; expiresAt: number } | null = null;
let groupDetailsInFlight: Promise<GroupDetails | null> | null = null;
const GROUP_DETAILS_SUCCESS_TTL_MS = 30_000;
const GROUP_DETAILS_FAILURE_TTL_MS = 10_000;

async function getCachedGroupDetails(): Promise<GroupDetails | null> {
  if (groupDetailsCache && groupDetailsCache.expiresAt > Date.now()) {
    return groupDetailsCache.data;
  }
  if (groupDetailsInFlight) return groupDetailsInFlight;

  groupDetailsInFlight = (async () => {
    try {
      const data = await womClient.groups.getGroupDetails(WOM_GROUP_ID);
      groupDetailsCache = { data, expiresAt: Date.now() + GROUP_DETAILS_SUCCESS_TTL_MS };
      return data;
    } catch (error) {
      console.error("Failed to fetch group details from WOM:", error);
      groupDetailsCache = { data: null, expiresAt: Date.now() + GROUP_DETAILS_FAILURE_TTL_MS };
      return null;
    } finally {
      groupDetailsInFlight = null;
    }
  })();

  return groupDetailsInFlight;
}

export async function getGroupMembers(): Promise<ClanMember[]> {
  const result = await getCachedGroupDetails();
  const memberships = result?.memberships ?? [];

  return memberships.map((m) => ({
    username: m.player.username,
    displayName: m.player.displayName,
    type: m.player.type,
    build: m.player.build,
    role: m.role,
    exp: m.player.exp,
    ehp: m.player.ehp,
    ehb: m.player.ehb,
    ttm: m.player.ttm,
    registeredAt: m.player.registeredAt.toString(),
    lastChangedAt: m.player.lastChangedAt?.toString() ?? null,
  }));
}

/**
 * If `staleRsn` was renamed in-game (an approved WOM name change), returns
 * the new name -- lets a linked RSN that no longer matches anyone in the
 * live group roster be told apart from someone who actually left the clan.
 * Returns null on no match, or on any WOM API failure (best-effort, never
 * throws -- callers use this to opportunistically fix a stale link, not as
 * a hard requirement).
 */
export async function findRenamedTo(staleRsn: string): Promise<string | null> {
  try {
    const changes = await womClient.nameChanges.searchNameChanges({ username: staleRsn, status: NameChangeStatus.APPROVED });
    const normalized = normalizeRsn(staleRsn);
    const matches = changes.filter((c) => normalizeRsn(c.oldName) === normalized);
    if (matches.length === 0) return null;

    matches.sort((a, b) => {
      const at = a.resolvedAt ? new Date(a.resolvedAt).getTime() : 0;
      const bt = b.resolvedAt ? new Date(b.resolvedAt).getTime() : 0;
      return bt - at;
    });
    return matches[0].newName;
  } catch {
    return null;
  }
}

export async function getGroupDetails(): Promise<GroupDetails | null> {
  return getCachedGroupDetails();
}

export async function getPlayerDetails(username: string) {
  try {
    return await womClient.players.getPlayerDetails(username);
  } catch (error) {
    console.error(`Failed to fetch player ${username} from WOM:`, error);
    return null;
  }
}

/** A player's gains over the last week/month (null on any WOM failure). */
export async function getPlayerGains(username: string, period: "week" | "month") {
  try {
    return await womClient.players.getPlayerGains(username, { period });
  } catch (error) {
    console.error(`Failed to fetch ${period} gains for ${username}:`, error);
    return null;
  }
}

/** Every clan member's standing in one metric (WOM group hiscores), or null on failure. */
export async function getFullGroupHiscores(metric: string) {
  try {
    return await womClient.groups.getGroupHiscores(WOM_GROUP_ID, metric as never, { limit: 500 });
  } catch (error) {
    console.error(`Failed to fetch group hiscores for ${metric}:`, error);
    return null;
  }
}

export async function getGroupAchievements(limit: number = 20) {
  try {
    return await womClient.groups.getGroupAchievements(WOM_GROUP_ID, { limit });
  } catch (error) {
    console.error("Failed to fetch group achievements from WOM:", error);
    return [];
  }
}

export async function getGroupHiscores(metric: string, limit: number = 10) {
  try {
    return await womClient.groups.getGroupHiscores(WOM_GROUP_ID, metric as never, { limit });
  } catch (error) {
    console.error(`Failed to fetch group hiscores for ${metric}:`, error);
    return [];
  }
}

export async function getGroupCompetitions() {
  try {
    return await womClient.groups.getGroupCompetitions(WOM_GROUP_ID);
  } catch (error) {
    console.error("Failed to fetch group competitions from WOM:", error);
    return [];
  }
}

/**
 * Every competition in the clan's group, all pages. Unlike
 * getGroupCompetitions this throws on failure, so a sync can tell "WOM is
 * down" from "there are none".
 */
export async function getAllGroupCompetitions() {
  const all: Awaited<ReturnType<typeof womClient.groups.getGroupCompetitions>> = [];
  for (let offset = 0; offset < 5000; offset += 50) {
    const page = await womClient.groups.getGroupCompetitions(WOM_GROUP_ID, { limit: 50, offset });
    all.push(...page);
    if (page.length < 50) break;
  }
  return all;
}

/** One competition with every participation (throws on failure). */
export async function getCompetitionDetailsOrThrow(id: number) {
  return womClient.competitions.getCompetitionDetails(id);
}

export interface CompetitionLeader {
  displayName: string;
  gained: number;
}

/** Classifies a WOM metric as a skill, boss, or neither -- used to sort a finished competition's auto-captured payouts into "sotw" vs "botw". */
export function classifyMetric(metric: string): "skill" | "boss" | "other" {
  if ((SKILLS as readonly string[]).includes(metric)) return "skill";
  if ((BOSSES as readonly string[]).includes(metric)) return "boss";
  return "other";
}

/** Top N participants by progress gained, for a single competition -- who's currently leading (or won, once it's over). */
export async function getCompetitionLeaders(id: number, limit: number = 3): Promise<CompetitionLeader[]> {
  try {
    const details = await womClient.competitions.getCompetitionDetails(id);
    return [...details.participations]
      .sort((a, b) => b.progress.gained - a.progress.gained)
      .slice(0, limit)
      .map((p) => ({ displayName: p.player.displayName, gained: p.progress.gained }));
  } catch (error) {
    console.error(`Failed to fetch competition ${id} leaders from WOM:`, error);
    return [];
  }
}

export interface CompetitionStanding {
  rank: number;
  displayName: string;
  gained: number;
}

// Full standings for a competition, cached briefly with in-flight
// de-duplication -- the plugin's reminders digest asks for this on every
// member's poll, and WOM's rate limit has been tripped by exactly that kind
// of fan-out before (see /api/site-sections/visible's history). 60s is
// plenty: standings only move as WOM re-tracks players.
const standingsCache = new Map<number, { data: CompetitionStanding[]; expiresAt: number }>();
const standingsInFlight = new Map<number, Promise<CompetitionStanding[]>>();
const STANDINGS_TTL_MS = 60_000;

/** Every participant ranked by progress gained (1 = leading), cached ~60s. Empty on any WOM failure. */
export async function getCompetitionStandings(id: number): Promise<CompetitionStanding[]> {
  const cached = standingsCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const inFlight = standingsInFlight.get(id);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const details = await womClient.competitions.getCompetitionDetails(id);
      const ranked = [...details.participations]
        .sort((a, b) => b.progress.gained - a.progress.gained)
        .map((p, i) => ({ rank: i + 1, displayName: p.player.displayName, gained: p.progress.gained }));
      standingsCache.set(id, { data: ranked, expiresAt: Date.now() + STANDINGS_TTL_MS });
      return ranked;
    } catch (error) {
      console.error(`Failed to fetch competition ${id} standings from WOM:`, error);
      return [];
    } finally {
      standingsInFlight.delete(id);
    }
  })();
  standingsInFlight.set(id, promise);
  return promise;
}

export interface TeamProgress {
  teamName: string;
  gained: number;
}

/** Per-team total gained for a team competition -- sums each participant's progress.gained by their teamName. Used to auto-mark bingo tiles complete once a team crosses a tile's target value. */
export async function getCompetitionTeamProgress(womId: number): Promise<TeamProgress[]> {
  try {
    const details = await womClient.competitions.getCompetitionDetails(womId);
    const totals = new Map<string, number>();
    for (const p of details.participations) {
      const team = p.teamName ?? "";
      totals.set(team, (totals.get(team) ?? 0) + p.progress.gained);
    }
    return [...totals.entries()].map(([teamName, gained]) => ({ teamName, gained }));
  } catch (error) {
    console.error(`Failed to fetch competition ${womId} team progress from WOM:`, error);
    return [];
  }
}

export interface GroupGainEntry {
  username: string;
  displayName: string;
  gained: number;
}

/** Per-member gained amount for one metric (e.g. "ehp", "ehb", a skill, or a boss) over a date range. */
export async function getGroupGains(metric: string, startDate: Date, endDate: Date, limit: number = 500): Promise<GroupGainEntry[]> {
  try {
    const result = await womClient.groups.getGroupGains(WOM_GROUP_ID, { metric: metric as never, startDate, endDate }, { limit });
    return result.map((r) => ({
      username: r.player.username,
      displayName: r.player.displayName,
      gained: r.data.gained,
    }));
  } catch (error) {
    console.error(`Failed to fetch group gains for ${metric}:`, error);
    return [];
  }
}

export interface MetricGainTotal {
  metric: string;
  metricType: "skill" | "boss";
  name: string;
  totalGained: number;
}

/**
 * Clan-wide total XP/KC gained for every skill and boss over a date range --
 * "as a whole," not per-member. WOM has no single call that returns every
 * metric at once, so this is ~79 sequential-in-small-batches getGroupGains
 * calls (one per skill/boss), meant to run from a daily cron, not live on a
 * page load. "overall" is skipped since it's just the sum of every skill
 * and would dwarf everything else in a "what's the clan grinding" ranking.
 */
export async function getAllSkillBossGains(startDate: Date, endDate: Date): Promise<MetricGainTotal[]> {
  const metrics: { key: string; type: "skill" | "boss"; name: string }[] = [
    ...SKILLS.filter((s) => s !== "overall").map((s) => ({ key: s, type: "skill" as const, name: SkillProps[s].name })),
    ...BOSSES.map((b) => ({ key: b, type: "boss" as const, name: BossProps[b].name })),
  ];

  const BATCH_SIZE = 8;
  const results: MetricGainTotal[] = [];

  for (let i = 0; i < metrics.length; i += BATCH_SIZE) {
    const batch = metrics.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async ({ key, type, name }) => {
        const gains = await getGroupGains(key, startDate, endDate);
        const totalGained = gains.reduce((sum, g) => sum + Math.max(0, g.gained), 0);
        return { metric: key, metricType: type, name, totalGained };
      })
    );
    results.push(...batchResults);
  }

  return results;
}

export interface CreateCompetitionResult {
  competition: { id: number };
  verificationCode: string;
}

/**
 * Creates a new WOM competition. Unlike the read-only helpers above, this
 * lets errors propagate instead of swallowing them -- a bad/missing group
 * verification code, invalid RSNs, etc. are real problems the admin needs
 * to see, not something to silently return an empty result for.
 *
 * Calls the REST API directly rather than going through `womClient` --
 * @wise-old-man/utils's `CreateCompetitionPayload` type requires either
 * `participants` or `teams` to always be present, but the actual API also
 * accepts a bare `groupId` (no participants/teams key at all) to auto-fill
 * every group member, per their docs. Passing an empty `participants: []`
 * alongside `groupId` to satisfy the client's type is untested and risks
 * silently creating a competition with zero participants, so this sends
 * exactly the shape their docs describe instead.
 */
export async function createWomCompetition(payload: {
  title: string;
  metric: string;
  startsAt: string;
  endsAt: string;
  groupId?: number;
  groupVerificationCode?: string;
  participants?: string[];
  teams?: { name: string; participants: string[] }[];
}): Promise<CreateCompetitionResult> {
  const res = await fetch(`${WOM_BASE_URL}/competitions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.WOM_API_KEY ?? "",
      "User-Agent": "Gn0meHome-Website",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message ?? `WOM competition creation failed (${res.status})`);
  }
  return data as CreateCompetitionResult;
}

/** Deletes a WOM competition. Requires that competition's own verification code, or its host group's. */
export async function deleteWomCompetition(womId: number, verificationCode: string) {
  return womClient.competitions.deleteCompetition(womId, verificationCode);
}

/**
 * Edits a WOM competition's title/metric/dates, and/or wholesale-replaces
 * its participants or teams list. Unlike `createWomCompetition`, the
 * client's `EditCompetitionPayload` type has no problematic union (no
 * groupId case to work around), so this goes through `womClient` directly.
 */
export async function editWomCompetition(
  womId: number,
  payload: { title?: string; metric?: string; startsAt?: Date; endsAt?: Date; participants?: string[]; teams?: { name: string; participants: string[] }[] },
  verificationCode: string
) {
  return womClient.competitions.editCompetition(womId, payload as never, verificationCode);
}

/** Adds participants to an existing competition (works even if it's group-linked). */
export async function addWomParticipants(womId: number, participants: string[], verificationCode: string) {
  return womClient.competitions.addParticipants(womId, participants, verificationCode);
}

/** Removes participants from an existing competition. */
export async function removeWomParticipants(womId: number, participants: string[], verificationCode: string) {
  return womClient.competitions.removeParticipants(womId, participants, verificationCode);
}

/** Forces WOM to refresh (re-scan hiscores for) any outdated participants -- does not change who's participating. */
export async function updateAllWomParticipants(womId: number, verificationCode: string) {
  return womClient.competitions.updateAll(womId, verificationCode);
}
