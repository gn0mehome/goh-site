// Bingo Night on the server: the database side of lib/bingo-night/core.ts.
// Everything random or judged (cards, draws, claim checks) happens here; the
// player page and stream view only show what this returns.

import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  canClaim,
  cardSignature,
  checkClaim,
  controlStatus,
  drawChecked,
  getPattern,
  labelFor,
  makeCard,
  rsnKey,
  takeOver,
  type Card,
  type GameConfig,
  type PatternId,
} from "./core";

export type GameStatus = "draft" | "live" | "finished";
export type RoundStatus = "open" | "live" | "closed";
export type ClaimStatus = "pending" | "not_bingo" | "confirmed" | "rejected";

export interface GameRow {
  id: string;
  name: string;
  theme: string;
  card_mode: "numbers" | "words";
  word_set: string | null;
  words: string[] | null;
  winner_message: string;
  status: GameStatus;
  scheduled_for: string | null;
  current_round_id: string | null;
  host_id: string | null;
  host_name: string | null;
  host_last_seen: string | null;
  created_by: string | null;
  created_at: string;
  launched_at: string | null;
  ended_at: string | null;
}

export interface RoundRow {
  id: string;
  game_id: string;
  number: number;
  pattern: PatternId;
  status: RoundStatus;
  calls: { v: number; at: string }[];
  call_count: number;
  winner_card_ids: string[];
  opened_at: string;
  started_at: string | null;
  closed_at: string | null;
}

export interface CardRow {
  id: string;
  game_id: string;
  rsn: string;
  rsn_key: string;
  user_id: string | null;
  member: boolean;
  player_key_hash: string;
  ip_hash: string | null;
  squares: (number | null)[];
  signature: string;
  issued_for_round: number;
  replaced_by: string | null;
  active: boolean;
  created_at: string;
}

export interface ClaimRow {
  id: string;
  game_id: string;
  round_id: string;
  card_id: string;
  call_count: number;
  valid: boolean;
  matched: number[] | null;
  won_at_call: number | null;
  status: ClaimStatus;
  note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/** A refusal to show the person as is (400-style), as opposed to a crash. */
export class BingoError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function bingoDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new BingoError("The database isn't set up.", 503);
  return createClient(url, key, { auth: { persistSession: false } });
}

export const gameConfig = (g: Pick<GameRow, "card_mode" | "words">): GameConfig =>
  g.card_mode === "words" ? { mode: "words", words: g.words ?? [] } : { mode: "numbers" };

export const callValues = (r: Pick<RoundRow, "calls">) => r.calls.map((c) => c.v);

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Players' keys are random strings made in their browser; only a hash is stored. */
export function hashPlayerKey(key: unknown): string {
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new BingoError("This browser's player key is missing. Refresh the page and try again.");
  return sha(`bingo-night:${key}`);
}

/** A one-way stand-in for the caller's IP, for the new-card limit (the IP itself isn't stored). */
export function hashIp(headers: Headers): string | null {
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip");
  return ip ? sha(`bingo-night-ip:${process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-16) ?? ""}:${ip}`) : null;
}

const MAX_NEW_CARDS_PER_IP_HOUR = 10;

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function liveGame(sb: SupabaseClient): Promise<GameRow | null> {
  const { data } = await sb.from("bingo_night_games").select("*").eq("status", "live").maybeSingle();
  return (data as GameRow) ?? null;
}

export async function getRound(sb: SupabaseClient, id: string | null): Promise<RoundRow | null> {
  if (!id) return null;
  const { data } = await sb.from("bingo_night_rounds").select("*").eq("id", id).maybeSingle();
  return (data as RoundRow) ?? null;
}

export interface PublicState {
  game: { id: string; name: string; theme: string; mode: "numbers" | "words"; words: string[] | null; winnerMessage: string } | null;
  round: {
    id: string;
    number: number;
    pattern: PatternId;
    status: RoundStatus;
    calls: number[];
    winners: { cardId: string; rsn: string }[];
  } | null;
  /** Earlier rounds' winners, newest first. */
  pastWinners: { round: number; rsn: string }[];
  /** When nothing is live: the next game, if one has a date. */
  next: { name: string; at: string } | null;
  serverTime: string;
}

/** What every player and the stream view see. The same for everyone, so it can be cached for a second. */
export async function publicState(sb: SupabaseClient): Promise<PublicState> {
  const serverTime = new Date().toISOString();
  const game = await liveGame(sb);
  if (!game) {
    const { data } = await sb
      .from("bingo_night_games")
      .select("name, scheduled_for")
      .eq("status", "draft")
      .gte("scheduled_for", new Date(Date.now() - 6 * 3_600_000).toISOString())
      .order("scheduled_for")
      .limit(1);
    const n = data?.[0];
    return { game: null, round: null, pastWinners: [], next: n ? { name: n.name, at: n.scheduled_for } : null, serverTime };
  }
  const { data: rounds } = await sb.from("bingo_night_rounds").select("id, number, winner_card_ids").eq("game_id", game.id).order("number", { ascending: false });
  const round = await getRound(sb, game.current_round_id);
  const winnerIds = [...new Set((rounds ?? []).flatMap((r) => r.winner_card_ids as string[]))];
  const names = new Map<string, string>();
  if (winnerIds.length) {
    const { data } = await sb.from("bingo_night_cards").select("id, rsn").in("id", winnerIds);
    for (const c of data ?? []) names.set(c.id, c.rsn);
  }
  return {
    game: { id: game.id, name: game.name, theme: game.theme, mode: game.card_mode, words: game.card_mode === "words" ? game.words : null, winnerMessage: game.winner_message },
    round: round && {
      id: round.id,
      number: round.number,
      pattern: round.pattern,
      status: round.status,
      calls: callValues(round),
      winners: round.winner_card_ids.map((id) => ({ cardId: id, rsn: names.get(id) ?? "?" })),
    },
    pastWinners: (rounds ?? [])
      .filter((r) => r.id !== round?.id)
      .flatMap((r) => (r.winner_card_ids as string[]).map((id) => ({ round: r.number as number, rsn: names.get(id) ?? "?" }))),
    next: null,
    serverTime,
  };
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export interface PlayerCard {
  id: string;
  rsn: string;
  member: boolean;
  squares: (number | null)[];
  /** Winning rounds' numbers, for showing the winner message. */
  wonRounds: number[];
}

async function toPlayerCard(sb: SupabaseClient, card: CardRow): Promise<PlayerCard> {
  const { data } = await sb.from("bingo_night_rounds").select("number").eq("game_id", card.game_id).contains("winner_card_ids", [card.id]);
  return { id: card.id, rsn: card.rsn, member: card.member, squares: card.squares, wonRounds: (data ?? []).map((r) => r.number) };
}

async function activeCard(sb: SupabaseClient, gameId: string, keyHash: string): Promise<CardRow | null> {
  const { data } = await sb.from("bingo_night_cards").select("*").eq("game_id", gameId).eq("player_key_hash", keyHash).eq("active", true).order("created_at", { ascending: false }).limit(1);
  return (data?.[0] as CardRow) ?? null;
}

async function requireLive(sb: SupabaseClient): Promise<{ game: GameRow; round: RoundRow | null }> {
  const game = await liveGame(sb);
  if (!game) throw new BingoError("No game is live right now.", 409);
  return { game, round: await getRound(sb, game.current_round_id) };
}

/** Makes and saves a new card that no one else in the game has. */
async function newCard(sb: SupabaseClient, game: GameRow, round: RoundRow | null, fields: Pick<CardRow, "rsn" | "user_id" | "member" | "player_key_hash" | "ip_hash">): Promise<CardRow> {
  const config = gameConfig(game);
  for (let i = 0; i < 6; i++) {
    const card: Card = makeCard(config);
    const { data, error } = await sb
      .from("bingo_night_cards")
      .insert({ ...fields, game_id: game.id, rsn_key: rsnKey(fields.rsn), squares: card.squares, signature: cardSignature(card), issued_for_round: round?.number ?? 0 })
      .select("*")
      .single();
    if (!error) return data as CardRow;
    if (error.code !== "23505") throw new Error(error.message); // anything but "that card already exists"
  }
  throw new Error("Couldn't make a unique card.");
}

async function checkIpLimit(sb: SupabaseClient, ipHash: string | null) {
  if (!ipHash) return;
  const { count } = await sb
    .from("bingo_night_cards")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((count ?? 0) >= MAX_NEW_CARDS_PER_IP_HOUR) throw new BingoError("Too many new cards from this connection. Try again in a little while.", 429);
}

/** The card this browser already has in the live game, if any. */
export async function findCard(sb: SupabaseClient, playerKey: unknown): Promise<PlayerCard | null> {
  const keyHash = hashPlayerKey(playerKey);
  const game = await liveGame(sb);
  if (!game) return null;
  const card = await activeCard(sb, game.id, keyHash);
  return card ? toPlayerCard(sb, card) : null;
}

/** Gets this browser a card (or gives back the one it already has). */
export async function joinGame(
  sb: SupabaseClient,
  input: { playerKey: unknown; rsn: string; userId: string | null; member: boolean; ipHash: string | null },
): Promise<PlayerCard> {
  const keyHash = hashPlayerKey(input.playerKey);
  const { game, round } = await requireLive(sb);
  const existing = await activeCard(sb, game.id, keyHash);
  if (existing) return toPlayerCard(sb, existing);
  await checkIpLimit(sb, input.ipHash);
  const card = await newCard(sb, game, round, { rsn: input.rsn, user_id: input.userId, member: input.member, player_key_hash: keyHash, ip_hash: input.ipHash });
  return toPlayerCard(sb, card);
}

/** Get a new card: only before the first round or while a round is open (never mid-round). */
export async function swapCard(sb: SupabaseClient, input: { playerKey: unknown; ipHash: string | null }): Promise<PlayerCard> {
  const keyHash = hashPlayerKey(input.playerKey);
  const { game, round } = await requireLive(sb);
  if (round && round.status !== "open") throw new BingoError(round.status === "live" ? "Cards are locked while a round is being played." : "You can swap cards once the host opens the next round.", 409);
  const old = await activeCard(sb, game.id, keyHash);
  if (!old) throw new BingoError("You don't have a card yet.", 404);
  await checkIpLimit(sb, input.ipHash);
  const card = await newCard(sb, game, round, { rsn: old.rsn, user_id: old.user_id, member: old.member, player_key_hash: keyHash, ip_hash: input.ipHash });
  await sb.from("bingo_night_cards").update({ active: false, replaced_by: card.id }).eq("id", old.id);
  return toPlayerCard(sb, card);
}

export interface ClaimOutcome {
  valid: boolean;
  message: string;
  retryInMs?: number;
}

/** A BINGO press: checked against the round's calls, never the player's marks. */
export async function claimBingo(sb: SupabaseClient, playerKey: unknown): Promise<ClaimOutcome> {
  const keyHash = hashPlayerKey(playerKey);
  const { game, round } = await requireLive(sb);
  if (!round || round.status !== "live") throw new BingoError("BINGO opens once the round starts.", 409);
  const card = await activeCard(sb, game.id, keyHash);
  if (!card) throw new BingoError("You don't have a card yet.", 404);
  if (round.winner_card_ids.includes(card.id)) return { valid: true, message: "Confirmed! You've already won this round." };

  const { data: history } = await sb.from("bingo_night_claims").select("created_at, valid").eq("card_id", card.id).eq("round_id", round.id);
  const now = Date.now();
  const allowed = canClaim((history ?? []).map((h) => ({ at: Date.parse(h.created_at), valid: h.valid })), now);
  if (!allowed.ok) return { valid: false, message: allowed.reason, retryInMs: allowed.retryInMs };

  const result = checkClaim({ squares: card.squares }, callValues(round), round.pattern);
  await sb.from("bingo_night_claims").insert({
    game_id: game.id,
    round_id: round.id,
    card_id: card.id,
    call_count: result.callCount,
    valid: result.valid,
    matched: result.matched,
    won_at_call: result.wonAtCall,
    status: result.valid ? "pending" : "not_bingo",
  });
  return result.valid ? { valid: true, message: "That's a BINGO! The host is checking it now." } : { valid: false, message: "Not yet, keep playing!" };
}

// ---------------------------------------------------------------------------
// The host
// ---------------------------------------------------------------------------

export interface Staff {
  id: string;
  name: string;
}

export async function getGame(sb: SupabaseClient, id: string): Promise<GameRow> {
  const { data } = await sb.from("bingo_night_games").select("*").eq("id", id).maybeSingle();
  if (!data) throw new BingoError("That game doesn't exist.", 404);
  return data as GameRow;
}

const lockOf = (g: GameRow) => (g.host_id ? { hostId: g.host_id, lastSeen: g.host_last_seen ? Date.parse(g.host_last_seen) : 0 } : null);

export function hostStatus(g: GameRow, staff: Staff) {
  return controlStatus(lockOf(g), staff.id, Date.now());
}

/** Take the controls (or keep them). Without `force`, refuses while another host is active. */
export async function takeControl(sb: SupabaseClient, g: GameRow, staff: Staff, force = false): Promise<GameRow> {
  const lock = takeOver(lockOf(g), staff.id, Date.now(), force);
  if (!lock) throw new BingoError(`${g.host_name ?? "Another staff member"} is hosting right now.`, 409);
  const { data } = await sb
    .from("bingo_night_games")
    .update({ host_id: staff.id, host_name: staff.name, host_last_seen: new Date(lock.lastSeen).toISOString() })
    .eq("id", g.id)
    .select("*")
    .single();
  return data as GameRow;
}

/** Host-only actions: the caller must hold the controls (taking them if no one does). */
async function asHost(sb: SupabaseClient, gameId: string, staff: Staff): Promise<GameRow> {
  const g = await getGame(sb, gameId);
  if (g.status !== "live") throw new BingoError("This game isn't live.", 409);
  const s = hostStatus(g, staff);
  if (s === "host") return g.host_id === staff.id ? heartbeat(sb, g, staff) : takeControl(sb, g, staff);
  throw new BingoError(`${g.host_name ?? "Another staff member"} has the controls. Press Take over to call the game yourself.`, 409);
}

/** Keeps the host's lock fresh (the console calls this every couple of seconds; it writes at most every 10s). */
export async function heartbeat(sb: SupabaseClient, g: GameRow, staff: Staff): Promise<GameRow> {
  if (g.host_id !== staff.id) return g;
  if (g.host_last_seen && Date.now() - Date.parse(g.host_last_seen) < 10_000) return g;
  const at = new Date().toISOString();
  await sb.from("bingo_night_games").update({ host_last_seen: at }).eq("id", g.id).eq("host_id", staff.id);
  return { ...g, host_last_seen: at };
}

export async function launchGame(sb: SupabaseClient, gameId: string, staff: Staff) {
  const g = await getGame(sb, gameId);
  if (g.status !== "draft") throw new BingoError("Only a draft can be launched.");
  const live = await liveGame(sb);
  if (live) throw new BingoError(`"${live.name}" is already live. End it before launching another.`, 409);
  const { error } = await sb
    .from("bingo_night_games")
    .update({ status: "live", launched_at: new Date().toISOString(), host_id: staff.id, host_name: staff.name, host_last_seen: new Date().toISOString(), current_round_id: null })
    .eq("id", gameId)
    .eq("status", "draft");
  if (error) throw new BingoError(error.code === "23505" ? "Another game is already live." : error.message, 409);
}

export async function openRound(sb: SupabaseClient, gameId: string, staff: Staff, pattern: string) {
  const g = await asHost(sb, gameId, staff);
  getPattern(pattern);
  const current = await getRound(sb, g.current_round_id);
  if (current && current.status !== "closed") throw new BingoError("End the current round first.", 409);
  const { data, error } = await sb
    .from("bingo_night_rounds")
    .insert({ game_id: g.id, number: (current?.number ?? 0) + 1, pattern })
    .select("id")
    .single();
  if (error) throw new BingoError(error.message, 409);
  await sb.from("bingo_night_games").update({ current_round_id: data.id }).eq("id", g.id);
}

/** Changes the pattern of a round that hasn't started yet. */
export async function setPattern(sb: SupabaseClient, gameId: string, staff: Staff, pattern: string) {
  const g = await asHost(sb, gameId, staff);
  getPattern(pattern);
  const r = await getRound(sb, g.current_round_id);
  if (!r || r.status !== "open") throw new BingoError("The pattern can only change before the round starts.", 409);
  await sb.from("bingo_night_rounds").update({ pattern }).eq("id", r.id).eq("status", "open");
}

export async function startRound(sb: SupabaseClient, gameId: string, staff: Staff) {
  const g = await asHost(sb, gameId, staff);
  const r = await getRound(sb, g.current_round_id);
  if (!r || r.status !== "open") throw new BingoError("Open a round first.", 409);
  await sb.from("bingo_night_rounds").update({ status: "live", started_at: new Date().toISOString() }).eq("id", r.id).eq("status", "open");
}

/** Draws one call. `expected` is the call count the host's screen shows, so a double click can't draw twice. */
export async function draw(sb: SupabaseClient, gameId: string, staff: Staff, expected: number): Promise<{ value: number; label: string }> {
  const g = await asHost(sb, gameId, staff);
  const r = await getRound(sb, g.current_round_id);
  if (!r || r.status !== "live") throw new BingoError("Start the round before drawing.", 409);
  const config = gameConfig(g);
  const res = drawChecked(config, callValues(r), expected);
  if (!res.ok) throw new BingoError(res.reason === "stale" ? "Someone already drew that call. The screen has caught up." : "Everything has been called.", 409);
  const calls = [...r.calls, { v: res.call, at: new Date().toISOString() }];
  const { data } = await sb.from("bingo_night_rounds").update({ calls, call_count: calls.length }).eq("id", r.id).eq("call_count", expected).eq("status", "live").select("id");
  if (!data?.length) throw new BingoError("Someone already drew that call. The screen has caught up.", 409);
  return { value: res.call, label: labelFor(config, res.call) };
}

/** Takes back the last call (not once a winner's confirmed), and rechecks every waiting claim. */
export async function undoCall(sb: SupabaseClient, gameId: string, staff: Staff, expected: number) {
  const g = await asHost(sb, gameId, staff);
  const r = await getRound(sb, g.current_round_id);
  if (!r || r.status !== "live" || !r.calls.length) throw new BingoError("There's no call to undo.", 409);
  if (r.winner_card_ids.length) throw new BingoError("A winner has been confirmed this round, so calls can't be undone.", 409);
  if (r.call_count !== expected) throw new BingoError("The calls changed since your screen last updated. Try again.", 409);
  const calls = r.calls.slice(0, -1);
  const { data } = await sb.from("bingo_night_rounds").update({ calls, call_count: calls.length }).eq("id", r.id).eq("call_count", expected).select("id");
  if (!data?.length) throw new BingoError("The calls changed since your screen last updated. Try again.", 409);
  await recheckClaims(sb, r.id, r.pattern, calls.map((c) => c.v));
}

async function recheckClaims(sb: SupabaseClient, roundId: string, pattern: PatternId, calls: number[]) {
  const { data: pending } = await sb.from("bingo_night_claims").select("id, card_id").eq("round_id", roundId).eq("status", "pending");
  if (!pending?.length) return;
  const { data: cards } = await sb.from("bingo_night_cards").select("id, squares").in("id", pending.map((p) => p.card_id));
  const squares = new Map((cards ?? []).map((c) => [c.id, c.squares]));
  for (const p of pending) {
    const res = checkClaim({ squares: squares.get(p.card_id) ?? [] }, calls, pattern);
    await sb
      .from("bingo_night_claims")
      .update(
        res.valid
          ? { matched: res.matched, won_at_call: res.wonAtCall }
          : { valid: false, matched: null, won_at_call: null, status: "not_bingo", note: "Not bingo any more after the last call was undone." },
      )
      .eq("id", p.id);
  }
}

export async function reviewClaim(sb: SupabaseClient, gameId: string, staff: Staff, claimId: string, decision: "confirm" | "reject", note: string | null) {
  const g = await asHost(sb, gameId, staff);
  const { data: claim } = await sb.from("bingo_night_claims").select("*").eq("id", claimId).eq("game_id", g.id).maybeSingle();
  if (!claim) throw new BingoError("That claim isn't in this game.", 404);
  const r = await getRound(sb, claim.round_id);
  if (!r || r.id !== g.current_round_id) throw new BingoError("That claim is from an earlier round.", 409);
  if (decision === "confirm") {
    if (!claim.valid) throw new BingoError("That card isn't a bingo, so it can't win.", 409);
    if (!r.winner_card_ids.includes(claim.card_id)) await sb.from("bingo_night_rounds").update({ winner_card_ids: [...r.winner_card_ids, claim.card_id] }).eq("id", r.id);
    // Any other claims by the same card this round are settled too.
    await sb.from("bingo_night_claims").update({ status: "confirmed", note, reviewed_by: staff.name, reviewed_at: new Date().toISOString() }).eq("id", claimId);
  } else {
    if (r.winner_card_ids.includes(claim.card_id) && claim.status === "confirmed") {
      await sb.from("bingo_night_rounds").update({ winner_card_ids: r.winner_card_ids.filter((id) => id !== claim.card_id) }).eq("id", r.id);
    }
    await sb.from("bingo_night_claims").update({ status: "rejected", note, reviewed_by: staff.name, reviewed_at: new Date().toISOString() }).eq("id", claimId);
  }
}

export async function endRound(sb: SupabaseClient, gameId: string, staff: Staff) {
  const g = await asHost(sb, gameId, staff);
  const r = await getRound(sb, g.current_round_id);
  if (!r || r.status === "closed") throw new BingoError("There's no round to end.", 409);
  await sb.from("bingo_night_rounds").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", r.id);
}

export async function endGame(sb: SupabaseClient, gameId: string, staff: Staff) {
  const g = await asHost(sb, gameId, staff);
  const r = await getRound(sb, g.current_round_id);
  if (r && r.status !== "closed") await sb.from("bingo_night_rounds").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", r.id);
  await sb.from("bingo_night_games").update({ status: "finished", ended_at: new Date().toISOString(), host_id: null, host_name: null, host_last_seen: null }).eq("id", g.id);
}

// ---------------------------------------------------------------------------
// The host's console view
// ---------------------------------------------------------------------------

export interface ConsoleClaim {
  id: string;
  rsn: string;
  member: boolean;
  duplicateRsn: boolean;
  createdAt: string;
  callCount: number;
  valid: boolean;
  matched: number[] | null;
  wonAtCall: number | null;
  status: ClaimStatus;
  note: string | null;
  reviewedBy: string | null;
  squares: (number | null)[];
}

export interface ConsoleState {
  game: GameRow;
  control: "host" | "can_take_over" | "ask_to_take_over";
  round: RoundRow | null;
  rounds: { number: number; pattern: PatternId; status: RoundStatus; calls: number; winners: string[] }[];
  claims: ConsoleClaim[];
  players: number;
  cardsMade: number;
  duplicateRsns: string[];
}

export async function consoleState(sb: SupabaseClient, gameId: string, staff: Staff): Promise<ConsoleState> {
  let game = await getGame(sb, gameId);
  if (game.status === "live") game = await heartbeat(sb, game, staff);
  const [{ data: rounds }, { data: cards }] = await Promise.all([
    sb.from("bingo_night_rounds").select("*").eq("game_id", game.id).order("number"),
    sb.from("bingo_night_cards").select("id, rsn, rsn_key, member, active, squares").eq("game_id", game.id),
  ]);
  const allCards = cards ?? [];
  const byId = new Map(allCards.map((c) => [c.id, c]));
  const active = allCards.filter((c) => c.active);
  const keyCount = new Map<string, number>();
  for (const c of active) keyCount.set(c.rsn_key, (keyCount.get(c.rsn_key) ?? 0) + 1);
  const dupKeys = new Set([...keyCount].filter(([, n]) => n > 1).map(([k]) => k));

  const round = (rounds ?? []).find((r) => r.id === game.current_round_id) as RoundRow | undefined;
  const { data: claims } = round
    ? await sb.from("bingo_night_claims").select("*").eq("round_id", round.id).order("created_at", { ascending: false }).limit(200)
    : { data: [] as ClaimRow[] };

  return {
    game,
    control: game.status === "live" ? hostStatus(game, staff) : "host",
    round: round ?? null,
    rounds: (rounds ?? []).map((r) => ({
      number: r.number,
      pattern: r.pattern,
      status: r.status,
      calls: r.call_count,
      winners: (r.winner_card_ids as string[]).map((id) => byId.get(id)?.rsn ?? "?"),
    })),
    claims: ((claims ?? []) as ClaimRow[]).map((c) => {
      const card = byId.get(c.card_id);
      return {
        id: c.id,
        rsn: card?.rsn ?? "?",
        member: !!card?.member,
        duplicateRsn: !!card && dupKeys.has(card.rsn_key),
        createdAt: c.created_at,
        callCount: c.call_count,
        valid: c.valid,
        matched: c.matched,
        wonAtCall: c.won_at_call,
        status: c.status,
        note: c.note,
        reviewedBy: c.reviewed_by,
        squares: card?.squares ?? [],
      };
    }),
    players: active.length,
    cardsMade: allCards.length,
    duplicateRsns: [...new Set(active.filter((c) => dupKeys.has(c.rsn_key)).map((c) => c.rsn))],
  };
}
