import { getGroupCompetitions, getCompetitionLeaders, type CompetitionLeader } from "@/lib/wom";
import { Card } from "@/components/ui/Card";
import { formatNumber } from "@/lib/utils";
import { checkSectionAccess } from "@/lib/section-gate";
import { SectionUnavailable } from "@/components/layout/SectionUnavailable";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "WOM Competitions",
  description: "Skill & Boss of the Week and other Gn0me Home competitions tracked on Wise Old Man: live, upcoming and past.",
};

export const dynamic = "force-dynamic"; // gated per-viewer now, can't be statically cached

export default async function CompetitionsPage() {
  if (!(await checkSectionAccess("competitions"))) return <SectionUnavailable />;

  const [competitions, showContests] = await Promise.all([getGroupCompetitions(), checkSectionAccess("activities")]);

  const now = new Date();
  const active = competitions.filter(
    (c) => new Date(c.startsAt) <= now && new Date(c.endsAt) >= now
  );
  const upcoming = competitions.filter(
    (c) => new Date(c.startsAt) > now
  );
  const past = competitions
    .filter((c) => new Date(c.endsAt) < now)
    .slice(0, 10);

  // Leaders/winners for anything that's actually had participants -- not upcoming.
  const withLeaders = [...active, ...past];
  const leaderEntries = await Promise.all(
    withLeaders.map(async (c) => [c.id, await getCompetitionLeaders(c.id, 3)] as const)
  );
  const leadersByCompetition = new Map<number, CompetitionLeader[]>(leaderEntries);

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="font-display text-4xl text-gnome-green mb-2">
        WOM Competitions
      </h1>
      <p className="text-bark-brown-light mb-10">
        Skill &amp; Boss of the Week and other clan competitions, tracked automatically on{" "}
        <a
          href="https://wiseoldman.net/groups/24582/competitions"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gnome-green hover:text-gnome-green-light underline"
        >
          Wise Old Man
        </a>
        . Your gains count as soon as WOM updates you.
        {showContests && (
          <>
            {" "}
            Looking for bingos, quest races or art contests? They&apos;re on{" "}
            <Link href="/contests" className="text-gnome-green hover:text-gnome-green-light underline">
              Contests
            </Link>
            .
          </>
        )}
      </p>

      {/* Active Competitions */}
      {active.length > 0 && (
        <section className="mb-12">
          <h2 className="font-display text-2xl text-gnome-green mb-4">
            Active Now
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {active.map((comp) => (
              <CompetitionCard key={comp.id} comp={comp} status="active" leaders={leadersByCompetition.get(comp.id)} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section className="mb-12">
          <h2 className="font-display text-2xl text-gnome-green mb-4">
            Upcoming
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcoming.map((comp) => (
              <CompetitionCard key={comp.id} comp={comp} status="upcoming" />
            ))}
          </div>
        </section>
      )}

      {/* Past */}
      <section>
        <h2 className="font-display text-2xl text-gnome-green mb-4">
          Past Competitions
        </h2>
        {past.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {past.map((comp) => (
              <CompetitionCard key={comp.id} comp={comp} status="past" leaders={leadersByCompetition.get(comp.id)} />
            ))}
          </div>
        ) : (
          <p className="text-iron-grey">No past competitions found.</p>
        )}
      </section>
    </div>
  );
}

function CompetitionCard({
  comp,
  status,
  leaders,
}: {
  comp: { id: number; title: string; metric: string; type: string; startsAt: Date; endsAt: Date };
  status: "active" | "upcoming" | "past";
  leaders?: CompetitionLeader[];
}) {
  const statusColors = {
    active: "bg-gnome-green text-text-light",
    upcoming: "bg-gold text-bark-brown",
    past: "bg-iron-grey text-text-light",
  };

  const start = new Date(comp.startsAt);
  const end = new Date(comp.endsAt);

  return (
    <a
      href={`https://wiseoldman.net/competitions/${comp.id}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <Card className="h-full">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-lg text-bark-brown truncate">
            {comp.title}
          </h3>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 ml-2 ${statusColors[status]}`}>
            {status === "active" ? "Live" : status === "upcoming" ? "Upcoming" : "Ended"}
          </span>
        </div>
        <div className="text-sm text-bark-brown-light space-y-1">
          <p>
            <span className="text-iron-grey">Metric: </span>
            <span className="capitalize">{comp.metric.replace(/_/g, " ")}</span>
          </p>
          <p>
            <span className="text-iron-grey">Type: </span>
            <span className="capitalize">{comp.type}</span>
          </p>
          <p>
            <span className="text-iron-grey">Period: </span>
            {start.toLocaleDateString()} — {end.toLocaleDateString()}
          </p>
        </div>

        {leaders && leaders.length > 0 && (
          <div className="mt-3 pt-3 border-t border-parchment-dark">
            <p className="text-xs text-iron-grey uppercase tracking-wide mb-1.5">
              {status === "past" ? "🏆 Winner" : "Currently Leading"}
            </p>
            <ul className="text-sm text-bark-brown space-y-0.5">
              {(status === "past" ? leaders.slice(0, 1) : leaders).map((leader, i) => (
                <li key={leader.displayName} className="flex items-center justify-between gap-2">
                  <span className="font-mono truncate">
                    {status !== "past" && <span className="text-iron-grey mr-1">{i + 1}.</span>}
                    {leader.displayName}
                  </span>
                  <span className="font-stats text-gnome-green shrink-0">+{formatNumber(leader.gained)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <span className="text-sm text-gnome-green font-semibold mt-3 inline-block">
          View on WOM &rarr;
        </span>
      </Card>
    </a>
  );
}
