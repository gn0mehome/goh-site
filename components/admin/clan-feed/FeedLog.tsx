"use client";

import { Fragment, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/admin/bingo/BasicsStep";
import type { FeedEvent } from "@/lib/clan-feed";
import type { FeedOutcome } from "@/lib/clan-feed-server";

interface Logged {
  id: string;
  channel_id: string;
  author_name: string | null;
  posted_at: string;
  text: string;
  image_urls: string[];
  events: FeedEvent[];
  outcomes: FeedOutcome[];
}

const KIND_LABEL: Record<FeedEvent["kind"], string> = { drop: "Drop", collection_log: "Collection log", pet: "Pet", quest: "Quest" };
const STATUSES = [
  ["all", "Everything"],
  ["counted", "Counted"],
  ["review", "Sent for review"],
  ["matched", "Matched an event"],
  ["nomatch", "No live event"],
  ["unread", "Not understood"],
] as const;
type Status = (typeof STATUSES)[number][0];

const selectClass = `${inputClass} py-1.5 cursor-pointer`;

function day(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function time(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** One short verdict for a row, with the colour it shows in. */
function verdict(m: Logged): { text: string; tone: string; detail?: string } {
  const counted = m.outcomes.find((o) => o.result === "counted");
  if (counted) return { text: "Counted", tone: "bg-gnome-green/15 text-gnome-green", detail: `${counted.eventName}${counted.tileTitle ? ` › ${counted.tileTitle}` : ""}` };
  const queued = m.outcomes.find((o) => o.result === "queued");
  if (queued) return { text: "Sent for review", tone: "bg-gold/15 text-gold", detail: `${queued.eventName}${queued.tileTitle ? ` › ${queued.tileTitle}` : ""}` };
  if (m.outcomes.length) {
    const o = m.outcomes[0];
    return { text: o.result.charAt(0).toUpperCase() + o.result.slice(1), tone: "bg-iron-grey/15 text-bark-brown-light", detail: o.eventName };
  }
  if (m.events.length) return { text: "No live event", tone: "bg-parchment-dark text-iron-grey" };
  return { text: "Not understood", tone: "bg-red-accent/10 text-red-accent" };
}

/** The Clan Feed log: a filterable, sortable, paged table of every post read. */
export function FeedLog({ sources, refreshKey }: { sources: { id: string; name: string }[]; refreshKey: number }) {
  const [rows, setRows] = useState<Logged[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [order, setOrder] = useState<"desc" | "asc">("desc");
  const [status, setStatus] = useState<Status>("all");
  const [source, setSource] = useState("");
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // Search waits for typing to pause.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ page: String(page), size: String(size), order, status, source, kind, q });
    fetch(`/api/admin/clan-feed/log?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setRows(d.messages ?? []);
        setTotal(d.total ?? 0);
      })
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [page, size, order, status, source, kind, q, refreshKey, reload]);

  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const replay = async (id: string) => {
    setBusy(id);
    await fetch("/api/admin/clan-feed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "replay", id }) });
    setBusy(null);
    setReload((n) => n + 1);
  };

  const pages = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  const sourceName = (id: string) => sources.find((x) => x.id === id)?.name ?? id;

  return (
    <Card hover={false} className="space-y-3">
      <div>
        <h2 className="font-display text-xl text-bark-brown">What the bot has read</h2>
        <p className="text-xs text-iron-grey">The last 30 days. Open a row to see the original post and everything it was checked against.</p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search player, item or quest..." aria-label="Search the log" className={`${inputClass} py-1.5 sm:w-64`} />
        <select value={status} onChange={(e) => filter(setStatus)(e.target.value as Status)} aria-label="Result" className={`${selectClass} sm:w-44`}>
          {STATUSES.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select value={kind} onChange={(e) => filter(setKind)(e.target.value)} aria-label="Type" className={`${selectClass} sm:w-40`}>
          <option value="">Any type</option>
          {Object.entries(KIND_LABEL).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select value={source} onChange={(e) => filter(setSource)(e.target.value)} aria-label="Source" className={`${selectClass} sm:w-48`}>
          <option value="">Any source</option>
          {sources.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-md border border-bark-brown-light/30">
        <table className="w-full text-sm">
          <thead className="bg-parchment-dark/50 text-left text-xs text-iron-grey">
            <tr>
              <th className="px-3 py-2 font-medium whitespace-nowrap">
                <button type="button" onClick={() => filter(setOrder)(order === "desc" ? "asc" : "desc")} className="cursor-pointer hover:text-bark-brown">
                  When {order === "desc" ? "↓" : "↑"}
                </button>
              </th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Player</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Item or quest</th>
              <th className="px-3 py-2 font-medium">Result</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-iron-grey">
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-iron-grey">
                  Nothing matches.
                </td>
              </tr>
            ) : (
              rows.map((m) => {
                const ev = m.events[0];
                const v = verdict(m);
                const isOpen = open === m.id;
                return (
                  <Fragment key={m.id}>
                    <tr onClick={() => setOpen(isOpen ? null : m.id)} className={`border-t border-bark-brown-light/20 cursor-pointer ${isOpen ? "bg-parchment-dark/40" : "hover:bg-parchment-dark/25"}`}>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                        <span className="text-bark-brown">{day(m.posted_at)}</span> <span className="text-iron-grey">{time(m.posted_at)}</span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-bark-brown-light">{sourceName(m.channel_id)}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-bark-brown">{ev?.rsn ?? <span className="text-iron-grey">—</span>}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-bark-brown-light">{ev ? KIND_LABEL[ev.kind] : "—"}</td>
                      <td className="px-3 py-2 text-bark-brown">
                        {ev ? (
                          <>
                            {ev.name}
                            {ev.quantity > 1 && <span className="text-iron-grey"> × {ev.quantity.toLocaleString()}</span>}
                            {m.events.length > 1 && <span className="text-xs text-iron-grey"> +{m.events.length - 1} more</span>}
                          </>
                        ) : (
                          <span className="text-iron-grey truncate block max-w-64">{m.text.split("\n")[0]}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${v.tone}`}>{v.text}</span>
                        {v.detail && <span className="block text-[11px] text-iron-grey mt-0.5 max-w-56 truncate">{v.detail}</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-gnome-green whitespace-nowrap">{isOpen ? "Hide" : "Details"}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-parchment-dark/40">
                        <td colSpan={7} className="px-3 pb-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <p className="text-xs font-semibold text-bark-brown mb-1">Checked against</p>
                              {m.outcomes.length === 0 ? (
                                <p className="text-xs text-iron-grey">{m.events.length ? "No bingo or quest event was live for this." : "The post wasn't understood, so nothing was checked."}</p>
                              ) : (
                                <ul className="space-y-0.5">
                                  {m.outcomes.map((o, i) => (
                                    <li key={i} className="text-xs text-bark-brown-light">
                                      <span className="font-semibold text-bark-brown">{o.result === "queued" ? "Sent for review" : o.result.charAt(0).toUpperCase() + o.result.slice(1)}</span> · {o.target === "bingo" ? "Clan Bingo" : "Quest event"} {o.eventName}
                                      {o.tileTitle && ` › ${o.tileTitle}`}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {m.events.length > 0 && (
                                <Button size="sm" variant="ghost" className="mt-2" disabled={busy === m.id} onClick={() => replay(m.id)}>
                                  {busy === m.id ? "Checking..." : "Run again"}
                                </Button>
                              )}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-bark-brown mb-1">Original post · {m.author_name ?? "unknown"}</p>
                              <pre className="whitespace-pre-wrap font-mono text-[11px] text-bark-brown-light bg-parchment/60 rounded p-2 max-h-48 overflow-y-auto">{m.text}</pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-iron-grey">
          {from}–{to} of {total.toLocaleString()}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <select value={size} onChange={(e) => filter(setSize)(Number(e.target.value))} aria-label="Rows per page" className={`${selectClass} w-auto`}>
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} per page
              </option>
            ))}
          </select>
          <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(1)} aria-label="First page">
            «
          </Button>
          <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Previous
          </Button>
          <span className="text-iron-grey tabular-nums">
            Page {page} of {pages}
          </span>
          <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next →
          </Button>
        </div>
      </div>
    </Card>
  );
}
