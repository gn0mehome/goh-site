/**
 * Gn0me Home Bingo: core game logic (no framework, no database, no network).
 *
 * Companion to "Gn0me Home Bingo: Build Spec for gn0mehome.com". Everything random or judged in the game lives
 * here, so it can run on the server and be tested on its own:
 *   - two card types, chosen per game:
 *       Numbers: traditional 75-ball bingo with GNOME across the top instead of BINGO (calls like "G-4")
 *       Words:   squares are words from a list (the built-in OSRS Classic set, another preset, or the host's own)
 *   - drawing calls (secure random, no repeats), with a guard so two hosts can't draw at once
 *   - the pattern menu the host picks from each round
 *   - checking a BINGO claim against the CALLS (never the player's marks), and rechecking after an undo
 *   - RSN checks, the claim cooldown, and the one-host-at-a-time control lock
 *
 * The card: 5 columns, 5 rows, free center. Column ranges match 75-ball bingo:
 *      G      N      O      M      E
 *    1-15  16-30  31-45  46-60  61-75
 * Grid positions are 0-24, row by row; 12 is the free center (the O column has 4 numbers).
 *    0  1  2  3  4
 *    5  6  7  8  9
 *   10 11 [12] 13 14
 *   15 16 17 18 19
 *   20 21 22 23 24
 * Numbers: a call is a number 1-75, shown with its column letter: 4 -> "G-4", 38 -> "O-38".
 * Words: squares and calls are indexes into the game's word list (0 = first word), shown as the word itself.
 * Either way, cards and calls are plain numbers, so claim checking is the same for both.
 *
 * Run the tests:  node --experimental-strip-types --test bingo-core.test.ts   (Node 22.6+; plain `node --test` on 23.6+)
 */

export const GRID = 25;
export const FREE = 12;
export const COLUMNS = ['G', 'N', 'O', 'M', 'E'] as const;
export const PER_COLUMN = 15;
export const MAX_NUMBER = COLUMNS.length * PER_COLUMN; // 75

/** A card's squares in grid order: a call value at every position except FREE, which is null. */
export type Squares = (number | null)[];

export interface Card {
  squares: Squares;
}

export type PatternId =
  | 'single_line' | 'two_lines' | 'four_corners' | 'postage_stamp' | 'x' | 'inner_square' | 'frame' | 'coverall';

export interface Pattern {
  id: PatternId;
  name: string;
  /** One line for the host's pattern menu and the player page. */
  description: string;
  /** A claim wins if every position in ANY one of these sets is filled (called, or the free center). */
  sets: number[][];
  /** One example of the pattern, for the small picture on the player page and stream view. */
  preview: number[];
}

// ---------------------------------------------------------------------------------------------------------
// Card types and word sets
// ---------------------------------------------------------------------------------------------------------

export type CardMode = 'numbers' | 'words';

/** How a game's cards work. Saved on the game; every card and call in it follows this. */
export type GameConfig = { mode: 'numbers' } | { mode: 'words'; words: string[] };

export const NUMBERS: GameConfig = { mode: 'numbers' };

export const MIN_WORDS = 24; // one per square
export const MAX_WORDS = 100;
export const MAX_WORD_LENGTH = 20; // so a word fits a square on a phone (the square shrinks the text to fit)

/** Built-in word sets the host can pick (or copy and edit). OSRS Classic is the default for word games. */
export const WORD_SETS: Record<string, { name: string; words: string[] }> = {
  osrs_classic: {
    name: 'OSRS Classic',
    words: [
      // places
      'Lumbridge', 'Varrock', 'Falador', 'Draynor Village', 'Grand Exchange', 'Wilderness', 'Gnome Stronghold',
      'Castle Wars', 'Karamja', 'Barbarian Village',
      // items
      'Abyssal whip', 'Dragon scimitar', 'Rune platebody', 'Party hat', 'Fire cape', 'Twisted bow', 'Granite maul',
      'Amulet of glory', "Dharok's greataxe", 'Old school bond', 'Shark', 'Lobster',
      // bosses and NPCs
      'King Black Dragon', 'Zulrah', 'Vorkath', 'TzTok-Jad', 'Giant Mole', 'Gnome child', 'Hans', 'Duke Horacio', 'Cow',
      // minigames, raids and activities
      'Clue scroll', 'Pest Control', 'Barrows', 'Wintertodt', 'Tempoross', 'Fight Caves', 'Chambers of Xeric',
      'Theatre of Blood', 'Tombs of Amascut', 'Slayer task', 'Rooftop agility', 'Gnome glider', 'Gnome ball',
      // moments
      'Random event', 'Level up', 'Skill cape', 'Max cape', 'Special attack', 'Prayer flick',
    ],
  },
  friendsgiving_feast: {
    name: 'Friendsgiving Feast',
    words: [
      'Chocolate bomb', 'Toad batta', 'Fruit batta', 'Worm hole', "Tangled toad's legs", 'Fruit blast', 'Pineapple punch',
      'Blurberry special', 'Wizard blizzard', 'Apple pie', 'Meat pie', 'Redberry pie', 'Garden pie', 'Summer pie',
      'Wild pie', 'Admiral pie', 'Mushroom pie', 'Baked potato', 'Potato with cheese', 'Chilli potato', 'Egg potato',
      'Tuna potato', 'Mushroom potato', 'Cooked chicken', 'Stew', 'Curry', 'Plain pizza', 'Meat pizza', 'Pineapple pizza',
      'Ugthanki kebab', 'Lobster', 'Swordfish', 'Monkfish', 'Shark', 'Karambwan', 'Anglerfish', 'Cake', 'Chocolate cake',
      'Jug of wine', 'Cup of tea',
    ],
  },
};

export interface WordListResult {
  ok: boolean;
  words: string[];
  errors: string[];
}

/** Clean a pasted word list (one per line): trims, drops blank lines, rejects duplicates, long words and bad sizes. */
export function validateWords(raw: string | string[]): WordListResult {
  const words = (Array.isArray(raw) ? raw : raw.split(/\r?\n/)).map((w) => w.trim().replace(/\s+/g, ' ')).filter(Boolean);
  const errors: string[] = [];
  const seen = new Map<string, number>();
  words.forEach((w, i) => {
    const key = w.toLowerCase();
    if (seen.has(key)) errors.push(`"${w}" is listed twice (lines ${seen.get(key)! + 1} and ${i + 1}).`);
    else seen.set(key, i);
    if (w.length > MAX_WORD_LENGTH) errors.push(`"${w}" is ${w.length} characters; keep each one to ${MAX_WORD_LENGTH} so it fits a square on a phone.`);
  });
  if (words.length < MIN_WORDS) errors.push(`A card needs at least ${MIN_WORDS} words; this list has ${words.length}.`);
  if (words.length > MAX_WORDS) errors.push(`At most ${MAX_WORDS} words; this list has ${words.length}.`);
  return { ok: errors.length === 0, words, errors };
}

/** Every value that can be called in this game: 1-75 for numbers, 0..n-1 (word indexes) for words. */
export function callPool(config: GameConfig): number[] {
  return config.mode === 'numbers'
    ? Array.from({ length: MAX_NUMBER }, (_, i) => i + 1)
    : Array.from({ length: config.words.length }, (_, i) => i);
}

// ---------------------------------------------------------------------------------------------------------
// Numbers and labels
// ---------------------------------------------------------------------------------------------------------

/** Column index 0-4 for a number 1-75. */
export function columnOf(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > MAX_NUMBER) throw new RangeError(`not a bingo number: ${n}`);
  return Math.floor((n - 1) / PER_COLUMN);
}

/** How a number call is shown and said: 4 -> "G-4", 38 -> "O-38", 75 -> "E-75". */
export function callLabel(n: number): string {
  return `${COLUMNS[columnOf(n)]}-${n}`;
}

/** How any call or square is shown in this game: "G-4" for numbers, the word itself for words. */
export function labelFor(config: GameConfig, value: number): string {
  if (config.mode === 'numbers') return callLabel(value);
  const w = config.words.at(value);
  if (w === undefined || value < 0) throw new RangeError(`no word at index ${value}`);
  return w;
}

// ---------------------------------------------------------------------------------------------------------
// Randomness
// ---------------------------------------------------------------------------------------------------------

/** A random-number source: returns an integer in [0, n). Swap in a seeded one for tests. */
export type RandInt = (n: number) => number;

/** Cryptographically secure integer in [0, n), without modulo bias. Uses Web Crypto (Node 19+, all browsers). */
export const secureRandomInt: RandInt = (n) => {
  if (!Number.isInteger(n) || n <= 0 || n > 2 ** 32) throw new RangeError(`n must be an integer in 1..2^32, got ${n}`);
  const limit = Math.floor(2 ** 32 / n) * n; // reject values at or above this so every result is equally likely
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
};

/** Pick k distinct values from `pool`, in random order (partial Fisher-Yates on a copy). */
export function pickDistinct<T>(pool: readonly T[], k: number, rand: RandInt = secureRandomInt): T[] {
  if (k > pool.length) throw new RangeError(`cannot pick ${k} distinct values from ${pool.length}`);
  const a = [...pool];
  for (let i = 0; i < k; i++) {
    const j = i + rand(a.length - i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

// ---------------------------------------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------------------------------------

const columnRange = (c: number) => Array.from({ length: PER_COLUMN }, (_, i) => c * PER_COLUMN + i + 1);

/**
 * Make one card.
 *   Numbers: each column holds different numbers from its range (5 per column, 4 in O around the free center).
 *   Words: 24 different words from the game's list, in random squares around the free center.
 */
export function makeCard(config: GameConfig = NUMBERS, rand: RandInt = secureRandomInt): Card {
  const squares: Squares = new Array(GRID).fill(null);
  if (config.mode === 'words') {
    if (config.words.length < MIN_WORDS) throw new RangeError(`need at least ${MIN_WORDS} words, got ${config.words.length}`);
    const picks = pickDistinct(callPool(config), GRID - 1, rand);
    for (let pos = 0, k = 0; pos < GRID; pos++) if (pos !== FREE) squares[pos] = picks[k++];
    return { squares };
  }
  COLUMNS.forEach((_, c) => {
    const rows = c === 2 ? [0, 1, 3, 4] : [0, 1, 2, 3, 4];
    const picks = pickDistinct(columnRange(c), rows.length, rand);
    rows.forEach((r, i) => (squares[r * 5 + c] = picks[i]));
  });
  return { squares };
}

/** A string that is identical for two cards only when they hold the same values in the same places. */
export function cardSignature(card: Card): string {
  return card.squares.map((s) => (s === null ? '*' : s)).join(',');
}

/**
 * Make a card that doesn't match any existing card in the game. `existing` holds signatures of the game's cards
 * (from cardSignature). Both card types have trillions of possible cards, so a repeat is practically impossible;
 * this just makes it certain.
 */
export function makeUniqueCard(config: GameConfig, existing: Set<string>, rand: RandInt = secureRandomInt, maxTries = 20): Card {
  for (let i = 0; i < maxTries; i++) {
    const card = makeCard(config, rand);
    if (!existing.has(cardSignature(card))) return card;
  }
  throw new Error('could not make a unique card');
}

// ---------------------------------------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------------------------------------

/** Draw the next call: a random value from the game's pool not yet called this round, or null when all are called. */
export function drawNext(config: GameConfig, calls: readonly number[], rand: RandInt = secureRandomInt): number | null {
  const called = new Set(calls);
  const remaining = callPool(config).filter((v) => !called.has(v));
  return remaining.length ? remaining[rand(remaining.length)] : null;
}

/**
 * Draw with a guard against double draws. The host's Draw button sends the number of calls it is showing; if the
 * round already has a different number (someone else drew, or the button was pressed twice), nothing is drawn.
 * Save the returned call only if the round's call count still matches (one atomic update or transaction).
 */
export function drawChecked(
  config: GameConfig,
  calls: readonly number[],
  expectedCallCount: number,
  rand: RandInt = secureRandomInt,
): { ok: true; call: number } | { ok: false; reason: 'stale' | 'all_called' } {
  if (calls.length !== expectedCallCount) return { ok: false, reason: 'stale' };
  const call = drawNext(config, calls, rand);
  return call === null ? { ok: false, reason: 'all_called' } : { ok: true, call };
}

// ---------------------------------------------------------------------------------------------------------
// Patterns (the host picks one when opening each round)
// ---------------------------------------------------------------------------------------------------------

const rows = Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => r * 5 + c));
const cols = Array.from({ length: 5 }, (_, c) => Array.from({ length: 5 }, (_, r) => r * 5 + c));
const diagonals = [
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];
/** The 12 lines: 5 rows, 5 columns, 2 diagonals. */
export const LINES: number[][] = [...rows, ...cols, ...diagonals];

const union = (...sets: number[][]) => [...new Set(sets.flat())].sort((a, b) => a - b);
const twoLineSets: number[][] = [];
for (let i = 0; i < LINES.length; i++) for (let j = i + 1; j < LINES.length; j++) twoLineSets.push(union(LINES[i], LINES[j]));

const ALL = Array.from({ length: GRID }, (_, i) => i);
const frame = ALL.filter((p) => p < 5 || p >= 20 || p % 5 === 0 || p % 5 === 4);
const stamps = [
  [0, 1, 5, 6],
  [3, 4, 8, 9],
  [15, 16, 20, 21],
  [18, 19, 23, 24],
];
const innerSquare = [6, 7, 8, 11, 13, 16, 17, 18];

export const PATTERNS: Record<PatternId, Pattern> = {
  single_line: { id: 'single_line', name: 'Single line', description: 'Any row, column or diagonal', sets: LINES, preview: rows[2] },
  two_lines: { id: 'two_lines', name: 'Two lines', description: 'Any two rows, columns or diagonals', sets: twoLineSets, preview: union(rows[0], rows[4]) },
  four_corners: { id: 'four_corners', name: 'Four corners', description: 'The four corner squares', sets: [[0, 4, 20, 24]], preview: [0, 4, 20, 24] },
  postage_stamp: { id: 'postage_stamp', name: 'Postage stamp', description: 'A 2×2 square in any corner', sets: stamps, preview: stamps[1] },
  x: { id: 'x', name: 'X', description: 'Both diagonals', sets: [union(...diagonals)], preview: union(...diagonals) },
  inner_square: { id: 'inner_square', name: 'Inner square', description: 'The 8 squares around the free center', sets: [innerSquare], preview: innerSquare },
  frame: { id: 'frame', name: 'Frame', description: 'All 16 outer squares', sets: [frame], preview: frame },
  coverall: { id: 'coverall', name: 'Coverall', description: 'The whole card', sets: [ALL], preview: ALL },
};

/** The host's pattern menu, shortest round to longest (simulated with 150 players: see the spec's timing tables). */
export const PATTERN_MENU: PatternId[] = ['single_line', 'postage_stamp', 'four_corners', 'two_lines', 'inner_square', 'x', 'frame', 'coverall'];

export function getPattern(id: string): Pattern {
  const p = (PATTERNS as Record<string, Pattern>)[id];
  if (!p) throw new Error(`unknown pattern "${id}"; use one of ${Object.keys(PATTERNS).join(', ')}`);
  return p;
}

// ---------------------------------------------------------------------------------------------------------
// Claim checking
// ---------------------------------------------------------------------------------------------------------

/** Positions on the card that are filled by these calls (plus the free center). */
export function filledPositions(card: Card, calls: readonly number[]): Set<number> {
  const called = new Set(calls);
  const filled = new Set<number>([FREE]);
  card.squares.forEach((n, pos) => {
    if (n !== null && called.has(n)) filled.add(pos);
  });
  return filled;
}

/** The first winning set this card has completed with these calls, or null. */
export function winningSet(card: Card, calls: readonly number[], pattern: Pattern): number[] | null {
  const filled = filledPositions(card, calls);
  return pattern.sets.find((set) => set.every((p) => filled.has(p))) ?? null;
}

/** The call number (1-based) at which this card first won, or null if it hasn't. Used to settle ties. */
export function firstWinningCall(card: Card, calls: readonly number[], pattern: Pattern): number | null {
  for (let k = 1; k <= calls.length; k++) if (winningSet(card, calls.slice(0, k), pattern)) return k;
  return null;
}

export interface ClaimResult {
  valid: boolean;
  /** Positions of the completed set (for outlining on the host's card preview), or null. */
  matched: number[] | null;
  /** How many calls had been made when the claim was checked. */
  callCount: number;
  /** The call number at which the card first won (may be earlier than callCount), or null. */
  wonAtCall: number | null;
}

/**
 * Check a BINGO claim. `calls` = the round's calls at the moment of the claim, in order.
 * The player's own marks are deliberately not an input: only calls count.
 */
export function checkClaim(card: Card, calls: readonly number[], patternId: PatternId | string): ClaimResult {
  const pattern = getPattern(patternId);
  const matched = winningSet(card, calls, pattern);
  return {
    valid: matched !== null,
    matched,
    callCount: calls.length,
    wonAtCall: matched ? firstWinningCall(card, calls, pattern) : null,
  };
}

/**
 * After the host undoes a call, recheck every claim still waiting in the queue against the corrected calls, so a
 * claim that only won because of the undone call is no longer shown as valid.
 */
export function recheckPendingClaims<T extends { card: Card }>(
  pending: readonly T[],
  calls: readonly number[],
  patternId: PatternId | string,
): (T & { result: ClaimResult })[] {
  return pending.map((claim) => ({ ...claim, result: checkClaim(claim.card, calls, patternId) }));
}

// ---------------------------------------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------------------------------------

/** OSRS display names: 1-12 characters of letters, numbers, spaces, hyphens and underscores. */
const RSN_RE = /^[A-Za-z0-9 _-]{1,12}$/;

export function validateRsn(raw: string): { ok: boolean; rsn: string; error?: string } {
  const rsn = raw.trim().replace(/\s+/g, ' ');
  if (!rsn) return { ok: false, rsn, error: 'Enter your RSN.' };
  if (!RSN_RE.test(rsn)) return { ok: false, rsn, error: 'RSNs are 1-12 letters, numbers, spaces, hyphens or underscores.' };
  if (!/[A-Za-z0-9]/.test(rsn)) return { ok: false, rsn, error: 'An RSN needs at least one letter or number.' };
  return { ok: true, rsn };
}

/**
 * Key for spotting the same player on two cards. OSRS treats spaces, underscores and hyphens in names as the
 * same character, and ignores case, so "Gn0me Ches", "gn0me_ches" and "GN0ME-CHES" all match.
 */
export function rsnKey(rsn: string): string {
  return rsn.trim().toLowerCase().replace(/[ _-]+/g, ' ');
}

// ---------------------------------------------------------------------------------------------------------
// Claim throttling (the spec's safeguard numbers, kept here so pages and server agree)
// ---------------------------------------------------------------------------------------------------------

export const CLAIM_COOLDOWN_MS = 15_000;
export const MAX_INVALID_CLAIMS_PER_ROUND = 3;

/**
 * May this card claim now? `history` = this card's earlier claims in the current round.
 * Returns a reason the page can show when the answer is no.
 */
export function canClaim(
  history: readonly { at: number; valid: boolean }[],
  now: number,
): { ok: true } | { ok: false; reason: string; retryInMs?: number } {
  const invalid = history.filter((c) => !c.valid).length;
  if (invalid >= MAX_INVALID_CLAIMS_PER_ROUND) return { ok: false, reason: 'Too many claims that weren’t bingo. You can claim again next round.' };
  const last = history.reduce((m, c) => Math.max(m, c.at), -Infinity);
  const wait = last + CLAIM_COOLDOWN_MS - now;
  if (wait > 0) return { ok: false, reason: 'Hold on a moment before claiming again.', retryInMs: wait };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------
// One host at a time
// ---------------------------------------------------------------------------------------------------------

/** How long a host's open Admin Panel can go quiet before another staff member can take over without asking. */
export const HOST_TIMEOUT_MS = 60_000;

export interface HostLock {
  hostId: string; // the staff member's site user id
  lastSeen: number; // updated by the host's Admin Panel every ~15 s while it's open
}

/**
 * Who may use the calling controls. The holder always may. Anyone else sees the controls read-only, with a
 * "Take over" button: it works at once if the host has gone quiet for HOST_TIMEOUT_MS (closed tab, crash),
 * and otherwise needs `force` (the page asks "Take over from the current host?" first).
 */
export function controlStatus(lock: HostLock | null, userId: string, now: number): 'host' | 'can_take_over' | 'ask_to_take_over' {
  if (!lock || lock.hostId === userId) return 'host';
  return now - lock.lastSeen >= HOST_TIMEOUT_MS ? 'can_take_over' : 'ask_to_take_over';
}

export function takeOver(lock: HostLock | null, userId: string, now: number, force = false): HostLock | null {
  const s = controlStatus(lock, userId, now);
  if (s === 'ask_to_take_over' && !force) return null; // refused: the page should confirm first
  return { hostId: userId, lastSeen: now };
}
