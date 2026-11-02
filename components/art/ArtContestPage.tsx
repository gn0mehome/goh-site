"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { Countdown } from "@/components/bingo/Countdown";
import { CONTEST_STATUS_LABELS, ENTRY_STATUS_LABELS, type ArtContest, type ArtEntryStatus, type EntryResult } from "@/lib/art";
import { ArtEntryForm, emptyEntry, type EntryDraft } from "./ArtEntryForm";

interface ShownEntry {
  id: string;
  title: string;
  description: string | null;
  images: string[];
  artist: string | null;
  visibility: "public" | "clan";
  isMine: boolean;
  comments: { comment: string; by: string | null; at: string }[];
}
interface MyEntry extends ShownEntry {
  status: ArtEntryStatus;
  review_note: string | null;
  credit: "rsn" | "custom" | "anonymous";
  credit_name: string | null;
  gallery_opt_in: boolean;
  image_paths: string[];
}
interface PageData {
  contest: ArtContest;
  entries: ShownEntry[];
  results: EntryResult[];
  countsVisible: boolean;
  myEntries: MyEntry[];
  myBallot: { entryId: string; comment: string }[];
  viewer: { signedIn: boolean; rsn: string | null; clanMember: boolean; isStaff: boolean; canSubmit: boolean; submitReason: string | null; entriesLeft: number; canVote: boolean; voteReason: string | null };
}

const STATUS_TONE: Record<ArtEntryStatus, string> = {
  pending: "bg-gold/15 text-gold",
  approved: "bg-gnome-green/15 text-gnome-green",
  rejected: "bg-red-accent/10 text-red-accent",
  withdrawn: "bg-iron-grey/15 text-iron-grey",
};

async function fetchContest(id: string): Promise<PageData | { error: string }> {
  const res = await fetch(`/api/art/${id}`);
  const json = await res.json().catch(() => ({}));
  return res.ok ? json : { error: json.error ?? "Couldn't load this contest." };
}

function Gallery({ images, title, onOpen }: { images: string[]; title: string; onOpen: (url: string) => void }) {
  if (images.length === 0) return null;
  return (
    <div className="space-y-1">
      <button type="button" onClick={() => onOpen(images[0])} className="block w-full cursor-zoom-in rounded-md overflow-hidden bg-black/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[0]} alt={title} className="w-full aspect-[4/3] object-contain" loading="lazy" />
      </button>
      {images.length > 1 && (
        <div className="flex gap-1">
          {images.slice(1).map((u, i) => (
            <button key={u} type="button" onClick={() => onOpen(u)} className="cursor-zoom-in rounded overflow-hidden bg-black/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt={`${title} (${i + 2})`} className="w-14 h-14 object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ArtContestPage({ contestId }: { contestId: string }) {
  const [data, setData] = useState<PageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [editing, setEditing] = useState<EntryDraft | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [picks, setPicks] = useState<Map<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  const apply = useCallback((res: PageData | { error: string }) => {
    if ("error" in res) return setError(res.error);
    setData(res);
    setPicks(null); // back to the saved ballot
  }, []);
  const load = useCallback(async () => apply(await fetchContest(contestId)), [contestId, apply]);
  useEffect(() => {
    let cancelled = false;
    fetchContest(contestId).then((res) => !cancelled && apply(res));
    return () => {
      cancelled = true;
    };
  }, [contestId, apply]);

  const saved = useMemo(() => new Map((data?.myBallot ?? []).map((b) => [b.entryId, b.comment])), [data]);
  const ballot = picks ?? saved;

  if (!data) {
    return error ? (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-3">
        <p className="text-bark-brown">{error}</p>
        <Link href="/contests" className="text-gnome-green hover:underline text-sm">
          ← Back to Contests
        </Link>
      </div>
    ) : (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-parchment-dark border-t-gnome-green rounded-full animate-spin" />
      </div>
    );
  }

  const { contest, viewer } = data;
  const voting = contest.status === "voting";
  const finished = contest.status === "completed";
  const max = contest.votes_per_voter;
  const dirty = picks !== null;
  const resultFor = new Map(data.results.map((r) => [r.entryId, r]));
  const showComments = contest.comments_visibility !== "off";

  const toggle = (id: string) => {
    const next = new Map(ballot);
    if (next.has(id)) next.delete(id);
    else if (next.size < max) next.set(id, "");
    setPicks(next);
  };
  const setComment = (id: string, text: string) => {
    const next = new Map(ballot);
    next.set(id, text);
    setPicks(next);
  };
  const saveBallot = async () => {
    setBusy(true);
    setNotice(null);
    const res = await fetch(`/api/art/${contest.id}/ballot`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ picks: [...ballot.entries()].map(([entryId, comment]) => ({ entryId, comment })) }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setNotice({ ok: false, text: json.error ?? "Couldn't save your votes." });
    setNotice({ ok: true, text: json.votes ? `Your ${json.votes === 1 ? "vote is" : `${json.votes} votes are`} in. You can change ${json.votes === 1 ? "it" : "them"} until voting closes.` : "Your votes were cleared." });
    await load();
  };
  const withdraw = async (id: string) => {
    setBusy(true);
    await fetch(`/api/art/${contest.id}/entries/${id}`, { method: "DELETE" });
    setBusy(false);
    setWithdrawing(null);
    setNotice({ ok: true, text: "Your entry was withdrawn." });
    await load();
  };
  const startEdit = (e: MyEntry) =>
    setEditing({
      id: e.id,
      title: e.title,
      description: e.description ?? "",
      images: e.image_paths.map((path, i) => ({ path, preview: e.images[i] ?? "" })),
      credit: e.credit,
      credit_name: e.credit_name ?? "",
      gallery_opt_in: e.gallery_opt_in,
    });

  const ordered = finished && data.countsVisible ? [...data.entries].sort((a, b) => (resultFor.get(a.id)?.rank ?? 99) - (resultFor.get(b.id)?.rank ?? 99)) : data.entries;
  const podium = finished ? data.results.filter((r) => r.votes > 0 && r.rank <= 3) : [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <Link href="/contests" className="text-sm text-gnome-green hover:underline">
        ← Contests
      </Link>
      {contest.banner_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={contest.banner_url} alt="" className="w-full h-40 sm:h-56 object-cover rounded-xl" />
      )}
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-iron-grey">
          🎨 Art contest · {CONTEST_STATUS_LABELS[contest.status]}
          {contest.status === "submissions" && contest.submissions_close_at && (
            <>
              {" · "}
              <Countdown to={contest.submissions_close_at} prefix="entries close in" ended="entries closed" />
            </>
          )}
          {voting && contest.voting_close_at && (
            <>
              {" · "}
              <Countdown to={contest.voting_close_at} prefix="voting closes in" ended="voting closed" />
            </>
          )}
        </p>
        <h1 className="font-display text-4xl text-gnome-green break-words">{contest.name}</h1>
        {contest.theme && (
          <p className="text-lg text-bark-brown">
            Theme: <span className="font-semibold">{contest.theme}</span>
          </p>
        )}
        {contest.description && <p className="text-bark-brown-light max-w-3xl whitespace-pre-line">{contest.description}</p>}
      </header>

      {contest.rules && (
        <details className="card-wood rounded-lg p-4" open={contest.status === "submissions"}>
          <summary className="cursor-pointer font-semibold text-bark-brown">Rules</summary>
          <p className="text-sm text-bark-brown-light whitespace-pre-line mt-2">{contest.rules}</p>
        </details>
      )}

      {notice && <p className={`text-sm ${notice.ok ? "text-gnome-green" : "text-red-accent"}`}>{notice.text}</p>}

      {/* Entering */}
      {contest.status === "submissions" && !editing && (
        <Card hover={false} className="space-y-3">
          <h2 className="font-display text-2xl text-bark-brown">Enter the contest</h2>
          {viewer.canSubmit && viewer.entriesLeft > 0 ? (
            <ArtEntryForm
              contestId={contest.id}
              draft={{ ...emptyEntry(), credit: viewer.rsn ? "rsn" : "anonymous" }}
              maxImages={contest.max_images_per_entry}
              rsn={viewer.rsn}
              rules={contest.rules}
              clanOnly={contest.entry_visibility === "clan"}
              onDone={async (msg) => {
                setNotice({ ok: true, text: msg });
                await load();
              }}
            />
          ) : viewer.canSubmit ? (
            <p className="text-sm text-bark-brown-light">
              You&apos;ve entered {contest.max_entries_per_person === 1 ? "already" : `the most pieces allowed (${contest.max_entries_per_person})`}. You can edit {contest.max_entries_per_person === 1 ? "it" : "them"} below.
            </p>
          ) : (
            <p className="text-sm text-bark-brown-light">
              {viewer.submitReason}{" "}
              {!viewer.signedIn && (
                <Link href={`/login?redirect=${encodeURIComponent(`/art/${contest.id}`)}`} className="text-gnome-green hover:underline">
                  Sign in
                </Link>
              )}
            </p>
          )}
        </Card>
      )}

      {editing && (
        <Card hover={false} className="space-y-3">
          <h2 className="font-display text-2xl text-bark-brown">Edit your entry</h2>
          {contest.status !== "submissions" && <p className="text-sm text-iron-grey">Entries have closed, so the piece itself can&apos;t change, but you can still change your credit and the gallery choice.</p>}
          <ArtEntryForm
            contestId={contest.id}
            draft={editing}
            maxImages={contest.max_images_per_entry}
            rsn={viewer.rsn}
            rules={contest.rules}
            clanOnly={contest.entry_visibility === "clan"}
            pieceLocked={contest.status !== "submissions"}
            onCancel={() => setEditing(null)}
            onDone={async (msg) => {
              setEditing(null);
              setNotice({ ok: true, text: msg });
              await load();
            }}
          />
        </Card>
      )}

      {/* Your entries */}
      {data.myEntries.length > 0 && !editing && (
        <section className="space-y-3">
          <h2 className="font-display text-2xl text-bark-brown">Your {data.myEntries.length === 1 ? "entry" : "entries"}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.myEntries.map((e) => (
              <Card key={e.id} hover={false} className="space-y-2">
                <Gallery images={e.images} title={e.title} onOpen={setLightbox} />
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-bark-brown break-words">{e.title}</h3>
                  <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full font-semibold ${STATUS_TONE[e.status]}`}>{ENTRY_STATUS_LABELS[e.status]}</span>
                </div>
                {e.review_note && e.status === "rejected" && <p className="text-xs text-red-accent">Staff: {e.review_note}</p>}
                <p className="text-[11px] text-iron-grey">
                  {e.visibility === "clan" ? "Clan members only" : "Everyone can see it"} · credited as {e.artist} · {e.gallery_opt_in ? "in the gallery afterwards" : "not in the gallery"}
                </p>
                {e.comments.length > 0 && <p className="text-xs text-gnome-green">{e.comments.length} {e.comments.length === 1 ? "comment" : "comments"} below</p>}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(e)}>
                    {contest.status === "submissions" ? "Edit" : "Change privacy"}
                  </Button>
                  {(contest.status === "submissions" || contest.status === "review") &&
                    (withdrawing === e.id ? (
                      <>
                        <Button size="sm" variant="ghost" className="text-red-accent" disabled={busy} onClick={() => withdraw(e.id)}>
                          Yes, withdraw
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setWithdrawing(null)}>
                          Keep it
                        </Button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setWithdrawing(e.id)} className="text-xs text-red-accent hover:underline cursor-pointer">
                        Withdraw
                      </button>
                    ))}
                </div>
                {e.comments.length > 0 && (
                  <ul className="space-y-1 pt-1 border-t border-bark-brown-light/20">
                    {e.comments.map((c, i) => (
                      <li key={i} className="text-xs text-bark-brown-light">
                        &ldquo;{c.comment}&rdquo;{c.by ? <span className="text-iron-grey"> · {c.by}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      {contest.status === "review" && (
        <Card hover={false} className="text-center py-8">
          <p className="text-bark-brown">Entries are closed and staff are looking through them.</p>
          <p className="text-sm text-iron-grey mt-1">Voting opens soon. Check back here!</p>
        </Card>
      )}

      {/* Voting and results */}
      {(voting || finished) && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl text-bark-brown">{finished ? "Results" : "Vote for your favourite" + (max > 1 ? "s" : "")}</h2>
              {voting && (
                <p className="text-sm text-bark-brown-light">
                  {viewer.canVote
                    ? `Pick up to ${max} ${max === 1 ? "entry" : "different entries"}${showComments ? ", and say why if you like" : ""}. ${contest.show_live_results ? "Vote counts are shown live." : "Counts stay hidden until voting ends."}`
                    : viewer.voteReason}
                  {!viewer.signedIn && contest.vote_eligibility !== "ip" && (
                    <>
                      {" "}
                      <Link href={`/login?redirect=${encodeURIComponent(`/art/${contest.id}`)}`} className="text-gnome-green hover:underline">
                        Sign in
                      </Link>
                    </>
                  )}
                </p>
              )}
            </div>
          </div>

          {podium.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-3">
              {podium.map((r) => {
                const e = data.entries.find((x) => x.id === r.entryId);
                if (!e) return null;
                return (
                  <Card key={r.entryId} hover={false} className={`space-y-2 ${r.rank === 1 ? "border-2 border-gold" : ""}`}>
                    <p className="font-display text-2xl">{["🥇", "🥈", "🥉"][r.rank - 1]}</p>
                    <Gallery images={e.images.slice(0, 1)} title={e.title} onOpen={setLightbox} />
                    <p className="font-semibold text-bark-brown">{e.title}</p>
                    <p className="text-xs text-iron-grey">
                      by {e.artist ?? "Anonymous"} · {r.votes} {r.votes === 1 ? "vote" : "votes"}
                    </p>
                  </Card>
                );
              })}
            </div>
          )}

          {podium.length > 0 && <h3 className="font-display text-xl text-bark-brown pt-2">All entries</h3>}
          {ordered.length === 0 ? (
            <Card hover={false} className="text-center py-8">
              <p className="text-sm text-iron-grey">No entries to show{!viewer.clanMember ? " (some may be for clan members only)" : ""}.</p>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ordered.map((e) => {
                const picked = ballot.has(e.id);
                const r = resultFor.get(e.id);
                const full = !picked && ballot.size >= max;
                return (
                  <Card key={e.id} hover={false} className={`space-y-2 ${picked ? "!border-2 !border-gnome-green shadow-lg" : ""}`}>
                    <Gallery images={e.images} title={e.title} onOpen={setLightbox} />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-bark-brown break-words">{e.title}</h3>
                        {e.artist && <p className="text-xs text-iron-grey">by {e.artist}</p>}
                      </div>
                      {data.countsVisible && r && (
                        <span className="shrink-0 text-xs font-semibold text-bark-brown tabular-nums">
                          {finished && r.votes > 0 ? `#${r.rank} · ` : ""}
                          {r.votes} {r.votes === 1 ? "vote" : "votes"}
                        </span>
                      )}
                    </div>
                    {e.description && <p className="text-sm text-bark-brown-light whitespace-pre-line line-clamp-4">{e.description}</p>}
                    {e.visibility === "clan" && <p className="text-[11px] text-gold">Clan members only</p>}

                    {voting && viewer.canVote && !e.isMine && (
                      <div className="space-y-2 pt-1">
                        <Button size="sm" variant={picked ? "primary" : "ghost"} disabled={full} onClick={() => toggle(e.id)}>
                          {picked ? "✓ Your pick" : full ? `All ${max} votes used` : "Vote for this"}
                        </Button>
                        {picked && showComments && (
                          <textarea
                            value={ballot.get(e.id) ?? ""}
                            onChange={(ev) => setComment(e.id, ev.target.value)}
                            maxLength={500}
                            rows={2}
                            placeholder={`Why this one? (optional)${contest.comments_visibility === "private" ? " Only the artist and staff see it." : contest.comments_visibility === "after" ? " Shown once voting ends." : ""}`}
                            className="w-full px-3 py-2 rounded-md border border-bark-brown-light bg-parchment text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-gnome-green"
                          />
                        )}
                      </div>
                    )}
                    {e.isMine && voting && <p className="text-[11px] text-iron-grey">Your entry</p>}

                    {e.comments.length > 0 && (
                      <details className="pt-1 border-t border-bark-brown-light/20">
                        <summary className="text-xs text-gnome-green cursor-pointer">
                          {e.comments.length} {e.comments.length === 1 ? "comment" : "comments"}
                        </summary>
                        <ul className="mt-1 space-y-1">
                          {e.comments.map((c, i) => (
                            <li key={i} className="text-xs text-bark-brown-light">
                              &ldquo;{c.comment}&rdquo;{c.by ? <span className="text-iron-grey"> · {c.by}</span> : null}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {voting && viewer.canVote && (
            <div className="sticky bottom-3 z-20">
              <div className="card-wood rounded-xl shadow-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-bark-brown">
                  <span className="font-semibold">{ballot.size}</span> of {max} {max === 1 ? "vote" : "votes"} used
                  {!dirty && saved.size > 0 && <span className="text-gnome-green"> · saved</span>}
                  {dirty && <span className="text-gold"> · not saved yet</span>}
                </p>
                <div className="flex gap-2">
                  {dirty && (
                    <Button size="sm" variant="ghost" onClick={() => setPicks(null)}>
                      Undo changes
                    </Button>
                  )}
                  <Button size="sm" disabled={busy || !dirty} onClick={saveBallot}>
                    {busy ? "Saving..." : saved.size ? "Update my votes" : "Submit my votes"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {finished && (
        <p className="text-sm text-iron-grey">
          Pieces whose artists said yes are in the{" "}
          <Link href="/gallery" className="text-gnome-green hover:underline">
            Gn0mie Gallery
          </Link>
          .
        </p>
      )}
      {viewer.isStaff && (
        <p className="text-xs text-iron-grey">
          Staff:{" "}
          <Link href={`/admin/art/${contest.id}`} className="text-gnome-green hover:underline">
            manage this contest
          </Link>
          {contest.status === "draft" && " (this is a preview; members can't see drafts)"}
        </p>
      )}
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
