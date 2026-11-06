"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  WHATS_NEW_EVENT,
  getWalkthrough,
  markSeen,
  setWalkthrough,
  walkthroughEntry,
  type WalkthroughState,
} from "@/lib/whats-new-state";

const KIND_LABELS = { new: "New", improved: "Improved", fixed: "Fixed", privacy: "Privacy" } as const;

/**
 * The "What's New" walkthrough card: while a walkthrough is running it
 * follows the viewer from page to page (it's mounted in the root layout),
 * showing the current change and Back / Next buttons that open each change's
 * page in turn.
 */
export function WalkthroughBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<WalkthroughState | null>(null);

  useEffect(() => {
    const sync = () => setState(getWalkthrough());
    // From a callback so no state is set synchronously in the effect.
    const frame = requestAnimationFrame(sync);
    window.addEventListener(WHATS_NEW_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener(WHATS_NEW_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!state) return null;
  const entry = walkthroughEntry(state);
  if (!entry) return null;

  const target = entry.links[0]?.href;
  const onTargetPage = target ? pathname === target.split(/[?#]/)[0] : true;
  const isLast = state.index >= state.ids.length - 1;

  const goTo = (index: number) => {
    const next = { ...state, index };
    setWalkthrough(next);
    const nextEntry = walkthroughEntry(next);
    const href = nextEntry?.links[0]?.href;
    if (href) router.push(href);
  };

  const finish = () => {
    markSeen(state.ids);
    setWalkthrough(null);
    router.push("/whats-new");
  };

  if (state.collapsed) {
    return (
      <button
        type="button"
        data-print-hide
        onClick={() => setWalkthrough({ ...state, collapsed: false })}
        className="fixed z-40 top-[4.75rem] right-3 rounded-full bg-gnome-green text-white text-xs font-semibold px-3 py-1.5 shadow-lg cursor-pointer hover:bg-gnome-green-light"
      >
        Walkthrough · {state.index + 1} of {state.ids.length}
      </button>
    );
  }

  return (
    <aside
      data-print-hide
      aria-label="What's New walkthrough"
      className="fixed z-40 top-[4.75rem] inset-x-3 sm:inset-x-auto sm:right-4 sm:w-[24rem] rounded-lg border-2 border-gnome-green bg-parchment shadow-2xl"
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gnome-green">
          What&apos;s New walkthrough · {state.index + 1} of {state.ids.length}
        </p>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWalkthrough({ ...state, collapsed: true })}
            aria-label="Minimise walkthrough"
            title="Minimise"
            className="w-7 h-7 rounded text-iron-grey hover:bg-parchment-dark cursor-pointer"
          >
            –
          </button>
          <button
            type="button"
            onClick={() => setWalkthrough(null)}
            aria-label="End walkthrough"
            title="End walkthrough"
            className="w-7 h-7 rounded text-iron-grey hover:bg-parchment-dark cursor-pointer"
          >
            ✕
          </button>
        </span>
      </div>

      <div className="px-4 pb-3 pt-1 space-y-2 max-h-[38vh] sm:max-h-[45vh] overflow-y-auto">
        <p className="font-semibold text-bark-brown leading-snug">
          <span className="mr-2 align-middle text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gnome-green/15 text-gnome-green">
            {KIND_LABELS[entry.kind]}
          </span>
          {entry.title}
        </p>
        {entry.audience === "admin" && <p className="text-xs text-iron-grey">Admin panel only -- opens if your rank has access.</p>}
        {/* Summary hidden on phones so the card doesn't cover the page; the steps say what to look at. */}
        <p className="hidden sm:block text-sm text-bark-brown-light">{entry.summary}</p>
        {entry.tryIt && entry.tryIt.length > 0 && (
          <ol className="list-decimal pl-5 text-sm text-bark-brown space-y-0.5">
            {entry.tryIt.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        )}
        {target && !onTargetPage && (
          <Link href={target} className="inline-block text-sm font-semibold text-gnome-green hover:underline">
            Go to {entry.links[0].label} →
          </Link>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-parchment-dark px-4 py-2.5">
        <button
          type="button"
          onClick={() => goTo(state.index - 1)}
          disabled={state.index === 0}
          className="text-sm text-bark-brown hover:text-gnome-green disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          ‹ Back
        </button>
        <Link href="/whats-new" className="text-xs text-iron-grey hover:text-gnome-green">
          All changes
        </Link>
        {isLast ? (
          <button type="button" onClick={finish} className="rounded-md bg-gnome-green px-3 py-1.5 text-sm font-semibold text-white hover:bg-gnome-green-light cursor-pointer">
            Finish
          </button>
        ) : (
          <button type="button" onClick={() => goTo(state.index + 1)} className="rounded-md bg-gnome-green px-3 py-1.5 text-sm font-semibold text-white hover:bg-gnome-green-light cursor-pointer">
            Next ›
          </button>
        )}
      </div>
    </aside>
  );
}
