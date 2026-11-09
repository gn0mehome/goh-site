"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { WhatsNewMenuLink } from "@/components/whats-new/WhatsNewMenuLink";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";

interface UserMenuProps {
  /** Resolved once by the Navbar (itself seeded server-side, see app/layout.tsx) -- avoids this menu independently re-fetching the same thing. */
  hiddenKeys: Set<string>;
}

export function UserMenu({ hiddenKeys }: UserMenuProps) {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function getUser() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (mounted) setUser(user);
      } catch {
        // Supabase not configured — show login button
      } finally {
        if (mounted) setLoading(false);
      }
    }

    getUser();
    return () => { mounted = false; };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
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

  if (loading) return null;

  if (!user) {
    return (
      <Link
        href="/login"
        className="px-3 py-1.5 rounded-md text-sm font-body text-bark-brown bg-gold-light hover:brightness-110 transition"
      >
        Login
      </Link>
    );
  }

  const avatar = !avatarFailed && user.user_metadata?.avatar_url;
  const name = user.user_metadata?.full_name ?? user.user_metadata?.name ?? "User";

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-bark-brown-light transition-colors cursor-pointer"
      >
        {avatar ? (
          <img src={avatar} alt="" onError={() => setAvatarFailed(true)} className="w-7 h-7 rounded-full" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-gnome-green flex items-center justify-center text-xs text-text-light font-bold">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-sm text-parchment hidden sm:inline truncate max-w-[100px]">
          {name}
        </span>
        <svg className="w-3 h-3 text-parchment" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 card-wood py-1 z-50 shadow-xl">
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-bark-brown hover:bg-parchment-dark transition-colors"
          >
            My Account / Link RSN
          </Link>
          <Link
            href="/gn0mebook/edit"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-bark-brown hover:bg-parchment-dark transition-colors"
          >
            My Gn0meBook Profile
          </Link>
          {!hiddenKeys.has("bank") && (
            <Link
              href="/loans/mine"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-bark-brown hover:bg-parchment-dark transition-colors"
            >
              My Loans
            </Link>
          )}
          <WhatsNewMenuLink
            onClick={() => setOpen(false)}
            className="px-4 py-2 text-sm text-bark-brown hover:bg-parchment-dark transition-colors"
          />
          <Link
            href="/admin"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-bark-brown hover:bg-parchment-dark transition-colors"
          >
            Admin Panel
          </Link>
          <Link
            href="/apply"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-bark-brown hover:bg-parchment-dark transition-colors"
          >
            Apply for Staff
          </Link>
          <div className="border-t border-parchment-dark my-1" />
          <button
            onClick={handleLogout}
            className="block w-full text-left px-4 py-2 text-sm text-red-accent hover:bg-parchment-dark transition-colors cursor-pointer"
          >
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}
