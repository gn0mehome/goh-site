import type { PermissionKey } from "@/lib/permissions";
import type { PendingKey } from "@/lib/admin-pending";

export interface AdminNavItem {
  href: string;
  label: string;
  /** Sidebar group heading; omitted for links shown on their own at the top (Dashboard). */
  group?: string;
  /** Shown if the caller has any of these. */
  permission: PermissionKey | PermissionKey[];
  /** Other pages that count as "in" this item for highlighting (tabs, per-item sub-pages reached from it). */
  alsoActiveOn?: string[];
  /** Pending-count badge (see lib/admin-pending.ts). */
  badge?: PendingKey;
}

// The admin sidebar, in display order. Each section's own layout.tsx
// (AdminGate) enforces the page's permission; this only decides what's listed.
export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", permission: "view_admin", alsoActiveOn: ["/admin/activity", "/admin/competition-insights"] },

  { href: "/admin/events", label: "Events", group: "Events", permission: "manage_events", alsoActiveOn: ["/admin/event-recap"] },
  { href: "/admin/series-updates", label: "Series Updates", group: "Events", permission: "manage_events" },
  { href: "/admin/availability", label: "Availability Polls", group: "Events", permission: "manage_availability" },
  { href: "/admin/ingame-events", label: "In-Game Clan Panel", group: "Events", permission: "manage_events" },

  { href: "/admin/announcements", label: "Announcements", group: "Discord Posts", permission: "manage_events" },
  { href: "/admin/polls", label: "Polls", group: "Discord Posts", permission: "manage_polls" },
  { href: "/admin/surveys", label: "Surveys", group: "Discord Posts", permission: "manage_surveys" },

  { href: "/admin/wom-competitions", label: "WOM Competitions", group: "Competitions", permission: "manage_competitions" },
  { href: "/admin/weekly-competition", label: "Weekly SOTW/BotW", group: "Competitions", permission: "manage_competitions" },
  { href: "/admin/bingo", label: "Bingo", group: "Competitions", permission: "manage_bingo" },
  { href: "/admin/quests", label: "Quest Events", group: "Competitions", permission: "manage_quests" },
  { href: "/admin/art", label: "Art Contests", group: "Competitions", permission: "manage_art", badge: "art_entries" },
  { href: "/admin/payouts", label: "Prize Payouts", group: "Competitions", permission: "manage_payouts", badge: "unpaid_payouts" },
  { href: "/admin/raffles", label: "Raffles", group: "Competitions", permission: "manage_payouts" },

  { href: "/admin/feedback", label: "Feedback", group: "Review Queue", permission: "manage_feedback", badge: "feedback" },
  { href: "/admin/staff-applications", label: "Staff Applications", group: "Review Queue", permission: "manage_staff_applications", badge: "staff_applications" },
  { href: "/admin/gnomie-reviews", label: "Gn0mie Shoutouts", group: "Review Queue", permission: "manage_gnomie_reviews", badge: "gnomie_reviews" },
  { href: "/admin/testimonials", label: "Testimonials", group: "Review Queue", permission: "manage_testimonials", badge: "testimonials" },
  { href: "/admin/rsn-links", label: "RSN Links", group: "Review Queue", permission: "manage_rsn_links", badge: "rsn_requests" },
  { href: "/admin/bingo/submissions", label: "Bingo Submissions", group: "Review Queue", permission: "manage_bingo", badge: "bingo_submissions" },
  { href: "/admin/quests/submissions", label: "Quest Screenshots", group: "Review Queue", permission: "manage_quests", badge: "quest_submissions" },

  { href: "/admin/gn0mebook", label: "Gn0meBook Profiles", group: "Members", permission: "manage_member_profiles" },
  { href: "/admin/profiles-beta", label: "Member Profiles (Beta)", group: "Members", permission: "manage_member_profiles" },
  { href: "/admin/default-outfit", label: "Default Clan Outfit", group: "Members", permission: "manage_member_profiles" },
  { href: "/admin/loans", label: "Loans", group: "Members", permission: "manage_loans" },

  { href: "/admin/newsletter", label: "Newsletter", group: "Content", permission: "manage_newsletter" },
  { href: "/admin/clan-pages", label: "Rank Structure & Rules", group: "Content", permission: "manage_clan_pages" },
  { href: "/admin/templates", label: "Post Templates", group: "Content", permission: "manage_templates" },
  { href: "/admin/handbook", label: "Staff Handbook", group: "Content", permission: "manage_handbook" },
  { href: "/admin/commands", label: "Bot Commands", group: "Content", permission: "manage_commands" },

  { href: "/admin/alert-channels", label: "Discord Channels", group: "Settings", permission: "manage_settings" },
  { href: "/admin/voice-rooms", label: "Voice Rooms", group: "Settings", permission: "manage_settings" },
  { href: "/admin/clan-feed", label: "Clan Feed (DropTracker)", group: "Settings", permission: "manage_settings" },
  { href: "/admin/rank-labels", label: "Rank Labels", group: "Settings", permission: "manage_settings" },
  { href: "/admin/prize-defaults", label: "Prize & DM Defaults", group: "Settings", permission: "manage_payouts" },
  { href: "/admin/permissions", label: "Roles & Access", group: "Settings", permission: ["manage_permissions", "manage_sections"], alsoActiveOn: ["/admin/sections"] },
  { href: "/admin/banned-ips", label: "Banned IPs", group: "Settings", permission: "manage_banned_ips" },
];

/**
 * The nav item a pathname belongs to: the longest href (or alsoActiveOn
 * path) that equals it or is a parent of it -- so /admin/events/123/edit
 * highlights Events, /admin/bingo/submissions highlights Bingo Submissions
 * rather than Bingo, and /admin itself only matches Dashboard exactly.
 */
export function activeNavHref(pathname: string, items: Pick<AdminNavItem, "href" | "alsoActiveOn">[]): string | null {
  let best: { href: string; length: number } | null = null;
  for (const item of items) {
    for (const path of [item.href, ...(item.alsoActiveOn ?? [])]) {
      const matches = path === "/admin" ? pathname === "/admin" : pathname === path || pathname.startsWith(`${path}/`);
      if (matches && (!best || path.length > best.length)) best = { href: item.href, length: path.length };
    }
  }
  return best?.href ?? null;
}
