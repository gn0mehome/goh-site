import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkPermission } from "@/lib/check-permission";
import { isThemeChoice } from "@/lib/site-theme";
import { getSiteThemeChoice } from "@/lib/site-theme-server";

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key) : null;
}

// GET -- the site's default theme. POST { theme } -- change it.
export async function GET() {
  const { allowed } = await checkPermission("manage_settings");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sb = service();
  if (!sb) return NextResponse.json({ theme: "gnome" });
  return NextResponse.json({ theme: await getSiteThemeChoice(sb) });
}

export async function POST(request: NextRequest) {
  const { allowed, user } = await checkPermission("manage_settings");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (!isThemeChoice(body.theme)) return NextResponse.json({ error: "Pick a theme." }, { status: 400 });
  const sb = service();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const { error } = await sb.from("site_settings").upsert({ id: 1, theme: body.theme, updated_by: user?.discord_username ?? null, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
