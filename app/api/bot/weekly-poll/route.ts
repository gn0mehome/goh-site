import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processWeeklyPolls } from "@/lib/weekly-poll";

// Weekly SOTW/BotW poll check for the Discord bot (Bearer DISCORD_WEBHOOK_SECRET),
// every 30 minutes: when a voting poll has closed, sets up the winner's competition.
export async function POST(request: NextRequest) {
  const secret = process.env.DISCORD_WEBHOOK_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  return NextResponse.json(await processWeeklyPolls(createClient(url, key)));
}
