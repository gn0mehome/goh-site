"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { CLAN_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";
import { WhatsNewMenuLink } from "@/components/whats-new/WhatsNewMenuLink";
import { NavDropdown } from "./NavDropdown";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { SiteSectionKey } from "@/lib/site-sections";
import type { User } from "@supabase/supabase-js";

interface SubNavItem {
  href: string;
  label: string;
  // Which registered section (see lib/site-sections.ts + /admin/sections)
  // gates this item. Filtered client-side against the current viewer's
  // hidden-key set purely as a UI convenience -- the real access check
  // still lives server-side on each page.
  sectionKey: SiteSectionKey;
}

type NavItem =
  | { type: "link"; href: string; label: string; sectionKey: SiteSectionKey }
  | { type: "dropdown"; label: string; items: SubNavItem[] };

const NAV_ITEMS: NavItem[] = [
  { type: "link", href: "/", label: "Home", sectionKey: "home" },
  {
    type: "dropdown",
    label: "Events",
    items: [
      { href: "/events", label: "Calendar", sectionKey: "events" },
      { href: "/contests", label: "Contests", sectionKey: "activities" },
      { href: "/bingo", label: "Bingo", sectionKey: "bingo" },
      { href: "/competitions", label: "WOM Competitions", sectionKey: "competitions" },
      { href: "/hiscores", label: "Hiscores", sectionKey: "hiscores" },
      { href: "/leaderboard", label: "Attendance Leaderboard", sectionKey: "leaderboard" },
    ],
  },
  {
    type: "dropdown",
    label: "Members",
    items: [
      { href: "/gn0mebook", label: "Gn0meBook", sectionKey: "gn0mebook" },
      { href: "/members", label: "Member List", sectionKey: "members_list" },
      { href: "/gallery", label: "Gn0mie Gallery", sectionKey: "gallery" },
      { href: "/gnomie-shoutouts", label: "Submit Gn0mie Shoutouts", sectionKey: "gnomie_reviews" },
      { href: "/staff-handbook", label: "Staff Handbook", sectionKey: "staff_handbook" },
    ],
  },
  {
    type: "dropdown",
    label: "Guides",
    items: [
      { href: "/guides", label: "Guides", sectionKey: "guides" },
      { href: "/tools", label: "Tools", sectionKey: "tools" },
    ],
  },
  {
    type: "dropdown",
    label: "Feedback",
    items: [
      { href: "/feedback", label: "Submit Feedback", sectionKey: "feedback" },
      { href: "/surveys", label: "Surveys", sectionKey: "surveys" },
      { href: "/availability", label: "Availability", sectionKey: "availability" },
      { href: "/testimonials", label: "Testimonials", sectionKey: "testimonials" },
    ],
  },
  {
    type: "dropdown",
    label: "Bank",
    items: [
      { href: "/loans", label: "Browse Loans", sectionKey: "bank" },
      { href: "/loans/apply", label: "Request a Loan", sectionKey: "bank" },
    ],
  },
  {
    type: "dropdown",
    label: "Clan",
    items: [
      { href: "/newsletter", label: "Newsletter", sectionKey: "newsletter" },
      { href: "/rank-structure", label: "Rank Structure", sectionKey: "rank_structure" },
      { href: "/clan-rules", label: "Clan Rules", sectionKey: "clan_rules" },
      { href: "/about", label: "About", sectionKey: "about" },
    ],
  },
];

interface NavbarProps {
  /** Resolved server-side (see app/layout.tsx) so the very first paint already has the right links hidden -- no flash of a hidden section's link before a client fetch catches up. */
  initialHiddenKeys: string[];
}

export function Navbar({ initialHiddenKeys }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  // Separate accordion state for the mobile panel's dropdown groups -- only
  // one open at a time, so the list stays short instead of every group's
  // items being visible (and the whole menu needing to scroll) at once.
  const [mobileOpenGroup, setMobileOpenGroup] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  // Resolved fresh server-side on every request (app/layout.tsx is now
  // dynamic specifically so this can never be stale) -- no client-side
  // re-fetch needed here, that would just redo the exact same work this
  // request's SSR already did.
  const [hiddenKeys] = useState<Set<string>>(() => new Set(initialHiddenKeys));
  const [avatarFailed, setAvatarFailed] = useState(false);

  const visibleNavItems = useMemo(() => {
    return NAV_ITEMS.map((item) => {
      if (item.type === "link") {
        return hiddenKeys.has(item.sectionKey) ? null : item;
      }
      const items = item.items.filter((sub) => !hiddenKeys.has(sub.sectionKey));
      return items.length > 0 ? { ...item, items } : null;
    }).filter((item): item is NavItem => item !== null);
  }, [hiddenKeys]);

  const closeMobileMenu = () => {
    setMobileOpen(false);
    setMobileOpenGroup(null);
  };

  useEffect(() => {
    let mounted = true;
    async function checkAuth() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (mounted) setUser(user);
      } catch {
        // Supabase not configured
      } finally {
        if (mounted) setAuthLoaded(true);
      }
    }
    checkAuth();
    return () => { mounted = false; };
  }, []);

  // Close any open dropdown on outside click.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!(e.target as Element).closest?.("[data-nav-dropdown]")) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <nav className="bg-bark-brown border-b-2 border-bark-brown-light shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Clan Name */}
          <Link href="/" className="flex items-center gap-3 group">
            <span className="font-display text-2xl text-gold-light group-hover:text-gold transition-colors">
              {CLAN_NAME}
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {visibleNavItems.map((item) =>
              item.type === "link" ? (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-2 rounded-md text-sm font-body text-parchment hover:text-gold-light hover:bg-bark-brown-light transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <NavDropdown
                  key={item.label}
                  label={item.label}
                  items={item.items}
                  open={openDropdown === item.label}
                  onToggle={() => setOpenDropdown((prev) => (prev === item.label ? null : item.label))}
                  onClose={() => setOpenDropdown(null)}
                />
              )
            )}
            <ThemeToggle />
            <UserMenu hiddenKeys={hiddenKeys} />
          </div>

          {/* Mobile: theme toggle + hamburger */}
          <div className="flex md:hidden items-center gap-1">
            <ThemeToggle />
            <button
              onClick={() => (mobileOpen ? closeMobileMenu() : setMobileOpen(true))}
              className="p-2 rounded-md text-parchment hover:text-gold-light hover:bg-bark-brown-light transition-colors"
              aria-label="Toggle navigation menu"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {mobileOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu -- an accordion (one dropdown group open at a time)
            inside its own scrollable region, so it never grows taller than
            the viewport and clips off unreachable links the way a fixed
            max-height would. */}
        <div
          className={cn(
            "md:hidden transition-all duration-300",
            mobileOpen ? "max-h-[calc(100vh-4rem)] overflow-y-auto pb-4" : "max-h-0 overflow-hidden"
          )}
        >
          {visibleNavItems.map((item) => {
            if (item.type === "link") {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMobileMenu}
                  className="block px-3 py-2.5 rounded-md text-base font-body text-parchment hover:text-gold-light hover:bg-bark-brown-light transition-colors"
                >
                  {item.label}
                </Link>
              );
            }

            const isOpen = mobileOpenGroup === item.label;
            return (
              <div key={item.label} className="border-t border-bark-brown-light/40 first:border-t-0">
                <button
                  type="button"
                  onClick={() => setMobileOpenGroup((prev) => (prev === item.label ? null : item.label))}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-md text-base font-body text-parchment hover:text-gold-light hover:bg-bark-brown-light transition-colors cursor-pointer"
                >
                  {item.label}
                  <svg
                    className={cn("w-4 h-4 transition-transform shrink-0", isOpen ? "rotate-180" : "")}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="pb-1">
                    {item.items.map((sub) => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        onClick={closeMobileMenu}
                        className="block px-6 py-2 rounded-md text-sm font-body text-parchment/90 hover:text-gold-light hover:bg-bark-brown-light transition-colors"
                      >
                        {sub.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Mobile auth section */}
          {authLoaded && (
            <>
              <div className="border-t border-bark-brown-light my-2" />
              {user ? (
                <>
                  <div className="flex items-center gap-3 px-3 py-2">
                    {user.user_metadata?.avatar_url && !avatarFailed ? (
                      <img
                        src={user.user_metadata.avatar_url}
                        alt=""
                        onError={() => setAvatarFailed(true)}
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gnome-green flex items-center justify-center text-sm text-text-light font-bold">
                        {(user.user_metadata?.full_name ?? "U").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm text-parchment font-semibold">
                      {user.user_metadata?.full_name ?? "User"}
                    </span>
                  </div>
                  <Link
                    href="/account"
                    onClick={closeMobileMenu}
                    className="block px-3 py-2 rounded-md text-base font-body text-parchment hover:text-gold-light hover:bg-bark-brown-light transition-colors"
                  >
                    My Account / Link RSN
                  </Link>
                  <Link
                    href="/gn0mebook/edit"
                    onClick={closeMobileMenu}
                    className="block px-3 py-2 rounded-md text-base font-body text-parchment hover:text-gold-light hover:bg-bark-brown-light transition-colors"
                  >
                    My Gn0meBook Profile
                  </Link>
                  <WhatsNewMenuLink
                    onClick={closeMobileMenu}
                    className="px-3 py-2 rounded-md text-base font-body text-parchment hover:text-gold-light hover:bg-bark-brown-light transition-colors"
                  />
                  <Link
                    href="/admin"
                    onClick={closeMobileMenu}
                    className="block px-3 py-2 rounded-md text-base font-body text-parchment hover:text-gold-light hover:bg-bark-brown-light transition-colors"
                  >
                    Admin Panel
                  </Link>
                  <Link
                    href="/apply"
                    onClick={closeMobileMenu}
                    className="block px-3 py-2 rounded-md text-base font-body text-parchment hover:text-gold-light hover:bg-bark-brown-light transition-colors"
                  >
                    Apply for Staff
                  </Link>
                  <button
                    onClick={() => { closeMobileMenu(); handleLogout(); }}
                    className="block w-full text-left px-3 py-2 rounded-md text-base font-body text-red-accent hover:bg-bark-brown-light transition-colors cursor-pointer"
                  >
                    Log Out
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  onClick={closeMobileMenu}
                  className="block px-3 py-2 rounded-md text-base font-body text-gold hover:text-gold-light hover:bg-bark-brown-light transition-colors font-semibold"
                >
                  Login with Discord
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
