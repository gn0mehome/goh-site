"use client";

import { useEffect } from "react";

const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
const ADSENSE_FOOTER_SLOT = process.env.NEXT_PUBLIC_ADSENSE_FOOTER_SLOT;

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * Site-wide banner ad, shown just above the footer. Renders nothing until
 * both env vars are set, so the site works exactly as before with no
 * AdSense account configured yet. Pushes on every mount (not just once
 * globally) since Next.js client-side navigation doesn't reload the
 * adsbygoogle script, and each new <ins> needs its own push to render.
 */
export function AdBanner() {
  useEffect(() => {
    if (!ADSENSE_CLIENT_ID || !ADSENSE_FOOTER_SLOT) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // AdSense script not loaded yet, or blocked by an ad blocker -- non-critical.
    }
  }, []);

  if (!ADSENSE_CLIENT_ID || !ADSENSE_FOOTER_SLOT) return null;

  return (
    <div data-print-hide className="max-w-7xl mx-auto px-4 py-4">
      <ins
        className="adsbygoogle block"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-slot={ADSENSE_FOOTER_SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
