import type { Metadata } from "next";
import Script from "next/script";
import { createClient } from "@supabase/supabase-js";
import { MedievalSharp, Merriweather, JetBrains_Mono } from "next/font/google";
import { WalkthroughBar } from "@/components/whats-new/WalkthroughBar";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { AdBanner } from "@/components/ads/AdBanner";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getHiddenSectionKeys } from "@/lib/clan-access";
import { getRankLabels, type RankLabels } from "@/lib/rank-labels";
import { RankLabelsProvider } from "@/components/ui/RankLabelsProvider";
import { cookies } from "next/headers";
import { getThemeState } from "@/lib/site-theme-server";
import { MODE_COOKIE, resolveTheme, type SiteThemeKey } from "@/lib/site-theme";
import "./globals.css";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

const medievalSharp = MedievalSharp({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const merriweather = Merriweather({
  weight: ["300", "400", "700"],
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gnomehome.gg";

export const metadata: Metadata = {
  title: {
    default: "Gn0me Home — OSRS Clan",
    template: "%s | Gn0me Home",
  },
  description:
    "Gn0me Home is an Old School RuneScape clan focused on PvM, community events, and good times. All levels welcome.",
  metadataBase: new URL(BASE_URL),
  openGraph: {
    type: "website",
    siteName: "Gn0me Home",
    title: "Gn0me Home — OSRS Clan",
    description:
      "An Old School RuneScape clan focused on PvM, community events, and good times. All levels welcome.",
    url: BASE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Gn0me Home — OSRS Clan",
    description:
      "An Old School RuneScape clan focused on PvM, community events, and good times.",
  },
  keywords: [
    "OSRS",
    "Old School RuneScape",
    "clan",
    "Gn0me Home",
    "PvM",
    "raids",
    "bosses",
    "community",
  ],
  other: ADSENSE_CLIENT_ID ? { "google-adsense-account": ADSENSE_CLIENT_ID } : undefined,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved here, server-side, so the Navbar's very first paint already
  // has the right links hidden -- previously this only happened after a
  // client-side fetch resolved, which meant a hidden section's link could
  // flash into view for a moment on every page load before disappearing.
  const supabase = getServiceClient();
  let initialHiddenKeys: string[] = [];
  let rankLabels: RankLabels = {};
  // The colour theme (the member's choice, else the admins' default) and
  // light/dark (a cookie the toggle sets) are applied here so the very first
  // paint is already right.
  let theme: SiteThemeKey = resolveTheme("gnome");
  if (supabase) {
    const authClient = await createSupabaseServerClient();
    const { data: { user } } = await authClient.auth.getUser();
    let themeState;
    [initialHiddenKeys, rankLabels, themeState] = await Promise.all([
      getHiddenSectionKeys(supabase, user?.id ?? null),
      getRankLabels(supabase).catch(() => ({})),
      getThemeState(supabase, user?.id ?? null).catch(() => null),
    ]);
    if (themeState) theme = themeState.theme;
  }
  const dark = (await cookies()).get(MODE_COOKIE)?.value === "dark";

  return (
    <html
      lang="en"
      className={`${medievalSharp.variable} ${merriweather.variable} ${jetbrainsMono.variable} h-full antialiased${dark ? " dark" : ""}`}
      data-theme={theme}
    >
      <body className="min-h-full flex flex-col">
        {ADSENSE_CLIENT_ID && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
        <RankLabelsProvider labels={rankLabels}>
          <Navbar initialHiddenKeys={initialHiddenKeys} />
          <main className="flex-1">{children}</main>
          <WalkthroughBar />
          <AdBanner />
          <Footer />
        </RankLabelsProvider>
      </body>
    </html>
  );
}
