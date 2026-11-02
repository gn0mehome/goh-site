import { redirect } from "next/navigation";

// Clan Points is switched off for now (its links are gone from the menu,
// Contests and the admin sidebar). The points data and the plugin
// endpoints are untouched; to bring the leaderboard back, restore this page
// from git history (it read lib/clan-points.ts) and its links.
export default function PointsPage() {
  redirect("/contests");
}
