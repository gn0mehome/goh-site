import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminAccess, hasPermission } from "@/lib/check-permission";
import type { PermissionKey } from "@/lib/permissions";
import { ADMIN_NAV } from "@/lib/admin-nav";
import { getPendingCounts } from "@/lib/admin-pending";
import type { Metadata } from "next";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export const metadata: Metadata = {
  title: "Admin Panel",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getAdminAccess();
  const { user } = access;
  const allowed = hasPermission(access, "view_admin");

  if (!user && allowed) {
    // Supabase not configured — dev mode
    return (
      <div className="min-h-[80vh]">
        <div data-print-hide className="bg-gold/20 border-b border-gold px-4 py-2 text-center text-sm text-bark-brown">
          Admin panel — Supabase not configured. Auth enforcement disabled for development.
        </div>
        <div className="mx-auto px-4 lg:px-8 py-6">
          <AdminSidebar navItems={ADMIN_NAV.map(({ href, label, group, alsoActiveOn }) => ({ href, label, group, alsoActiveOn, badgeCount: 0 }))}>{children}</AdminSidebar>
        </div>
      </div>
    );
  }

  if (!user) {
    redirect("/login?redirect=/admin");
  }

  if (!allowed) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
        <h1 className="font-display text-4xl text-gold-display mb-4">Access Denied</h1>
        <p className="text-bark-brown-light mb-2">
          You don&apos;t have permission to access the admin panel.
        </p>
        <p className="text-sm text-iron-grey">
          {user.clan_rank
            ? `Your rank (${user.clan_rank}) doesn't have "View Admin Panel" permission.`
            : "Link your RSN on the Account page to get your clan rank detected."}
        </p>
        <Link href="/account" className="mt-6 text-gnome-green hover:text-gnome-green-light underline">
          Go to Account Page
        </Link>
      </div>
    );
  }

  // Filter nav to only show items the user has permission for. Each
  // section's own layout.tsx (AdminGate) enforces the same permission on the
  // page itself.
  const can = (permission: PermissionKey) => hasPermission(access, permission);
  const pending = await getPendingCounts(can);
  const visibleNav = ADMIN_NAV.filter((item) => (Array.isArray(item.permission) ? item.permission.some(can) : can(item.permission))).map(
    ({ href, label, group, alsoActiveOn, badge }) => ({ href, label, group, alsoActiveOn, badgeCount: badge ? pending[badge] ?? 0 : 0 })
  );

  return (
    <div className="min-h-[80vh]">
      <div className="bg-gnome-green/10 border-b border-gnome-green/30 px-4 py-2 text-center text-sm text-gnome-green">
        Logged in as <span className="font-semibold">{user.discord_username}</span>
        {user.clan_rank && (
          <span className="text-iron-grey ml-2">
            ({user.clan_rank.replace(/_/g, " ")})
          </span>
        )}
      </div>
      <div className="mx-auto px-4 lg:px-8 py-6">
        <AdminSidebar navItems={visibleNav}>{children}</AdminSidebar>
      </div>
    </div>
  );
}
