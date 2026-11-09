// Reads the site's theme settings on the server. Server only.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isThemeChoice, resolveTheme, type SiteThemeChoice, type SiteThemeKey } from "./site-theme";

export interface SiteThemeState {
  /** What admins chose for the site. */
  siteChoice: SiteThemeChoice;
  /** The member's own choice, or null to follow the site. */
  userChoice: SiteThemeChoice | null;
  /** The theme to draw this page with. */
  theme: SiteThemeKey;
}

/** The admins' default (falls back to Gn0me Home if it can't be read). */
export async function getSiteThemeChoice(sb: SupabaseClient): Promise<SiteThemeChoice> {
  const { data } = await sb.from("site_settings").select("theme").eq("id", 1).maybeSingle();
  return isThemeChoice(data?.theme) ? data.theme : "gnome";
}

export async function getThemeState(sb: SupabaseClient, userId: string | null): Promise<SiteThemeState> {
  const [siteChoice, user] = await Promise.all([
    getSiteThemeChoice(sb).catch(() => "gnome" as SiteThemeChoice),
    userId ? sb.from("user_profiles").select("site_theme").eq("id", userId).maybeSingle().then((r) => r.data, () => null) : Promise.resolve(null),
  ]);
  const userChoice = isThemeChoice(user?.site_theme) ? user.site_theme : null;
  return { siteChoice, userChoice, theme: resolveTheme(userChoice ?? siteChoice) };
}
