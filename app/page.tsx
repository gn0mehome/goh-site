import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CLAN_NAME, CLAN_CHAT, DISCORD_INVITE, CLAN_TIMEZONE, SHOW_DISCORD_WIDGET } from "@/lib/constants";
import { getGroupDetails, getGroupAchievements, getGroupCompetitions, getCompetitionLeaders, type CompetitionLeader } from "@/lib/wom";
import { AchievementsTicker } from "@/components/home/AchievementsTicker";
import { formatNumber } from "@/lib/utils";
import { createClient } from "@supabase/supabase-js";
import { EVENT_TYPES } from "@/lib/constants";
import { checkSectionAccess } from "@/lib/section-gate";
import { SectionUnavailable } from "@/components/layout/SectionUnavailable";
import { getFeaturedTestimonials } from "@/lib/testimonials";
import { TestimonialsSection } from "@/components/testimonials/TestimonialsSection";
import { getLatestNewsletter } from "@/lib/newsletters";
import { formatIssueDate } from "@/lib/newsletter-format";
import { getDiscordNames, getMentionNames } from "@/lib/discord-names";
import { NewsList } from "@/components/home/NewsList";
import { DiscordWidget } from "@/components/home/DiscordWidget";

export const dynamic = "force-dynamic";

async function getUpcomingEvents() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  const supabase = createClient(url, key, {
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  // Events already under way stay listed until they end, so people can
  // check in from here while one is running. Events without an end time
  // count as running for a few hours after they start.
  const now = Date.now();
  const { data } = await supabase
    .from("events")
    .select("id, title, event_type, start_time, end_time, host_rsn, world, location, meet_location")
    .eq("show_on_calendar", true)
    .gte("start_time", new Date(now - LOOKBACK_MS).toISOString())
    .order("start_time", { ascending: true })
    .limit(10);

  return (data ?? [])
    .map((event) => {
      const start = new Date(event.start_time).getTime();
      const end = event.end_time ? new Date(event.end_time).getTime() : start + NO_END_TIME_RUNNING_MS;
      return { ...event, ended: end < now, happeningNow: start <= now && end >= now };
    })
    .filter((event) => !event.ended)
    .slice(0, 3);
}

const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const NO_END_TIME_RUNNING_MS = 3 * 60 * 60 * 1000;

async function getActiveCompetitions() {
  const competitions = await getGroupCompetitions();
  const now = new Date();
  const active = competitions
    .filter((c) => new Date(c.startsAt) <= now && new Date(c.endsAt) >= now)
    .slice(0, 1);

  const leaderEntries = await Promise.all(
    active.map(async (c) => [c.id, await getCompetitionLeaders(c.id, 3)] as const)
  );
  const leadersByCompetition = new Map<number, CompetitionLeader[]>(leaderEntries);

  return active.map((c) => ({ ...c, leaders: leadersByCompetition.get(c.id) ?? [] }));
}

async function getAnnouncements() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  const supabase = createClient(url, key, {
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, content, category, pinned, author_name, created_at")
    .eq("published", true)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Failed to fetch announcements:", error);
    return [];
  }

  return data ?? [];
}

export default async function HomePage() {
  if (!(await checkSectionAccess("home"))) return <SectionUnavailable />;

  const [groupDetails, achievements, upcomingEvents, activeCompetitions, announcements, featuredTestimonials, discordNames] = await Promise.all([
    getGroupDetails(),
    getGroupAchievements(50),
    getUpcomingEvents(),
    getActiveCompetitions(),
    getAnnouncements(),
    getFeaturedTestimonials(),
    getDiscordNames().catch(() => ({ channels: {}, roles: {}, guildId: null })),
  ]);
  // Only shout out the newsletter when there's an issue to read and the
  // section isn't hidden from this viewer.
  // Names for <@id> mentions in the news, from members' linked accounts.
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const mentionNames =
    serviceUrl && serviceKey && announcements.length
      ? await getMentionNames(createClient(serviceUrl, serviceKey), announcements.flatMap((a) => [a.title, a.content])).catch(() => ({}))
      : {};
  const latestNewsletter = (await checkSectionAccess("newsletter")) ? await getLatestNewsletter() : null;

  const memberCount = groupDetails?.memberships?.length ?? 0;
  const totalExp = groupDetails?.memberships?.reduce(
    (sum, m) => sum + (m.player.exp ?? 0),
    0
  ) ?? 0;

  // Deduplicate achievements: max 2 per player for variety
  const playerCounts = new Map<number, number>();
  const diverseAchievements = (achievements ?? []).filter((a: { playerId: number }) => {
    const count = playerCounts.get(a.playerId) ?? 0;
    if (count >= 2) return false;
    playerCounts.set(a.playerId, count + 1);
    return true;
  }).slice(0, 15);

  const recentAchievementCount = diverseAchievements.length;
  const widget = SHOW_DISCORD_WIDGET;

  return (
    <div>
      {/* Hero Section */}
      <section className="relative bg-gnome-green overflow-hidden">
        <div className="absolute inset-0 theme-banner-pattern" aria-hidden />
        {/* With SHOW_DISCORD_WIDGET on: welcome on the left and the live Discord
            widget on the right on wide screens, behind a toggle on smaller ones. */}
        <div className={`relative max-w-7xl mx-auto px-4 py-24 grid gap-10 ${widget ? "lg:py-14 lg:grid-cols-[1fr_auto] lg:items-center" : ""}`}>
          <div className={widget ? "text-center lg:text-left" : "text-center"}>
            <h1 className="font-display text-6xl md:text-7xl text-gold-light mb-4 text-shadow">
              {CLAN_NAME}
            </h1>
            <p className={`text-xl md:text-2xl text-parchment mb-8 max-w-2xl mx-auto ${widget ? "lg:mx-0" : ""}`}>
              An Old School RuneScape community built on friendship, adventure,
              and the occasional gnome pun.
            </p>
            <div className={`flex flex-col sm:flex-row gap-4 justify-center ${widget ? "lg:justify-start" : ""}`}>
              <a
                href={DISCORD_INVITE}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-md px-7 py-3 text-lg font-body font-semibold bg-gold-light text-bark-brown shadow-lg shadow-black/20 hover:brightness-110 transition"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
                  <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.4C.6 9 .1 13.6.4 18.1A19.9 19.9 0 0 0 6.4 21l1.3-2a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 11.6 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.4-5.2-.7-9.7-3.3-13.6ZM8.3 15.3c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Zm7.4 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Z" />
                </svg>
                Join Our Discord
              </a>
              <Link href="/members">
                <Button variant="secondary" size="lg">
                  View Members
                </Button>
              </Link>
            </div>
            {widget && (
              <details className="lg:hidden mt-6 group">
              <summary className="inline-flex items-center gap-2 cursor-pointer list-none text-parchment/90 hover:text-gold-light text-sm font-semibold">
                <span className="w-2 h-2 rounded-full bg-[#23a55a]" aria-hidden />
                See who&apos;s online in Discord
                <span className="transition-transform group-open:rotate-180" aria-hidden>
                  ▾
                </span>
              </summary>
              <DiscordWidget className="mt-4 mx-auto w-fit" height={420} />
              </details>
            )}
          </div>
          {widget && (
            <div className="hidden lg:block">
            <p className="flex items-center gap-2 text-sm font-semibold text-parchment/90 mb-2">
              <span className="w-2 h-2 rounded-full bg-[#23a55a]" aria-hidden />
              Live on our Discord
            </p>
              <DiscordWidget />
            </div>
          )}
        </div>
      </section>

      {/* Achievements Ticker */}
      <AchievementsTicker achievements={diverseAchievements as unknown as { playerId: number; name: string; metric: string; threshold: number; createdAt: Date; player?: { displayName: string } }[]} />

      {/* Quick Stats */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <h2 className="font-display text-3xl text-gnome-green text-center mb-10">
          Clan at a Glance
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Card className="text-center">
            <p className="font-stats text-4xl text-gold-display font-bold">
              {memberCount > 0 ? memberCount : "--"}
            </p>
            <p className="text-bark-brown mt-1">Total Members</p>
          </Card>
          <Card className="text-center">
            <p className="font-stats text-4xl text-gold-display font-bold">
              {totalExp > 0 ? formatNumber(totalExp) : "--"}
            </p>
            <p className="text-bark-brown mt-1">Combined Total XP</p>
          </Card>
          <Card className="text-center">
            <p className="font-stats text-4xl text-gold-display font-bold">
              {recentAchievementCount > 0 ? `${recentAchievementCount}+` : "--"}
            </p>
            <p className="text-bark-brown mt-1">Recent Achievements</p>
          </Card>
        </div>

        {/* Newsletter shoutout + active competition: 40/60 side by side when
            both exist; on its own the newsletter keeps its 40% width, centred. */}
        {(latestNewsletter || activeCompetitions.length > 0) && (
          <div className={`mt-6 grid grid-cols-1 gap-6 ${latestNewsletter && activeCompetitions.length > 0 ? "md:grid-cols-5" : ""}`}>
            {latestNewsletter && (
              <Card className={`flex gap-4 items-start ${activeCompetitions.length > 0 ? "md:col-span-2" : "md:w-2/5 md:mx-auto"}`}>
                <Link href={`/newsletter/${latestNewsletter.issue_number}`} className="shrink-0" aria-label={`Read Issue No. ${latestNewsletter.issue_number}`}>
                  {latestNewsletter.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={latestNewsletter.cover_url}
                      alt=""
                      className="w-20 sm:w-24 aspect-[3/4] object-cover object-top rounded border border-bark-brown-light/40 shadow bg-white"
                    />
                  ) : (
                    <div className="w-20 sm:w-24 aspect-[3/4] rounded bg-parchment-dark/60 flex items-center justify-center text-3xl">📰</div>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-iron-grey uppercase tracking-wide">Latest from {latestNewsletter.title}</p>
                  <h3 className="font-display text-lg text-bark-brown leading-tight">Issue No. {latestNewsletter.issue_number}</h3>
                  <p className="text-xs text-iron-grey">{formatIssueDate(latestNewsletter.published_on)}</p>
                  {latestNewsletter.headline && <p className="text-sm text-bark-brown-light mt-1 line-clamp-2">{latestNewsletter.headline}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm">
                    <Link href={`/newsletter/${latestNewsletter.issue_number}`} className="text-gnome-green font-semibold hover:underline">
                      Read the latest issue &rarr;
                    </Link>
                    <Link href="/newsletter#archive-heading" className="text-gnome-green hover:underline">
                      Past issues
                    </Link>
                  </div>
                </div>
              </Card>
            )}
            {activeCompetitions.length > 0 && (
            <Card className={latestNewsletter ? "md:col-span-3" : undefined}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-xs text-iron-grey uppercase tracking-wide">Active Competition</p>
                  <h3 className="font-display text-lg text-bark-brown">{activeCompetitions[0].title}</h3>
                </div>
                <Link href="/competitions" className="text-sm text-gnome-green hover:underline shrink-0">
                  View All Competitions &rarr;
                </Link>
              </div>
              {activeCompetitions[0].leaders.length > 0 ? (
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  {activeCompetitions[0].leaders.map((leader, i) => (
                    <span key={leader.displayName} className="text-sm text-bark-brown">
                      <span className="text-iron-grey">{i + 1}.</span>{" "}
                      <span className="font-mono">{leader.displayName}</span>{" "}
                      <span className="font-stats text-gnome-green">+{formatNumber(leader.gained)}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-iron-grey">No participants yet.</p>
              )}
            </Card>
            )}
          </div>
        )}
      </section>

      {/* Upcoming Events Preview */}
      <section className="bg-parchment-dark py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="font-display text-3xl text-gnome-green text-center mb-10">
            Upcoming Events
          </h2>
          {upcomingEvents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {upcomingEvents.map((event) => {
                const eventType = EVENT_TYPES.find((t) => t.key === event.event_type);
                const startDate = new Date(event.start_time);
                return (
                  <Card key={event.id} className="relative overflow-hidden h-full">
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1"
                      style={{ backgroundColor: eventType?.color ?? "#6B6B6B" }}
                    />
                    <div className="pl-4 flex flex-col h-full">
                      <p className="text-xs text-iron-grey uppercase tracking-wide mb-1">
                        {event.happeningNow && (
                          <span className="inline-block mr-2 px-1.5 py-0.5 rounded bg-red-accent text-white font-semibold normal-case tracking-normal">
                            Happening now
                          </span>
                        )}
                        {startDate.toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          timeZone: CLAN_TIMEZONE,
                        })}
                        {" · "}
                        {startDate.toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                          timeZoneName: "short",
                          timeZone: CLAN_TIMEZONE,
                        })}
                      </p>
                      <h3 className="font-display text-lg text-bark-brown mb-1">
                        {/* Stretched link: the whole card opens the event's details. */}
                        <Link href={`/events?event=${event.id}`} className="after:absolute after:inset-0 hover:text-gnome-green">
                          {event.title}
                        </Link>
                      </h3>
                      <div className="text-sm text-iron-grey space-y-0.5">
                        {event.host_rsn && (
                          <p>Host: <span className="font-mono">{event.host_rsn}</span></p>
                        )}
                        {event.world && <p>World {event.world}</p>}
                      </div>
                      <div className="relative z-10 mt-auto pt-4 flex items-center gap-3">
                        <Link href={`/events/${event.id}/signup`}>
                          <Button size="sm">Check In</Button>
                        </Link>
                        <Link href={`/events?event=${event.id}`} className="text-xs text-gnome-green hover:underline">
                          More info →
                        </Link>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-iron-grey py-8">
              <p className="font-display text-xl mb-2">No upcoming events</p>
              <p className="text-sm">Check our Discord for the latest event announcements.</p>
            </div>
          )}
          <div className="text-center mt-8">
            <Link href="/events">
              <Button variant="ghost">View All Events</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* What Our Members Say */}
      {featuredTestimonials.length > 0 && (
        <section className="py-16">
          <TestimonialsSection testimonials={featuredTestimonials} viewAllHref="/testimonials" />
        </section>
      )}

      {/* Join Us CTA */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <Card className="text-center py-12 px-6" hover={false}>
          <h2 className="font-display text-3xl text-gnome-green mb-4">
            Ready to Join?
          </h2>
          <p className="text-bark-brown-light mb-6 max-w-xl mx-auto">
            Whether you&apos;re a seasoned veteran or just getting started in
            Gielinor, there&apos;s a place for you in {CLAN_NAME}. Join our clan
            chat and say hello!
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <div className="text-center">
              <p className="text-sm text-iron-grey mb-1">In-Game Clan Chat</p>
              <p className="font-mono text-lg text-gnome-green font-bold">
                {CLAN_CHAT}
              </p>
            </div>
            <span className="hidden sm:inline text-parchment-dark text-2xl">
              |
            </span>
            <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer">
              <Button>Join Discord</Button>
            </a>
          </div>
        </Card>
      </section>

      {/* Latest News */}
      <section className="bg-parchment-dark py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="font-display text-3xl text-gnome-green text-center mb-10">
            Latest News
          </h2>
          <div className="max-w-2xl mx-auto space-y-4">
            {announcements.length > 0 ? (
              <NewsList items={announcements} names={{ ...discordNames, users: mentionNames }} />
            ) : (
              <Card>
                <p className="text-xs text-iron-grey mb-1">Announcement</p>
                <h3 className="font-display text-lg text-bark-brown">
                  Welcome to the Gn0me Home Website!
                </h3>
                <p className="text-sm text-bark-brown-light mt-2">
                  Your home for guides, event calendars, member profiles,
                  and more. Check back for news and updates.
                </p>
              </Card>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
