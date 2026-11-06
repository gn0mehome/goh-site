/**
 * Client for the Gn0me Home website API.
 * Uses the same DISCORD_WEBHOOK_SECRET for auth.
 */

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const SECRET = process.env.DISCORD_WEBHOOK_SECRET ?? "";

async function apiCall(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SECRET}`,
      ...options.headers,
    },
  });
  return res;
}

/** Look up a user's linked RSN by Discord ID */
export async function lookupUser(discordId: string) {
  const res = await apiCall(`/api/users/lookup?discord_id=${discordId}`);
  if (!res.ok) return null;
  return res.json() as Promise<{
    discord_id: string;
    discord_username: string;
    rsn: string | null;
    rsn_verified: boolean;
    clan_rank: string | null;
  }>;
}

/** Look up by RSN */
export async function lookupByRsn(rsn: string) {
  const res = await apiCall(`/api/users/lookup?rsn=${encodeURIComponent(rsn)}`);
  if (!res.ok) return null;
  return res.json();
}

/** Get linked RSN for a Discord user, or return null */
export async function getLinkedRsn(discordId: string): Promise<string | null> {
  const user = await lookupUser(discordId);
  return user?.rsn ?? null;
}

export interface BingoBoardSummary {
  eventId: string;
  name: string;
  endsAt: string | null;
  url: string;
  teamId: string;
  teamName: string;
  standings: { rank: number; name: string; total: number; tilesDone: number; lines: number; mine: boolean }[];
  tiles: { id: string; position: number; title: string; kind: "proof" | "auto"; points: number; done: boolean; progress: string }[];
}

/** The live bingo boards a Discord user is on (empty if not linked or on none). */
export async function getBingoBoards(discordId: string): Promise<{ linked: boolean; boards: BingoBoardSummary[] }> {
  const res = await apiCall(`/api/bot/bingo?discordId=${encodeURIComponent(discordId)}`);
  if (!res.ok) return { linked: false, boards: [] };
  return res.json();
}

/** Sends a bingo proof screenshot for review. */
export async function submitBingoProof(payload: { discordId: string; tileId: string; attachmentUrls: string[]; quantity?: number; note?: string | null }) {
  const res = await apiCall("/api/bot/bingo", { method: "POST", body: JSON.stringify({ action: "submit", ...payload }) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, ...json } as { ok: boolean; error?: string; tileTitle?: string; eventName?: string; teamName?: string };
}

/** Asks the site to refresh live boards' tracked tiles (it skips fresh ones). */
export async function syncBingo() {
  await apiCall("/api/bot/bingo", { method: "POST", body: JSON.stringify({ action: "sync" }) }).catch(() => undefined);
}

/** Asks the site to check WikiSync for quest events (it skips ones checked recently). */
export async function syncQuests() {
  await apiCall("/api/bot/quests", { method: "POST", body: JSON.stringify({ action: "sync" }) }).catch(() => undefined);
}

/** Asks the site to check closed weekly SOTW/BotW polls and set up the winners' competitions. */
export async function syncWeeklyPoll() {
  await apiCall("/api/bot/weekly-poll", { method: "POST", body: "{}" }).catch(() => undefined);
}

/** Asks the site to read DropTracker's drop feed (it skips when no bingo is live). */
export async function syncDroptracker() {
  await apiCall("/api/bot/droptracker", { method: "POST", body: "{}" }).catch(() => undefined);
}
