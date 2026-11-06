import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processWeeklyPolls } from "@/lib/weekly-poll";

/**
 * Daily fallback for the weekly SOTW/BotW poll (see vercel.json); the bot
 * checks every 30 minutes through /api/bot/weekly-poll. Requires CRON_SECRET if set.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  return NextResponse.json(await processWeeklyPolls(createClient(url, key)));
}
