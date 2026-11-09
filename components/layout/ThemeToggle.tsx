"use client";

import { useState, useEffect } from "react";
import { MODE_COOKIE } from "@/lib/site-theme";

/** Remembered in a cookie (so the server draws the right mode first time) and localStorage. */
function remember(dark: boolean) {
  document.cookie = `${MODE_COOKIE}=${dark ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
  try {
    localStorage.setItem("theme", dark ? "dark" : "light");
  } catch {
    /* private mode */
  }
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // The server already applied the cookie; older visits only saved localStorage.
    const on = document.documentElement.classList.contains("dark");
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("theme");
    } catch {
      /* private mode */
    }
    if (!on && stored === "dark") {
      document.documentElement.classList.add("dark");
      remember(true);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDark(true);
    } else {
      setDark(on);
    }
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    remember(next);
  };

  return (
    <button
      onClick={toggle}
      className="p-2 rounded-md text-parchment hover:text-gold-light hover:bg-bark-brown-light transition-colors cursor-pointer"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  );
}
