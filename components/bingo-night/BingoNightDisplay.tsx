"use client";

import { useEffect, useMemo, useState } from "react";
import { COLUMNS, PER_COLUMN } from "@/lib/bingo-night/core";
import { themeVars } from "@/lib/bingo-night/themes";
import { configFor, patternDescription, patternName, plainBangs, safeLabel } from "@/lib/bingo-night/ui";
import { PatternPicture } from "./PatternPicture";
import { QrCode } from "./QrCode";
import { WikiIcon } from "./WikiIcon";
import { useBingoState } from "./useBingoState";

const W = 1920;
const H = 1080;
/** Where players join, as it's shown on screen (the real address comes from the page itself). */
function useJoinUrl() {
  const [url, setUrl] = useState("https://gn0mehome.com/bingo-night");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(`${window.location.origin}/bingo-night`);
  }, []);
  return url;
}

/** Fits the 1920×1080 stage into the window, whatever its size. */
function useStageScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return scale;
}

/**
 * The read-only stream view the host screen-shares: the latest call, a board
 * of everything called, the round's pattern, the last 5 calls and a winner
 * banner. Nothing under ~28px, so it survives Discord's compression.
 */
export function BingoNightDisplay() {
  const { state } = useBingoState(1500);
  const scale = useStageScale();
  const joinUrl = useJoinUrl();
  const JOIN = joinUrl.replace(/^https?:\/\//, "");
  const game = state?.game ?? null;
  const round = state?.round ?? null;
  const config = useMemo(() => configFor(game?.mode ?? "numbers", game?.words ?? null), [game?.mode, game?.words]);
  const calls = useMemo(() => round?.calls ?? [], [round?.calls]);
  const called = useMemo(() => new Set(calls), [calls]);
  const last = calls.length ? calls[calls.length - 1] : null;
  const lastLabel = last != null ? safeLabel(config, last) : null;
  const icons = game?.icons ?? null;
  const winners = round?.winners ?? [];

  const stage = (children: React.ReactNode) => (
    <div className="fixed inset-0 z-[200] overflow-hidden" style={{ ...themeVars(game?.theme), background: "var(--bn-bg)" }}>
      <style>{`
        @keyframes bn-reveal { 0% { transform: scale(.4) rotate(-8deg); opacity: 0 } 60% { transform: scale(1.12) rotate(2deg); opacity: 1 } 100% { transform: scale(1) rotate(0) } }
        @keyframes bn-pop { 0% { transform: translateY(40px); opacity: 0 } 100% { transform: none; opacity: 1 } }
        .bn-reveal { animation: bn-reveal .7s cubic-bezier(.2,.9,.3,1.2) both }
        .bn-pop { animation: bn-pop .6s ease-out both }
      `}</style>
      <div
        className="absolute left-1/2 top-1/2"
        style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})`, background: "linear-gradient(160deg, var(--bn-bg2), var(--bn-bg))", color: "var(--bn-text)" }}
      >
        {children}
      </div>
    </div>
  );

  if (!state) return stage(null);
  if (!game) {
    return stage(
      <div className="h-full flex flex-col items-center justify-center gap-6">
        <p className="font-display" style={{ fontSize: 96, color: "var(--bn-accent)" }}>
          Bingo Night
        </p>
        <p style={{ fontSize: 40 }}>No game is live right now.</p>
      </div>,
    );
  }

  const words = config.mode === "words" ? config.words : [];
  const wordFont = words.length <= 40 ? 30 : words.length <= 60 ? 26 : words.length <= 80 ? 22 : 19;
  const wordCols = words.length <= 40 ? 4 : words.length <= 70 ? 5 : 6;

  return stage(
    <div className="h-full grid" style={{ gridTemplateColumns: "640px 1fr", gridTemplateRows: "minmax(0, 1fr)", gap: 40, padding: 48 }}>
      {/* Left: game, round, latest call, last five */}
      <div className="flex flex-col min-h-0" style={{ gap: 28 }}>
        <div>
          <p className="font-display leading-tight" style={{ fontSize: 58, color: "var(--bn-accent)" }}>
            {plainBangs(game.name)}
          </p>
        </div>
        {round ? (
          <div className="flex items-center rounded-2xl" style={{ gap: 24, padding: "20px 24px", background: "rgba(0,0,0,.25)" }}>
            <PatternPicture pattern={round.pattern} size={120} />
            <div>
              <p style={{ fontSize: 30, opacity: 0.85 }}>Round {round.number}</p>
              <p className="font-bold" style={{ fontSize: 44, lineHeight: 1.1 }}>
                {patternName(round.pattern)}
              </p>
              <p style={{ fontSize: 28, opacity: 0.85 }}>{patternDescription(round.pattern)}</p>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 40 }}>Grab your card. The first round starts soon!</p>
        )}

        <div className="flex-1 min-h-0 overflow-hidden rounded-3xl flex flex-col items-center justify-center" style={{ background: "var(--bn-panel)", color: "var(--bn-ink)" }}>
          <p className="uppercase" style={{ fontSize: 30, letterSpacing: 6, opacity: 0.75 }}>
            {round?.status === "open" ? "Starting soon" : round?.status === "closed" ? "Round over" : "Latest call"}
          </p>
          {lastLabel && icons?.[last as number] && <WikiIcon key={`i-${round?.id}-${calls.length}`} src={icons[last as number]} size={110} className="bn-reveal" style={{ margin: "6px 0" }} />}
          {lastLabel ? (
            <p key={`${round?.id}-${calls.length}`} className="bn-reveal font-display font-bold text-center leading-none" style={{ fontSize: Math.round((lastLabel.length > 10 ? 96 : lastLabel.length > 6 ? 130 : 210) * (icons?.[last as number] ? 0.62 : 1)), padding: "0 24px", color: "var(--bn-head)" }}>
              {lastLabel}
            </p>
          ) : (
            <p className="font-display" style={{ fontSize: 120, opacity: 0.3 }}>
              –
            </p>
          )}
          <p style={{ fontSize: 30, opacity: 0.75 }}>{calls.length} called</p>
        </div>

        <div>
          <p style={{ fontSize: 28, opacity: 0.85, marginBottom: 10 }}>Last 5 calls</p>
          <div className="flex flex-wrap" style={{ gap: 10 }}>
            {calls
              .slice(-6, -1)
              .reverse()
              .map((v) => (
                <span key={v} className="rounded-xl font-bold text-center inline-flex items-center" style={{ gap: 8, fontSize: config.mode === "words" ? 28 : 40, padding: config.mode === "words" ? "6px 14px" : "8px 14px", background: "rgba(0,0,0,.3)", minWidth: 100, whiteSpace: "nowrap" }}>
                  <WikiIcon src={icons?.[v]} size={34} />
                  {safeLabel(config, v)}
                </span>
              ))}
          </div>
        </div>
      </div>

      {/* Right: the flashboard */}
      <div className="flex flex-col min-h-0" style={{ gap: 24 }}>
        <div className="flex-1 min-h-0 rounded-3xl overflow-hidden" style={{ padding: 28, background: "rgba(0,0,0,.28)" }}>
          {config.mode === "numbers" ? (
            <div className="h-full flex flex-col justify-between">
              {COLUMNS.map((letter, c) => (
                <div key={letter} className="flex items-center" style={{ gap: 8 }}>
                  <span className="font-display font-bold text-center" style={{ fontSize: 60, width: 60, color: "var(--bn-accent)" }}>
                    {letter}
                  </span>
                  {Array.from({ length: PER_COLUMN }, (_, i) => c * PER_COLUMN + i + 1).map((n) => {
                    const on = called.has(n);
                    return (
                      <span
                        key={n}
                        className="rounded-lg font-bold flex items-center justify-center"
                        style={{
                          width: 58,
                          height: 58,
                          fontSize: 30,
                          background: n === last ? "var(--bn-accent)" : on ? "var(--bn-hit)" : "rgba(255,255,255,.08)",
                          color: n === last ? "var(--bn-accent-ink)" : on ? "var(--bn-hit-ink)" : "rgba(255,255,255,.35)",
                        }}
                      >
                        {n}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full grid" style={{ gridTemplateColumns: `repeat(${wordCols}, 1fr)`, gridTemplateRows: `repeat(${Math.ceil(words.length / wordCols)}, minmax(0, 1fr))`, gap: 10 }}>
              {words.map((w, i) => {
                const on = called.has(i);
                return (
                  <span
                    key={i}
                    className="rounded-lg font-bold text-center flex items-center justify-center leading-tight"
                    style={{
                      fontSize: wordFont,
                      padding: "4px 6px",
                      background: i === last ? "var(--bn-accent)" : on ? "var(--bn-hit)" : "rgba(255,255,255,.08)",
                      color: i === last ? "var(--bn-accent-ink)" : on ? "var(--bn-hit-ink)" : "rgba(255,255,255,.4)",
                    }}
                  >
                    {icons?.[i] && <WikiIcon src={icons[i]} size={wordFont * 1.25} style={{ marginRight: 8, opacity: on || i === last ? 1 : 0.45 }} />}
                    {w}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between" style={{ fontSize: 36, gap: 24 }}>
          <span className="flex items-center" style={{ gap: 20 }}>
            <QrCode url={joinUrl} size={150} />
            <span>
              Scan or go to
              <b className="block" style={{ color: "var(--bn-accent)" }}>
                {JOIN}
              </b>
            </span>
          </span>
          {state.pastWinners.length > 0 && <span style={{ fontSize: 28, opacity: 0.85 }}>Earlier winners: {state.pastWinners.slice(0, 3).map((w) => w.rsn).join(", ")}</span>}
        </div>
      </div>

      {winners.length > 0 && (
        <div className="absolute left-0 right-0 bn-pop flex items-center justify-center" style={{ top: 330 }}>
          <div className="rounded-3xl text-center shadow-2xl" style={{ padding: "28px 72px", background: "var(--bn-accent)", color: "var(--bn-accent-ink)", border: "6px solid var(--bn-panel)" }}>
            <p className="uppercase font-bold" style={{ fontSize: 32, letterSpacing: 6 }}>
              🎉 Bingo! Round {round?.number} winner{winners.length > 1 ? "s" : ""}
            </p>
            <p className="font-display font-bold" style={{ fontSize: 88, lineHeight: 1.1 }}>
              {winners.map((w) => w.rsn).join(" & ")}
            </p>
          </div>
        </div>
      )}
    </div>,
  );
}
