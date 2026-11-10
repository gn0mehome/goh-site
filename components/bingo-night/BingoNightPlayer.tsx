"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CLAIM_COOLDOWN_MS } from "@/lib/bingo-night/core";
import { themeProps } from "@/lib/bingo-night/themes";
import { configFor, patternDescription, patternName, plainBangs, safeLabel } from "@/lib/bingo-night/ui";
import type { PlayerCard } from "@/lib/bingo-night/server";
import { BingoCard } from "./BingoCard";
import { WikiIcon } from "./WikiIcon";
import { PatternPicture } from "./PatternPicture";
import { useBingoState } from "./useBingoState";

const KEY_STORE = "goh-bingo-night-key";
const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode: the card just won't survive a refresh */
    }
  },
};

/** This browser's random player key (the server only ever sees its hash). */
function playerKey(): string {
  let k = store.get(KEY_STORE);
  if (!k || !/^[A-Za-z0-9_-]{16,128}$/.test(k)) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    k = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    store.set(KEY_STORE, k);
  }
  return k;
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

type Verdict = { kind: "checking" | "yes" | "no"; text: string } | null;

export function BingoNightPlayer() {
  const { state, offline } = useBingoState();
  const wide = useWideScreen();
  const [key, setKey] = useState<string | null>(null);
  const [card, setCard] = useState<PlayerCard | null>(null);
  const [cardLoaded, setCardLoaded] = useState<string | null>(null); // game id the card lookup was done for
  const [rsn, setRsn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoMark, setAutoMark] = useState(true);
  const [taps, setTaps] = useState<Set<number>>(new Set());
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [keptForRound, setKeptForRound] = useState<string | null>(null);

  const game = state?.game ?? null;
  const round = state?.round ?? null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKey(playerKey());
    setAutoMark(store.get("goh-bingo-night-automark") !== "off");
  }, []);

  // Look up this browser's card whenever a (new) game goes live.
  useEffect(() => {
    if (!key || !game || cardLoaded === game.id) return;
    let cancel = false;
    void post("/api/bingo-night/card", { action: "find", playerKey: key }).then(({ ok, data }) => {
      if (cancel) return;
      if (ok) setCard(data.card ?? null);
      setCardLoaded(game.id);
    });
    return () => {
      cancel = true;
    };
  }, [key, game, cardLoaded]);

  // Taps are kept per card, so a refresh keeps them.
  useEffect(() => {
    if (!card) return;
    const saved = store.get(`goh-bingo-night-taps:${card.id}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTaps(new Set(saved ? (JSON.parse(saved) as number[]) : []));
  }, [card]);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [cooldownUntil]);

  // A new round clears the last verdict.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVerdict(null);
  }, [round?.id]);

  const config = useMemo(() => configFor(game?.mode ?? "numbers", game?.words ?? null), [game?.mode, game?.words]);
  const calls = useMemo(() => round?.calls ?? [], [round?.calls]);
  const called = useMemo(() => new Set(calls), [calls]);

  const marked = useMemo(() => {
    const m = new Set(taps);
    if (autoMark && card) card.squares.forEach((v, pos) => v !== null && called.has(v) && m.add(pos));
    return m;
  }, [taps, autoMark, card, called]);

  const tap = useCallback(
    (pos: number) => {
      if (!card) return;
      setTaps((prev) => {
        const next = new Set(prev);
        if (next.has(pos)) next.delete(pos);
        else next.add(pos);
        store.set(`goh-bingo-night-taps:${card.id}`, JSON.stringify([...next]));
        return next;
      });
    },
    [card],
  );

  const join = async () => {
    if (!key) return;
    setBusy(true);
    setError(null);
    const { ok, data } = await post("/api/bingo-night/card", { action: "join", playerKey: key, rsn });
    setBusy(false);
    if (ok) setCard(data.card);
    else setError(data.error ?? "Couldn't get a card. Try again.");
  };

  const swap = async () => {
    if (!key) return;
    setBusy(true);
    setError(null);
    const { ok, data } = await post("/api/bingo-night/card", { action: "swap", playerKey: key });
    setBusy(false);
    // The buttons stay up, so they can swap again until they press Keep my card or the round starts.
    if (ok) setCard(data.card);
    else setError(data.error ?? "Couldn't swap cards.");
  };

  const claim = async () => {
    if (!key) return;
    setVerdict({ kind: "checking", text: "Checking…" });
    setCooldownUntil(Date.now() + CLAIM_COOLDOWN_MS);
    setNow(Date.now());
    const { ok, data } = await post("/api/bingo-night/claim", { playerKey: key });
    if (!ok) return setVerdict({ kind: "no", text: data.error ?? "Couldn't send your claim." });
    if (data.retryInMs) setCooldownUntil(Date.now() + data.retryInMs);
    setVerdict({ kind: data.valid ? "yes" : "no", text: data.message });
  };

  const setAuto = (on: boolean) => {
    setAutoMark(on);
    store.set("goh-bingo-night-automark", on ? "on" : "off");
  };

  const wrap = (children: React.ReactNode) => (
    <div {...themeProps(game?.theme, "-mx-4 sm:mx-0 sm:rounded-2xl")}>
      <div className="relative min-h-[70vh] px-3 sm:px-6 py-5 sm:rounded-2xl overflow-hidden" style={{ background: "linear-gradient(180deg, var(--bn-bg2), var(--bn-bg))", color: "var(--bn-text)" }}>
        {/* The theme's faded icons (leaves, trees, pumpkins...), as on the site's banner. */}
        <div className="absolute inset-0 theme-banner-pattern" aria-hidden />
        <div className="relative">{children}</div>
      </div>
    </div>
  );

  if (!state) return wrap(<p className="text-center py-20 opacity-80">Loading…</p>);

  if (!game) {
    return wrap(
      <div className="text-center py-16 max-w-md mx-auto">
        <h1 className="font-display text-4xl mb-3" style={{ color: "var(--bn-accent)" }}>
          Bingo Night
        </h1>
        <p className="text-lg">No game is live right now.</p>
        {state.next && (
          <p className="mt-3 opacity-90">
            Next up: <b>{state.next.name}</b>,{" "}
            {new Date(state.next.at).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </p>
        )}
      </div>,
    );
  }

  const lastCall = calls.length ? safeLabel(config, calls[calls.length - 1]) : null;
  const icons = game.icons;
  const lastIcon = calls.length ? icons?.[calls[calls.length - 1]] ?? null : null;
  const iWon = !!card && !!round?.winners.some((w) => w.cardId === card.id);
  const coolLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const showSwap = !!card && (!round || round.status === "open") && keptForRound !== (round?.id ?? "none");

  // ---- pieces, arranged below for phones (one column) or wide screens (two)
  const header = (
    <header className="text-center">
      <h1 className="font-display text-3xl sm:text-4xl" style={{ color: "var(--bn-accent)" }}>
        {plainBangs(game.name)}
      </h1>
      {offline && <p className="text-sm mt-1 opacity-90">Reconnecting…</p>}
    </header>
  );

  const lastCallBig = wide && !!lastCall;
  const roundBox = (
    <section className={`rounded-xl p-3 flex ${lastCallBig ? "flex-wrap" : ""} items-center gap-3`} style={{ background: "rgba(0,0,0,.22)" }}>
      {round ? (
        <>
          <PatternPicture pattern={round.pattern} size={52} />
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-widest opacity-80">
              Round {round.number} · {round.status === "open" ? "starting soon" : round.status === "live" ? "playing" : "over"}
            </p>
            <p className="font-bold text-lg leading-tight">{patternName(round.pattern)}</p>
            <p className="text-xs opacity-80">{patternDescription(round.pattern)}</p>
          </div>
          <div className={lastCallBig ? "w-full text-center pt-2 border-t border-white/15" : "text-right shrink-0"}>
            <p className="text-[11px] uppercase tracking-widest opacity-80">Last call</p>
            <p
              className={`font-display font-bold leading-none flex items-center gap-1.5 ${lastCallBig ? "justify-center py-1" : "justify-end"}`}
              style={{ color: "var(--bn-accent)", fontSize: lastCallBig ? (lastCall!.length > 12 ? "2rem" : "2.8rem") : lastCall && lastCall.length > 8 ? "1.15rem" : "2.1rem" }}
              aria-live="polite"
            >
              <WikiIcon src={lastIcon} size={lastCallBig ? "3rem" : "1.6rem"} />
              {lastCall ?? "–"}
            </p>
            <p className="text-[11px] opacity-80">{calls.length} called</p>
          </div>
        </>
      ) : (
        <p className="text-center w-full py-2">Get your card. The first round starts soon.</p>
      )}
    </section>
  );

  const winBox = iWon && (
    <div className="rounded-xl p-4 text-center font-bold text-lg" style={{ background: "var(--bn-accent)", color: "var(--bn-accent-ink)" }} role="status">
      🎉 You won round {round?.number}!{game.winnerMessage && <span className="block text-base font-semibold mt-1">{game.winnerMessage}</span>}
    </div>
  );

  const joinForm = !card && cardLoaded === game.id && (
    <form
      className="rounded-xl p-4 space-y-3"
      style={{ background: "var(--bn-panel)", color: "var(--bn-ink)" }}
      onSubmit={(e) => {
        e.preventDefault();
        void join();
      }}
    >
      <label className="block font-bold" htmlFor="bn-rsn">
        Your RSN
      </label>
      <input
        id="bn-rsn"
        value={rsn}
        onChange={(e) => setRsn(e.target.value)}
        maxLength={12}
        autoComplete="nickname"
        className="w-full px-3 py-3 rounded-md border text-lg"
        style={{ borderColor: "var(--bn-head)", background: "#fff", color: "var(--bn-ink)" }}
        placeholder="e.g. Gn0me Vlad"
      />
      <button type="submit" disabled={busy || !rsn.trim()} className="w-full py-3 rounded-md font-bold text-lg disabled:opacity-60" style={{ background: "var(--bn-hit)", color: "var(--bn-hit-ink)" }}>
        {busy ? "Making your card…" : "Get my card"}
      </button>
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
    </form>
  );

  const nameRow = card && (
    <div className="flex items-center justify-between text-sm">
      <span className="font-bold">
        {card.rsn}
        {card.member && (
          <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full align-middle" style={{ background: "var(--bn-accent)", color: "var(--bn-accent-ink)" }}>
            Gn0me Home
          </span>
        )}
      </span>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={autoMark} onChange={(e) => setAuto(e.target.checked)} className="w-4 h-4" />
        Auto-mark
      </label>
    </div>
  );

  const cardView = card && <BingoCard squares={card.squares} config={config} marked={marked} called={called} onTap={tap} icons={icons} />;

  const swapBox = showSwap && (
    <div className="rounded-xl p-3 text-center space-y-2" style={{ background: "rgba(0,0,0,.22)" }}>
      <p className="text-sm">{round ? `Round ${round.number} is about to start. Happy with your card?` : "Not keen on this card? You can swap it until the round starts."}</p>
      <div className="flex gap-2 justify-center">
        <button type="button" onClick={() => setKeptForRound(round?.id ?? "none")} className="px-4 py-2 rounded-md font-bold" style={{ background: "var(--bn-panel)", color: "var(--bn-ink)" }}>
          Keep my card
        </button>
        <button type="button" onClick={swap} disabled={busy} className="px-4 py-2 rounded-md font-bold disabled:opacity-60" style={{ background: "var(--bn-accent)", color: "var(--bn-accent-ink)" }}>
          {busy ? "Swapping…" : "Get a new card"}
        </button>
      </div>
    </div>
  );

  const claimBox = card && (
    <>
      {error && <p className="text-sm font-semibold text-center">{error}</p>}
      <button
        type="button"
        onClick={claim}
        disabled={round?.status !== "live" || coolLeft > 0 || iWon}
        className="w-full py-4 rounded-xl font-display font-bold text-3xl tracking-widest disabled:opacity-50 shadow-lg active:scale-[.99]"
        style={{ background: "var(--bn-accent)", color: "var(--bn-accent-ink)" }}
      >
        {coolLeft > 0 && verdict?.kind !== "yes" ? `BINGO (${coolLeft}s)` : plainBangs("BINGO!")}
      </button>
      {iWon ? (
        <p className="text-center font-bold text-lg" role="status" style={{ color: "var(--bn-accent)" }}>
          Confirmed! You&apos;re a winner.{game.winnerMessage && <span className="block text-base">{game.winnerMessage}</span>}
        </p>
      ) : (
        verdict && (
          <p className="text-center font-bold text-lg" role="status" style={{ color: verdict.kind === "yes" ? "var(--bn-accent)" : undefined }}>
            {verdict.text}
          </p>
        )
      )}
      {round?.status !== "live" && !iWon && <p className="text-center text-xs opacity-80">The BINGO button works while a round is being played.</p>}
    </>
  );

  const closedBox = round?.status === "closed" && (
    <p className="text-center rounded-xl p-3" style={{ background: "rgba(0,0,0,.22)" }}>
      Round {round.number} is over{round.winners.length ? `. Winner${round.winners.length > 1 ? "s" : ""}: ${round.winners.map((w) => w.rsn).join(", ")}` : ""}. Waiting for the next round…
    </p>
  );

  const calledList = calls.length > 0 && (
    <section>
      <p className="text-xs uppercase tracking-widest opacity-80 mb-1.5">Called so far</p>
      <div className={`flex flex-wrap gap-1.5 ${wide ? "max-h-[32vh] overflow-y-auto pr-1" : ""}`}>
        {[...calls].reverse().map((v, i) => (
          <span key={v} className="px-2 py-0.5 rounded text-sm font-bold inline-flex items-center gap-1" style={i === 0 ? { background: "var(--bn-accent)", color: "var(--bn-accent-ink)" } : { background: "rgba(0,0,0,.25)" }}>
            <WikiIcon src={icons?.[v]} size="1.1rem" />
            {safeLabel(config, v)}
          </span>
        ))}
      </div>
    </section>
  );

  const pastBox = state.pastWinners.length > 0 && (
    <p className="text-xs opacity-80 text-center">
      Earlier winners: {state.pastWinners.map((w) => `Round ${w.round}: ${w.rsn}`).join(" · ")}
    </p>
  );

  // Wide screens with a card: card on the left, everything else beside it, so nothing needs scrolling.
  if (wide && card) {
    return wrap(
      <div className="mx-auto space-y-4">
        {header}
        <div className="flex gap-8 items-start justify-center">
          <div className="space-y-2 flex-1 min-w-0" style={{ maxWidth: "min(640px, calc((100vh - 220px) / 1.13))" }}>
            {nameRow}
            {cardView}
          </div>
          <div className="w-[380px] shrink-0 space-y-4 sticky top-24">
            {roundBox}
            {winBox}
            {swapBox}
            {claimBox}
            {closedBox}
            {calledList}
            {pastBox}
          </div>
        </div>
      </div>,
    );
  }

  return wrap(
    <div className="max-w-xl mx-auto space-y-4">
      {header}
      {roundBox}
      {winBox}
      {joinForm}
      {nameRow}
      {cardView}
      {swapBox}
      {claimBox}
      {closedBox}
      {calledList}
      {pastBox}
    </div>,
  );
}

/** True on screens at least `px` wide (false until mounted, so phones never flash the wide layout). */
function useWideScreen(px = 1024) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${px}px)`);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [px]);
  return wide;
}
