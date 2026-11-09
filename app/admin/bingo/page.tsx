"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { STATUS_LABELS, type BingoEvent } from "@/lib/bingo";
import { STATUS_CHIP } from "@/components/admin/bingo/BingoBuilder";
import { inputClass } from "@/components/admin/bingo/BasicsStep";

type ListedEvent = BingoEvent & { tileCount: number; playerCount: number; pendingCount: number; signupCount: number };

function dates(e: BingoEvent): string {
  const f = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (e.starts_at && e.ends_at) return `${f(e.starts_at)} – ${f(e.ends_at)}`;
  if (e.ends_at) return `ends ${f(e.ends_at)}`;
  return "no dates yet";
}

export default function BingoAdminListPage() {
  const router = useRouter();
  const [events, setEvents] = useState<ListedEvent[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/bingo")
      .then((res) => res.json().then((data) => (res.ok ? data.events ?? [] : [])))
      .catch(() => [])
      .then((list) => !cancelled && setEvents(list));
    return () => {
      cancelled = true;
    };
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/bingo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, copyFrom: copyFrom || null }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) router.push(`/admin/bingo/${data.id}`);
    else setError(data.error ?? "Couldn't create it.");
  };

  const pending = (events ?? []).reduce((n, e) => n + e.pendingCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-gnome-green">Clan Bingo</h1>
          <p className="text-bark-brown-light">Build boards, put teams together and review proof.</p>
        </div>
        <div className="flex gap-2">
          {pending > 0 && (
            <Link href="/admin/bingo/submissions">
              <Button variant="ghost">Review {pending}</Button>
            </Link>
          )}
          <Button onClick={() => setCreating((v) => !v)}>+ New bingo</Button>
        </div>
      </div>

      {creating && (
        <Card hover={false} className="space-y-3">
          <h2 className="font-display text-xl text-bark-brown">New bingo</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="bingo-name" className="block text-sm font-semibold text-bark-brown mb-1">Name</label>
              <input id="bingo-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Winter Clan Bingo 2026" autoFocus />
            </div>
            {(events ?? []).length > 0 && (
              <div>
                <label htmlFor="bingo-copy" className="block text-sm font-semibold text-bark-brown mb-1">Start from</label>
                <select id="bingo-copy" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className={`${inputClass} cursor-pointer`}>
                  <option value="">A blank board</option>
                  {(events ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      A copy of {e.name} ({e.tileCount} tiles)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <p className="text-xs text-iron-grey">
            {(events ?? []).length > 0 && "A copy brings over the tiles, team names and scoring, but no players or progress. "}It starts as a draft only staff can see.
          </p>
          {error && <p className="text-sm text-red-accent">{error}</p>}
          <div className="flex gap-2">
            <Button disabled={busy || !name.trim()} onClick={create}>
              {busy ? "Creating..." : "Create and start building"}
            </Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {events === null ? (
        <p className="text-sm text-iron-grey">Loading...</p>
      ) : events.length === 0 ? (
        <Card hover={false} className="text-center py-10 space-y-2">
          <p className="text-bark-brown">No clan bingos yet.</p>
          <p className="text-sm text-iron-grey">Press &quot;New bingo&quot; to build your first board. It stays a private draft until you open sign-ups or go live.</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {events.map((e) => (
            <Link key={e.id} href={`/admin/bingo/${e.id}`} className="block">
              <Card className="h-full space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold text-bark-brown break-words min-w-0">{e.name}</h2>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_CHIP[e.status]}`}>{STATUS_LABELS[e.status]}</span>
                </div>
                <p className="text-xs text-iron-grey">
                  {e.grid_size}×{e.grid_size} · {e.tileCount}/{e.grid_size * e.grid_size} tiles · {e.playerCount} players
                  {e.status === "signups" && ` · ${e.signupCount} signed up`} · {dates(e)}
                </p>
                {e.pendingCount > 0 && <p className="text-xs font-semibold text-gold">{e.pendingCount} waiting for review</p>}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
