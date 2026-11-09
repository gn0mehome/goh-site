// Tests for core.ts.  Run:  node --experimental-strip-types --test lib/bingo-night/core.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FREE, GRID, LINES, PATTERNS, PATTERN_MENU, CLAIM_COOLDOWN_MS, HOST_TIMEOUT_MS, NUMBERS, WORD_SETS, MAX_WORD_LENGTH,
  columnOf, callLabel, labelFor, validateWords, callPool, secureRandomInt, pickDistinct, makeCard, makeUniqueCard, cardSignature, drawNext, drawChecked,
  checkClaim, firstWinningCall, filledPositions, recheckPendingClaims, validateRsn, rsnKey, canClaim, getPattern,
  controlStatus, takeOver,
  type Card, type RandInt, type GameConfig,
} from './core.ts';

/** Seeded random source so tests are repeatable (mulberry32). */
function seeded(seed: number): RandInt {
  let a = seed >>> 0;
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

/** A card whose square at position p holds the number p + 1 (center free): easy to reason about in tests. */
const simple: Card = { squares: Array.from({ length: GRID }, (_, p) => (p === FREE ? null : p + 1)) };
/** The calls that fill these positions on `simple`. */
const callsFor = (positions: number[]) => positions.filter((p) => p !== FREE).map((p) => p + 1);

test('column letters and call labels follow G-N-O-M-E', () => {
  assert.equal(callLabel(1), 'G-1');
  assert.equal(callLabel(15), 'G-15');
  assert.equal(callLabel(16), 'N-16');
  assert.equal(callLabel(38), 'O-38');
  assert.equal(callLabel(46), 'M-46');
  assert.equal(callLabel(75), 'E-75');
  assert.equal(columnOf(31), 2);
  assert.throws(() => callLabel(0));
  assert.throws(() => callLabel(76));
});

test('secureRandomInt stays in range and hits every value', () => {
  const seen = new Set<number>();
  for (let i = 0; i < 2000; i++) {
    const v = secureRandomInt(7);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 7);
    seen.add(v);
  }
  assert.equal(seen.size, 7);
  assert.throws(() => secureRandomInt(0));
});

test('pickDistinct returns k distinct values from the pool', () => {
  const v = pickDistinct([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5, seeded(1));
  assert.equal(v.length, 5);
  assert.equal(new Set(v).size, 5);
  assert.throws(() => pickDistinct([1, 2], 3));
});

test('makeCard: 24 distinct numbers, each in its column range, free center', () => {
  for (let s = 0; s < 100; s++) {
    const card = makeCard(NUMBERS, seeded(s));
    assert.equal(card.squares.length, 25);
    assert.equal(card.squares[FREE], null);
    const nums = card.squares.filter((x): x is number => x !== null);
    assert.equal(nums.length, 24);
    assert.equal(new Set(nums).size, 24);
    card.squares.forEach((n, pos) => {
      if (n !== null) assert.equal(columnOf(n), pos % 5, `square ${pos} holds ${n}, which belongs in column ${columnOf(n)}`);
    });
  }
});

test('makeUniqueCard avoids an existing card and gives up when it must', () => {
  const first = makeCard(NUMBERS, seeded(99));
  const next = makeUniqueCard(NUMBERS, new Set([cardSignature(first)]), seeded(7));
  assert.notEqual(cardSignature(next), cardSignature(first));
  const stuck: RandInt = () => 0; // always the same card
  const only = makeCard(NUMBERS, stuck);
  assert.throws(() => makeUniqueCard(NUMBERS, new Set([cardSignature(only)]), stuck, 5));
});

test('drawNext never repeats and stops after 75 calls', () => {
  const rand = seeded(5);
  const calls: number[] = [];
  for (let i = 0; i < 75; i++) {
    const c = drawNext(NUMBERS, calls, rand);
    assert.ok(c !== null && c >= 1 && c <= 75 && !calls.includes(c));
    calls.push(c!);
  }
  assert.equal(drawNext(NUMBERS, calls, rand), null);
});

test('drawChecked refuses a double draw', () => {
  const calls = [4, 38];
  const ok = drawChecked(NUMBERS, calls, 2, seeded(1));
  assert.equal(ok.ok, true);
  assert.deepEqual(drawChecked(NUMBERS, calls, 1), { ok: false, reason: 'stale' }); // host's screen was a call behind
  const all = Array.from({ length: 75 }, (_, i) => i + 1);
  assert.deepEqual(drawChecked(NUMBERS, all, 75), { ok: false, reason: 'all_called' });
});

test('pattern definitions and the host menu', () => {
  assert.equal(LINES.length, 12);
  assert.equal(PATTERNS.single_line.sets.length, 12);
  assert.equal(PATTERNS.two_lines.sets.length, 66);
  assert.equal(PATTERNS.postage_stamp.sets.length, 4);
  assert.equal(PATTERNS.inner_square.sets[0].length, 8);
  assert.equal(PATTERNS.frame.sets[0].length, 16);
  assert.equal(PATTERNS.x.sets[0].length, 9);
  assert.equal(PATTERNS.coverall.sets[0].length, 25);
  assert.ok(!PATTERNS.inner_square.sets[0].includes(FREE));
  assert.deepEqual([...PATTERN_MENU].sort(), Object.keys(PATTERNS).sort());
  assert.throws(() => getPattern('blackout'));
});

test('single line: a full row wins, a row one short does not; the free center counts', () => {
  assert.equal(checkClaim(simple, callsFor([0, 1, 2, 3, 4]), 'single_line').valid, true);
  assert.equal(checkClaim(simple, callsFor([0, 1, 2, 3]), 'single_line').valid, false);
  assert.deepEqual(checkClaim(simple, callsFor([10, 11, 13, 14]), 'single_line').matched, [10, 11, 12, 13, 14]);
  assert.equal(checkClaim(simple, callsFor([0, 6, 18, 24]), 'single_line').valid, true);
});

test('only calls count, never marks', () => {
  const calls = [...callsFor([0, 1, 2, 3]), 60, 70, 75]; // 60, 70 and 75 aren't on this card
  assert.equal(checkClaim(simple, calls, 'single_line').valid, false);
  assert.equal(filledPositions(simple, calls).size, 5); // 4 called + free center
});

test('every pattern on the menu: complete wins, one square short does not', () => {
  for (const id of PATTERN_MENU) {
    const set = PATTERNS[id].sets[0];
    assert.equal(checkClaim(simple, callsFor(set), id).valid, true, `${id} complete`);
    const short = set.filter((p) => p !== FREE).slice(1);
    assert.equal(checkClaim(simple, callsFor(short), id).valid, false, `${id} one short`);
  }
  assert.equal(checkClaim(simple, callsFor([18, 19, 23, 24]), 'postage_stamp').valid, true); // bottom-right stamp
});

test('firstWinningCall and wonAtCall settle ties', () => {
  const calls = [70, ...callsFor([0, 1, 2, 3]), 72, ...callsFor([4]), 74]; // row 0 completes on call 7
  assert.equal(firstWinningCall(simple, calls, PATTERNS.single_line), 7);
  const r = checkClaim(simple, calls, 'single_line');
  assert.equal(r.callCount, 8);
  assert.equal(r.wonAtCall, 7);
});

test('recheckPendingClaims after an undo', () => {
  const row = callsFor([0, 1, 2, 3, 4]);
  const pending = [{ id: 'c1', card: simple }];
  assert.equal(recheckPendingClaims(pending, row, 'single_line')[0].result.valid, true);
  const undone = row.slice(0, -1); // the host undid the last call
  const after = recheckPendingClaims(pending, undone, 'single_line');
  assert.equal(after[0].id, 'c1');
  assert.equal(after[0].result.valid, false);
});

test('validateRsn and rsnKey follow OSRS name rules', () => {
  assert.equal(validateRsn('  Gn0me Ches ').rsn, 'Gn0me Ches');
  assert.equal(validateRsn('a_b-c d').ok, true);
  assert.equal(validateRsn('').ok, false);
  assert.equal(validateRsn('thirteenchars').ok, false);
  assert.equal(validateRsn('<script>').ok, false);
  assert.equal(validateRsn('___').ok, false);
  assert.equal(rsnKey('Gn0me Ches'), rsnKey('gn0me_ches'));
  assert.equal(rsnKey('GN0ME-CHES'), rsnKey('gn0me ches'));
  assert.notEqual(rsnKey('Gn0me Ches'), rsnKey('Gn0me Chez'));
});

test('canClaim enforces the cooldown and the invalid-claim limit', () => {
  const t = 1_000_000;
  assert.deepEqual(canClaim([], t), { ok: true });
  const soon = canClaim([{ at: t, valid: false }], t + 5_000);
  assert.equal(soon.ok, false);
  assert.equal((soon as { retryInMs: number }).retryInMs, CLAIM_COOLDOWN_MS - 5_000);
  assert.deepEqual(canClaim([{ at: t, valid: false }], t + CLAIM_COOLDOWN_MS), { ok: true });
  const three = [0, 1, 2].map((i) => ({ at: t + i * 60_000, valid: false }));
  assert.equal(canClaim(three, t + 600_000).ok, false);
});

test('one host at a time, with take over', () => {
  const t = 5_000_000;
  const lock = { hostId: 'alice', lastSeen: t };
  assert.equal(controlStatus(null, 'bob', t), 'host');
  assert.equal(controlStatus(lock, 'alice', t), 'host');
  assert.equal(controlStatus(lock, 'bob', t + 10_000), 'ask_to_take_over');
  assert.equal(takeOver(lock, 'bob', t + 10_000), null); // needs confirming
  assert.deepEqual(takeOver(lock, 'bob', t + 10_000, true), { hostId: 'bob', lastSeen: t + 10_000 });
  assert.equal(controlStatus(lock, 'bob', t + HOST_TIMEOUT_MS), 'can_take_over'); // host went quiet
  assert.deepEqual(takeOver(lock, 'bob', t + HOST_TIMEOUT_MS), { hostId: 'bob', lastSeen: t + HOST_TIMEOUT_MS });
});

test('the built-in word sets are valid and fit on a phone', () => {
  for (const [id, set] of Object.entries(WORD_SETS)) {
    const r = validateWords(set.words);
    assert.equal(r.ok, true, `${id}: ${r.errors.join(' ')}`);
    assert.ok(set.words.every((w) => w.length <= MAX_WORD_LENGTH));
  }
  assert.equal(WORD_SETS.osrs_classic.words.length, 50);
  assert.equal(WORD_SETS.friendsgiving_feast.words.length, 40);
});

test('validateWords cleans input and reports problems', () => {
  const thirty = Array.from({ length: 30 }, (_, i) => `Word ${i}`);
  const ok = validateWords(['  Abyssal   whip ', '', ...thirty].join('\n'));
  assert.equal(ok.ok, true);
  assert.equal(ok.words[0], 'Abyssal whip');
  assert.match(validateWords([...thirty, 'word 3']).errors[0], /listed twice/);
  assert.match(validateWords([...thirty, 'Tree Gnome Stronghold']).errors[0], /characters/);
  assert.equal(validateWords(thirty.slice(0, 10)).ok, false);
});

test('word cards: 24 different words around a free center, shown by name', () => {
  const config: GameConfig = { mode: 'words', words: WORD_SETS.osrs_classic.words };
  for (let s = 0; s < 50; s++) {
    const card = makeCard(config, seeded(s));
    assert.equal(card.squares[FREE], null);
    const idx = card.squares.filter((x): x is number => x !== null);
    assert.equal(new Set(idx).size, 24);
    assert.ok(idx.every((i) => i >= 0 && i < 50));
  }
  assert.equal(labelFor(config, 0), 'Lumbridge');
  assert.equal(labelFor(NUMBERS, 38), 'O-38');
  assert.throws(() => labelFor(config, 50));
  assert.throws(() => makeCard({ mode: 'words', words: ['a', 'b'] }));
  assert.equal(callPool(config).length, 50);
  assert.equal(callPool(NUMBERS).length, 75);
});

test('word games draw every word once, and claims work the same way', () => {
  const config: GameConfig = { mode: 'words', words: WORD_SETS.friendsgiving_feast.words };
  const rand = seeded(11);
  const calls: number[] = [];
  for (let i = 0; i < 40; i++) calls.push(drawNext(config, calls, rand)!);
  assert.equal(new Set(calls).size, 40);
  assert.equal(drawNext(config, calls, rand), null);
  const card = makeCard(config, rand);
  const row = [0, 1, 2, 3, 4].map((p) => card.squares[p]!) ;
  assert.equal(checkClaim(card, row, 'single_line').valid, true);
  assert.equal(checkClaim(card, row.slice(1), 'single_line').valid, false);
});

test('a full simulated night for each card type: 150 players, three rounds', () => {
  const configs: GameConfig[] = [NUMBERS, { mode: 'words', words: WORD_SETS.osrs_classic.words }];
  for (const config of configs) {
    const rand = seeded(2026);
    const cards = Array.from({ length: 150 }, () => makeCard(config, rand));
    for (const pattern of ['single_line', 'x', 'coverall']) {
      const calls: number[] = [];
      while (!cards.some((c) => checkClaim(c, calls, pattern).valid)) calls.push(drawNext(config, calls, rand)!);
      assert.ok(calls.length <= callPool(config).length, `${config.mode} ${pattern} took ${calls.length} calls`);
    }
  }
});
