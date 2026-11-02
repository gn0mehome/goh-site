import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { Countdown } from "@/components/bingo/Countdown";
import { checkSectionAccess } from "@/lib/section-gate";
import { SectionUnavailable } from "@/components/layout/SectionUnavailable";
import { questServiceClient } from "@/lib/quest-server";
import { eventQuests, type QuestEvent } from "@/lib/quests";

export const metadata: Metadata = {
  title: "Contests",
  description: "Clan-run contests to take part in: team bingos, quest races and art contests, live and coming up.",
};

export const dynamic = "force-dynamic"; // gated per-viewer, can't be statically cached

type Kind = "bingo" | "quests" | "art";
type Phase = "live" | "soon" | "finished";

interface Activity {
  kind: Kind;
  key: string;
  href: string;
  title: string;
  blurb: string | null;
  detail: string;
  banner: string | null;
  phase: Phase;
  signups: boolean;
  /** A stage label shown instead of "Sign-ups open" (art contests). */
  badge?: string;
  startsAt: string | null;
  endsAt: string | null;
}

const KIND_LABEL: Record<Kind, { label: string; icon: string; tint: string }> = {
  bingo: { label: "Bingo", icon: "🎯", tint: "bg-[#2E64A8]/10 text-[#2E64A8]" },
  quests: { label: "Quest event", icon: "📜", tint: "bg-[#B5862A]/15 text-[#8a6418]" },
  art: { label: "Art contest", icon: "🎨", tint: "bg-[#C2577E]/15 text-[#A23F66]" },
};

const ALWAYS_ON = [
  { href: "/competitions", title: "WOM Competitions", text: "Skill & Boss of the Week and other Wise Old Man competitions, with prizes and a raffle.", icon: "📈", section: "competitions" },
  { href: "/leaderboard", title: "Attendance Leaderboard", text: "Who's been to the most clan events.", icon: "📅", section: "leaderboard" },
  { href: "/hiscores", title: "Clan Hiscores", text: "How you stack up against the clan in every skill and boss.", icon: "🥇", section: "hiscores" },
  { href: "/gallery", title: "Gn0mie Gallery", text: "Artwork by clan members from our art contests.", icon: "🖼️", section: "gallery" },
] as const;

function phaseOf(status: string, startsAt: string | null, endsAt: string | null, now: number): Phase {
  if (status === "completed") return "finished";
  if (status === "signups") return "soon";
  if (startsAt && Date.parse(startsAt) > now) return "soon";
  if (endsAt && Date.parse(endsAt) <= now) return "finished";
  return "live";
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

async function loadActivities(show: Record<Kind, boolean>): Promise<{ list: Activity[]; now: number }> {
  const now = Date.now();
  const list: Activity[] = [];
  const supabase = questServiceClient();
  const recent = now - 30 * 86_400_000;

  const [bingos, questEvents, artContests] = await Promise.all([
    show.bingo && supabase
      ? supabase.from("bingo_events").select("id, name, description, banner_url, status, starts_at, ends_at, grid_size").in("status", ["signups", "active", "completed"])
      : Promise.resolve({ data: [] }),
    show.quests && supabase
      ? supabase.from("quest_events").select("id, name, description, banner_url, status, starts_at, ends_at, format, quest_names, include_miniquests").in("status", ["signups", "active", "completed"])
      : Promise.resolve({ data: [] }),
    show.art && supabase
      ? supabase.from("art_contests").select("id, name, description, theme, banner_url, status, submissions_close_at, voting_close_at, updated_at").neq("status", "draft")
      : Promise.resolve({ data: [] }),
  ]);

  for (const b of bingos.data ?? []) {
    list.push({
      kind: "bingo",
      key: `bingo-${b.id}`,
      href: `/bingo/${b.id}`,
      title: b.name,
      blurb: b.description,
      detail: `Team bingo · ${b.grid_size}×${b.grid_size} board`,
      banner: b.banner_url,
      phase: phaseOf(b.status, b.starts_at, b.ends_at, now),
      signups: b.status === "signups",
      startsAt: b.starts_at,
      endsAt: b.ends_at,
    });
  }
  for (const q of (questEvents.data ?? []) as (Pick<QuestEvent, "id" | "name" | "description" | "banner_url" | "status" | "starts_at" | "ends_at" | "format" | "quest_names" | "include_miniquests">)[]) {
    list.push({
      kind: "quests",
      key: `quests-${q.id}`,
      href: `/quests/${q.id}`,
      title: q.name,
      blurb: q.description,
      detail: `${q.format === "teams" ? "Team" : "Solo"} quest race · ${eventQuests(q).length} quests`,
      banner: q.banner_url,
      phase: phaseOf(q.status, q.starts_at, q.ends_at, now),
      signups: q.status === "signups",
      startsAt: q.starts_at,
      endsAt: q.ends_at,
    });
  }
  for (const a of (artContests.data ?? []) as { id: string; name: string; description: string | null; theme: string | null; banner_url: string | null; status: string; submissions_close_at: string | null; voting_close_at: string | null; updated_at: string }[]) {
    const stage = { submissions: "Taking entries", review: "Judging", voting: "Voting open", completed: "Finished" }[a.status] ?? "";
    list.push({
      kind: "art",
      key: `art-${a.id}`,
      href: `/art/${a.id}`,
      title: a.name,
      blurb: a.theme ? `Theme: ${a.theme}` : a.description,
      detail: stage,
      banner: a.banner_url,
      // Taking entries and voting are things to do now; judging is "coming up".
      phase: a.status === "completed" ? "finished" : a.status === "review" ? "soon" : "live",
      signups: false,
      badge: a.status === "submissions" || a.status === "voting" ? stage : undefined,
      startsAt: null,
      endsAt: a.status === "submissions" ? a.submissions_close_at : a.status === "voting" ? a.voting_close_at : a.status === "completed" ? a.updated_at : null,
    });
  }
  return {
    now,
    list: list.filter((a) => a.phase !== "finished" || !a.endsAt || Date.parse(a.endsAt) > recent),
  };
}

function ActivityCard({ a, now, big = false }: { a: Activity; now: number; big?: boolean }) {
  const kind = KIND_LABEL[a.kind];
  const starting = a.startsAt && Date.parse(a.startsAt) > now;
  const body = (
    <Card className={`h-full overflow-hidden p-0 flex flex-col ${big ? "border-2 border-gnome-green/30" : ""}`}>
      {a.banner && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.banner} alt="" className={`w-full object-cover ${big ? "h-36" : "h-24"}`} />
      )}
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
          <span className={`px-2 py-0.5 rounded-full ${kind.tint}`}>
            {kind.icon} {kind.label}
          </span>
          {a.phase === "live" && <span className="px-2 py-0.5 rounded-full bg-gnome-green text-text-light">● Live</span>}
          {a.signups && <span className="px-2 py-0.5 rounded-full bg-gold/20 text-bark-brown">Sign-ups open</span>}
          {a.badge && <span className="px-2 py-0.5 rounded-full bg-gold/20 text-bark-brown">{a.badge}</span>}
        </div>
        <h3 className={`font-display text-bark-brown leading-tight break-words ${big ? "text-2xl" : "text-xl"}`}>
          {a.title}
        </h3>
        {a.blurb && <p className="text-sm text-bark-brown-light line-clamp-2">{a.blurb}</p>}
        <p className="text-xs text-iron-grey mt-auto pt-1">
          {a.detail}
          {" · "}
          {a.phase === "finished" ? (
            a.endsAt ? `ended ${shortDate(a.endsAt)}` : "finished"
          ) : starting ? (
            <Countdown to={a.startsAt} prefix="starts in" ended="starting now" />
          ) : a.endsAt ? (
            <Countdown to={a.endsAt} prefix="ends in" ended="wrapping up" />
          ) : (
            "starts soon"
          )}
        </p>
      </div>
    </Card>
  );
  return (
    <Link href={a.href} className="block h-full">
      {body}
    </Link>
  );
}

export default async function ContestsPage() {
  if (!(await checkSectionAccess("activities"))) return <SectionUnavailable />;

  const [bingo, quests, art, competition, ...alwaysOn] = await Promise.all([
    checkSectionAccess("bingo"),
    checkSectionAccess("quests"),
    checkSectionAccess("art"),
    checkSectionAccess("competitions"),
    ...ALWAYS_ON.map((x) => checkSectionAccess(x.section)),
  ]);
  const { list, now } = await loadActivities({ bingo, quests, art });
  const byEnd = (a: Activity, b: Activity) => (a.endsAt ? Date.parse(a.endsAt) : Infinity) - (b.endsAt ? Date.parse(b.endsAt) : Infinity);
  const live = list.filter((a) => a.phase === "live").sort(byEnd);
  const soon = list.filter((a) => a.phase === "soon").sort((a, b) => (a.startsAt ? Date.parse(a.startsAt) : 0) - (b.startsAt ? Date.parse(b.startsAt) : 0));
  const finished = list.filter((a) => a.phase === "finished").sort((a, b) => -byEnd(a, b)).slice(0, 6);
  const always = ALWAYS_ON.filter((_, i) => alwaysOn[i]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-10">
      <header className="max-w-3xl">
        <h1 className="font-display text-4xl sm:text-5xl text-gnome-green">Contests</h1>
        <p className="text-bark-brown-light mt-2">
          Clan-run contests you can jump into: team bingos, quest races and art contests. Join from the contest&apos;s page, then check back here to see what&apos;s next.
          {competition && (
            <>
              {" "}
              Skill &amp; Boss of the Week lives on{" "}
              <Link href="/competitions" className="text-gnome-green hover:underline">
                WOM Competitions
              </Link>
              .
            </>
          )}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-bark-brown">Happening now</h2>
        {live.length === 0 ? (
          <Card hover={false} className="text-center py-8">
            <p className="text-bark-brown">Nothing live right now.</p>
            <p className="text-sm text-iron-grey mt-1">{soon.length ? "Something's coming up below. Sign up early!" : "Keep an eye on Discord for the next one."}</p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((a) => (
              <ActivityCard key={a.key} a={a} now={now} big />
            ))}
          </div>
        )}
      </section>

      {soon.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-2xl text-bark-brown">Sign-ups and coming up</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {soon.map((a) => (
              <ActivityCard key={a.key} a={a} now={now} />
            ))}
          </div>
        </section>
      )}

      {always.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-2xl text-bark-brown">Always running</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {always.map((x) => (
              <Link key={x.href} href={x.href} className="block h-full">
                <Card className="h-full space-y-1">
                  <p className="text-2xl" aria-hidden>
                    {x.icon}
                  </p>
                  <h3 className="font-semibold text-bark-brown">{x.title}</h3>
                  <p className="text-xs text-bark-brown-light">{x.text}</p>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {finished.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-2xl text-bark-brown">Recently finished</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {finished.map((a) => (
              <ActivityCard key={a.key} a={a} now={now} />
            ))}
          </div>
          <p className="text-sm text-iron-grey">
            Older ones:{" "}
            {bingo && (
              <Link href="/bingo" className="text-gnome-green hover:underline">
                past bingos
              </Link>
            )}
            {bingo && art && " · "}
            {art && (
              <Link href="/gallery" className="text-gnome-green hover:underline">
                art in the gallery
              </Link>
            )}
          </p>
        </section>
      )}
    </div>
  );
}
