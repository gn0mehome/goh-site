import { NextRequest, NextResponse } from "next/server";
import { metricsOf } from "@/lib/competition-metrics";
import { createClient } from "@supabase/supabase-js";
import { verifyPluginToken } from "@/lib/plugin-auth";
import { hasPermission } from "@/lib/permissions";
import { getPointsBalance } from "@/lib/clan-points";
import { payoutLabel, type PayoutSourceRow } from "@/lib/payouts";
import { getPluginBranding } from "@/lib/plugin-settings";
import { getCompetitionStandings, classifyMetric, normalizeRsn as normalizeWomRsn } from "@/lib/wom";
import { linkedRsns } from "@/lib/rank-resolution";
import { pluginPlainText, pluginPlainTextOrNull } from "@/lib/plugin-text";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function normalizeRsn(s: string): string {
  return s.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

interface PayoutRow extends PayoutSourceRow {
  id: string;
  recipient_rsn: string;
  prize: string;
}

/**
 * GET /api/plugin/reminders -- single combined digest endpoint for the
 * RuneLite companion plugin (bearer-token auth via verifyPluginToken, never
 * cookie session -- this is a game-client caller, not a browser).
 */
export async function GET(request: NextRequest) {
  const identity = await verifyPluginToken(request);
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const now = new Date();
  const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data: upcomingEvents } = await supabase
    .from("events")
    .select("id, title, start_time, world, meet_location, location, description, requirements, prize_pool, host_rsn, check_in_code")
    .eq("show_on_calendar", true)
    .gte("start_time", now.toISOString())
    .lte("start_time", weekOut.toISOString())
    .order("start_time", { ascending: true });

  const eventIds = (upcomingEvents ?? []).map((e) => e.id);
  const signedUpEventIds = new Set<string>();
  if (eventIds.length > 0) {
    const { data: attendance } = await supabase
      .from("event_attendance")
      .select("event_id")
      .eq("discord_id", identity.discordId)
      .eq("signed_up", true)
      .in("event_id", eventIds);
    for (const row of attendance ?? []) signedUpEventIds.add(row.event_id);
  }

  const events = (upcomingEvents ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    startTime: e.start_time,
    world: e.world,
    meetLocation: e.meet_location ?? e.location ?? null,
    signedUp: signedUpEventIds.has(e.id),
    description: e.description ?? null,
    requirements: e.requirements ?? null,
    prizePool: e.prize_pool ?? null,
    hostRsn: e.host_rsn ?? null,
    // Never expose the actual code -- only whether one is required, so
    // check-in still needs the real word (announced separately), not
    // whatever the digest response happens to leak.
    requiresCode: !!e.check_in_code?.trim(),
  }));

  let myPendingPrizes: { prize: string; competition: string }[] = [];
  if (identity.rsnVerified && identity.rsn) {
    const { data: payouts } = await supabase
      .from("prize_payouts")
      .select("id, recipient_rsn, prize, source_detail, wom_competitions(title), events(title), raffles(title)")
      .eq("is_paid", false);

    const normalized = normalizeRsn(identity.rsn);
    const typedPayouts = (payouts ?? []) as unknown as PayoutRow[];
    myPendingPrizes = typedPayouts
      .filter((p) => normalizeRsn(p.recipient_rsn) === normalized)
      .map((p) => ({ prize: p.prize, competition: payoutLabel(p) }));
  }

  let admin: {
    unpaidPayoutsCount: number;
    unpaidPayoutsTotal: string;
    pendingGnomieReviews: number;
    pendingTestimonials: number;
  } | null = null;

  const { data: payoutPerms } = await supabase
    .from("role_permissions")
    .select("role, permission, granted")
    .eq("permission", "manage_payouts");

  if (hasPermission(payoutPerms ?? [], identity.clanRank, "manage_payouts")) {
    const { data: unpaidPayouts } = await supabase
      .from("prize_payouts")
      .select("prize")
      .eq("is_paid", false);

    const { count: pendingGnomieReviews } = await supabase
      .from("gnomie_reviews")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    const { count: pendingTestimonials } = await supabase
      .from("testimonials")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    admin = {
      unpaidPayoutsCount: unpaidPayouts?.length ?? 0,
      // Prizes are free text (e.g. "6,500,000 GP", "Bond"), not a numeric
      // column -- summing them isn't meaningful, so this is a count-based
      // label instead of a real GP total.
      unpaidPayoutsTotal: `${unpaidPayouts?.length ?? 0} unpaid`,
      pendingGnomieReviews: pendingGnomieReviews ?? 0,
      pendingTestimonials: pendingTestimonials ?? 0,
    };
  }

  const points = await getPointsBalance(supabase, identity.userId);

  // Clan-wide plugin branding (name + theme) rides along with every poll so
  // the plugin needs nothing compiled in -- see lib/plugin-settings.ts.
  // canConfigure tells the plugin whether to offer this member the setup
  // card; the actual save is gated again server-side in
  // /api/plugin/admin/settings, this is only for the UI.
  const [branding, settingsPerms] = await Promise.all([
    getPluginBranding(supabase),
    supabase.from("role_permissions").select("role, permission, granted").eq("permission", "manage_plugin_settings"),
  ]);
  const canConfigure = hasPermission(settingsPerms.data ?? [], identity.clanRank, "manage_plugin_settings");

  // Recent published announcements -- pinned first, then newest. Content is
  // trimmed to a snippet: the panel is a glance view, the site has the rest.
  const { data: announcementRows } = await supabase
    .from("announcements")
    .select("id, title, content, pinned, created_at")
    .eq("published", true)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(3);
  // Everything the plugin shows is scrubbed of Discord formatting and emoji
  // (see lib/plugin-text.ts) -- announcements here, events/prizes/
  // competitions just before the response below.
  const announcements = (announcementRows ?? []).map((a) => {
    const plain = pluginPlainText(a.content);
    return {
      id: a.id,
      title: pluginPlainText(a.title) || a.title,
      snippet: plain.length > 160 ? `${plain.slice(0, 157)}...` : plain,
      pinned: a.pinned,
      createdAt: a.created_at,
    };
  });

  // Live SOTW/BOTW: the clan's own active competitions, with the paying
  // places (top 10) plus this member's own placement (matched against their
  // main RSN and any linked alts) so they always see where they stand even
  // outside them. Standings are cached in lib/wom.ts -- every member polls.
  const nowIso = now.toISOString();
  const { data: activeComps } = await supabase
    .from("wom_competitions")
    .select("wom_id, title, metric, metrics, type, ends_at")
    .lte("starts_at", nowIso)
    .gte("ends_at", nowIso)
    .order("ends_at", { ascending: true })
    .limit(2);
  const myRsns = new Set((await linkedRsns(supabase, identity.userId, identity.rsn)).map(normalizeWomRsn));
  // Placements pay out to 10th, so the board shows every paying spot.
  const TOP_N = 10;
  const competitions = await Promise.all(
    (activeComps ?? []).map(async (c) => {
      const standings = await getCompetitionStandings(c.wom_id);
      const mine = standings.find((s) => myRsns.has(normalizeWomRsn(s.displayName))) ?? null;
      const metricKind = classifyMetric(c.metric);
      return {
        womId: c.wom_id,
        title: c.title,
        metric: c.metric,
        // Every skill/boss when it tracks more than one (WOM ranks by the combined total).
        metrics: metricsOf(c),
        kind: metricKind === "skill" ? "sotw" : metricKind === "boss" ? "botw" : "other",
        endsAt: c.ends_at,
        participantCount: standings.length,
        standings: standings.slice(0, TOP_N).map((s) => ({
          rank: s.rank,
          rsn: s.displayName,
          gained: s.gained,
          isMe: myRsns.has(normalizeWomRsn(s.displayName)),
        })),
        myPlacement: mine ? { rank: mine.rank, rsn: mine.displayName, gained: mine.gained } : null,
      };
    })
  );

  return NextResponse.json({
    member: { rsn: identity.rsn, clanRank: identity.clanRank, points },
    events: events.map((e) => ({
      ...e,
      title: pluginPlainText(e.title) || e.title,
      description: pluginPlainTextOrNull(e.description),
      requirements: pluginPlainTextOrNull(e.requirements),
      prizePool: pluginPlainTextOrNull(e.prizePool),
      hostRsn: pluginPlainTextOrNull(e.hostRsn),
      meetLocation: pluginPlainTextOrNull(e.meetLocation),
    })),
    myPendingPrizes: myPendingPrizes.map((p) => ({
      ...p,
      prize: pluginPlainText(p.prize) || p.prize,
      competition: pluginPlainText(p.competition) || p.competition,
    })),
    admin,
    branding: { ...branding, canConfigure },
    announcements,
    competitions: competitions.map((c) => ({ ...c, title: pluginPlainText(c.title) || c.title })),
  });
}
