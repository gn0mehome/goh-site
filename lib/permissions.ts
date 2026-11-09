import { RANKS, rankKeyFor } from "./constants";

// All available permissions in the system
export const PERMISSIONS = {
  manage_events: {
    key: "manage_events",
    label: "Manage Events",
    description: "Create, edit, and delete clan events",
  },
  manage_guides: {
    key: "manage_guides",
    label: "Manage Guides",
    description: "Create and edit guide content",
  },
  manage_rsn_links: {
    key: "manage_rsn_links",
    label: "Manage RSN Links",
    description: "Approve/deny RSN reset requests and force-unlink RSNs",
  },
  manage_permissions: {
    key: "manage_permissions",
    label: "Manage Permissions",
    description: "Change role-based permission settings",
  },
  manage_commands: {
    key: "manage_commands",
    label: "Manage Commands",
    description: "Create, edit, and delete custom bot commands",
  },
  manage_templates: {
    key: "manage_templates",
    label: "Manage Post Templates",
    description: "Create and edit Discord post templates and section presets",
  },
  sync_discord_posts: {
    key: "sync_discord_posts",
    label: "Update Posted Discord Messages",
    description: "Push edits to announcements, event posts, signup threads, and event recaps that have already been posted to Discord",
  },
  manage_staff_applications: {
    key: "manage_staff_applications",
    label: "Review Staff Applications",
    description: "Review and decide on member applications for staff roles",
  },
  manage_polls: {
    key: "manage_polls",
    label: "Create & Manage Polls",
    description: "Create Discord polls for clan votes and view results",
  },
  manage_settings: {
    key: "manage_settings",
    label: "Manage Alert Channel Settings",
    description: "Configure which Discord channel each feature posts notifications to",
  },
  manage_surveys: {
    key: "manage_surveys",
    label: "Manage Surveys",
    description: "Create surveys and view responses",
  },
  manage_feedback: {
    key: "manage_feedback",
    label: "Manage Feedback",
    description: "Review and triage submitted feedback",
  },
  manage_competitions: {
    key: "manage_competitions",
    label: "Manage WOM Competitions",
    description: "Create and delete Wise Old Man competitions",
  },
  manage_availability: {
    key: "manage_availability",
    label: "Manage Availability Polls",
    description: "Create scheduling polls and review submitted availability",
  },
  manage_member_profiles: {
    key: "manage_member_profiles",
    label: "Moderate Gn0meBook Profiles",
    description: "Hide member profile pages that need to come down",
  },
  manage_banned_ips: {
    key: "manage_banned_ips",
    label: "Manage Banned IPs",
    description: "Block IP addresses from submitting to public forms like surveys",
  },
  manage_handbook: {
    key: "manage_handbook",
    label: "Manage Staff Handbook",
    description: "Upload and publish Staff Handbook editions",
  },
  manage_payouts: {
    key: "manage_payouts",
    label: "Manage Prize Payouts",
    description: "Track and mark competition/raffle/giveaway winners as paid",
  },
  manage_loans: {
    key: "manage_loans",
    label: "Manage Loan Board",
    description: "View every loan request, force-close disputes, and oversee the clan loan board",
  },
  manage_gnomie_reviews: {
    key: "manage_gnomie_reviews",
    label: "Gn0mie Shoutout Submissions",
    description: "Approve or reject public shoutouts about clan members before they post to Discord",
  },
  manage_testimonials: {
    key: "manage_testimonials",
    label: "Manage Testimonials",
    description: "Approve or reject public clan testimonials, and pick which ones are featured",
  },
  manage_newsletter: {
    key: "manage_newsletter",
    label: "Manage Newsletter",
    description: "Upload, publish and edit issues of The Weekly Glider newsletter",
  },
  manage_clan_pages: {
    key: "manage_clan_pages",
    label: "Manage Rank Structure & Clan Rules",
    description: "Upload the Rank Structure and Clan Rules pages shown under the Clan menu",
  },
  manage_sections: {
    key: "manage_sections",
    label: "Manage Section Visibility",
    description: "Toggle which site sections are staff-only",
  },
  manage_bingo: {
    key: "manage_bingo",
    label: "Manage Bingo Events",
    description: "Create bingo boards, assign teams, and review manual tile submissions",
  },
  manage_quests: {
    key: "manage_quests",
    label: "Manage Quest Events",
    description: "Create quest events, manage participants and teams, and review quest screenshots",
  },
  manage_art: {
    key: "manage_art",
    label: "Manage Art Contests",
    description: "Run art contests, review submitted artwork, moderate comments and manage the gallery",
  },
  manage_points: {
    key: "manage_points",
    label: "Manage Clan Points",
    description: "Configure how many points each plugin-reported event is worth",
  },
  manage_plugin_settings: {
    key: "manage_plugin_settings",
    label: "Configure RuneLite Plugin",
    description: "Set the clan name and colour theme every member's companion plugin uses",
  },
  edit_bot_posts: {
    key: "edit_bot_posts",
    label: "Edit Bot Posts",
    description: "Fix the text of messages the bot has posted to Discord",
  },
  view_admin: {
    key: "view_admin",
    label: "View Admin Panel",
    description: "Access the admin dashboard",
  },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

// All assignable roles (matching RANKS from constants, using the display
// keys) plus a synthetic "Guest" role -- order -1, always first -- covering
// anyone with no clan rank at all: never logged in, or logged in without a
// linked/verified RSN. Both the Permissions grid and the Section Visibility
// grid iterate this same list, so adding it here surfaces it in both.
export const ASSIGNABLE_ROLES = [
  { key: "guest", name: "Guest / Not Registered", order: -1 },
  ...RANKS.map((r) => ({
    key: r.key,
    name: r.name,
    order: r.order,
  })),
];

/**
 * Normalize a WOM role name to our internal role key: owner -> gold_key,
 * deputy_owner -> silver_key, summoner -> council (see ROLE_ALIASES in
 * lib/constants.ts); everything else (yew, pine, oak, gnome_child) as is.
 */
export function normalizeRole(womRole: string): string {
  return rankKeyFor(womRole);
}

/**
 * Check if a role has a specific permission, given the permissions map.
 */
export function hasPermission(
  rolePermissions: { role: string; permission: string; granted: boolean }[],
  userRole: string | null,
  permission: PermissionKey
): boolean {
  if (!userRole) return false;
  const normalizedRole = normalizeRole(userRole);

  const entry = rolePermissions.find(
    (rp) => rp.role === normalizedRole && rp.permission === permission
  );

  return entry?.granted ?? false;
}
