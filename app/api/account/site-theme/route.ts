import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isThemeChoice } from "@/lib/site-theme";
import { getThemeState } from "@/lib/site-theme-server";

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key) : null;
}

async function signedIn() {
  try {
    const auth = await createSupabaseServerClient();
    const { data: { user } } = await auth.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

// GET -- your theme choice and the site's. POST { theme: choice | null } -- null follows the site.
export async function GET() {
  const userId = await signedIn();
  const sb = service();
  if (!userId || !sb) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return NextResponse.json(await getThemeState(sb, userId));
}

export async function POST(request: NextRequest) {
  const userId = await signedIn();
  const sb = service();
  if (!userId || !sb) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const theme = body.theme === null ? null : isThemeChoice(body.theme) ? body.theme : undefined;
  if (theme === undefined) return NextResponse.json({ error: "Pick a theme." }, { status: 400 });
  const { error } = await sb.from("user_profiles").update({ site_theme: theme }).eq("id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
