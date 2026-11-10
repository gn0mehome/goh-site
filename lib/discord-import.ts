/**
 * Shared logic for importing content from Discord into the site, used by
 * both the manual "Import from Discord" buttons (via their POST routes)
 * and the daily cron (app/api/discord-import). Lives here rather than as
 * an extra export from a route.ts file, since Next.js's Route Handler
 * files are only documented to support the HTTP-method exports plus route
 * segment config -- not verified safe to also export/import plain helpers
 * across files, so this sidesteps that question entirely.
 */
import { createClient } from "@supabase/supabase-js";
import { getChannelMessages, getDiscordEvents } from "@/lib/discord";
import { getAlertChannel } from "@/lib/alert-channels";

export interface ImportResult {
  ok: boolean;
  status: number;
  imported: number;
  message: string;
}

// Original hardcoded default, kept as the last-resort fallback so this
// doesn't break for anyone who hasn't set DISCORD_ANNOUNCEMENTS_CHANNEL_ID
// or an Admin > Settings > Discord Channels override yet.
const LEGACY_ANNOUNCEMENTS_CHANNEL_ID = "1486887506367611063";

export async function runAnnouncementsImport(): Promise<ImportResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, status: 503, imported: 0, message: "Supabase not configured" };
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const channelId = (await getAlertChannel(supabase, "announcements")) ?? LEGACY_ANNOUNCEMENTS_CHANNEL_ID;

    const messages = await getChannelMessages(channelId, 50);

    if (!Array.isArray(messages) || messages.length === 0) {
      return { ok: true, status: 200, imported: 0, message: "No messages found in channel." };
    }

    const { data: existing } = await supabase
      .from("announcements")
      .select("discord_message_id")
      .not("discord_message_id", "is", null);

    const existingIds = new Set((existing ?? []).map((a) => a.discord_message_id));

    const toImport = messages.filter(
      (msg: { id: string; content: string; author: { bot?: boolean } }) =>
        msg.content?.trim() &&
        !msg.author?.bot &&
        !existingIds.has(msg.id)
    );

    if (toImport.length === 0) {
      return { ok: true, status: 200, imported: 0, message: "All announcements already imported." };
    }

    const rows = toImport.map(
      (msg: {
        id: string;
        content: string;
        author: { username: string; global_name?: string };
        timestamp: string;
      }) => {
        const lines = msg.content.trim().split("\n");
        const firstLine = lines[0]
          .replace(/\*\*/g, "")
          .replace(/<@[!&]?\d+>/g, "")
          .replace(/<#\d+>/g, "")
          .replace(/<:\w+:\d+>/g, "")
          .trim()
          .slice(0, 200);

        const title = firstLine || "Discord Announcement";
        const content = lines.length > 1
          ? lines.slice(1).join("\n").trim()
          : msg.content.trim();

        return {
          title,
          content,
          category: "announcement",
          published: true,
          author_name: msg.author.global_name ?? msg.author.username,
          discord_message_id: msg.id,
          created_at: msg.timestamp,
          updated_at: new Date().toISOString(),
        };
      }
    );

    const { error } = await supabase.from("announcements").insert(rows);

    if (error) {
      return { ok: false, status: 500, imported: 0, message: error.message };
    }

    return { ok: true, status: 200, imported: rows.length, message: `Imported ${rows.length} announcement(s) from Discord.` };
  } catch (err) {
    console.error("Discord import error:", err);
    return { ok: false, status: 500, imported: 0, message: "Failed to import from Discord. Check bot token and channel permissions." };
  }
}

export async function runEventsImport(): Promise<ImportResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, status: 503, imported: 0, message: "Supabase not configured" };
  }

  try {
    const discordEvents = await getDiscordEvents();

    if (!Array.isArray(discordEvents) || discordEvents.length === 0) {
      return { ok: true, status: 200, imported: 0, message: "No scheduled events found in Discord." };
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Discord keeps one object per recurring series (same id forever),
    // advancing scheduled_start_time to the next occurrence over time --
    // so a series needs one site row per occurrence, all sharing the same
    // discord_event_id. Dedupe on (id, start time) instead of id alone,
    // or every occurrence after the first would be silently skipped.
    const { data: existing } = await supabase
      .from("events")
      .select("discord_event_id, start_time")
      .not("discord_event_id", "is", null);

    const existingKeys = new Set(
      (existing ?? []).map((e) => `${e.discord_event_id}|${new Date(e.start_time).getTime()}`)
    );

    const toImport = discordEvents.filter(
      (de: { id: string; status: number; scheduled_start_time: string }) =>
        !existingKeys.has(`${de.id}|${new Date(de.scheduled_start_time).getTime()}`) && de.status !== 4 // 4 = completed
    );

    if (toImport.length === 0) {
      return { ok: true, status: 200, imported: 0, message: "All Discord events already imported." };
    }

    const rows = toImport.map(
      (de: {
        id: string;
        name: string;
        description: string | null;
        scheduled_start_time: string;
        scheduled_end_time: string | null;
        entity_metadata?: { location?: string };
      }) => ({
        title: de.name,
        description: de.description ?? null,
        event_type: guessEventType(de.name, de.description),
        start_time: de.scheduled_start_time,
        end_time: de.scheduled_end_time ?? null,
        location: de.entity_metadata?.location ?? null,
        // No host: whoever made the Discord event usually isn't the one running it. Staff add a host by hand when there is one.
        discord_event_id: de.id,
      })
    );

    const { error } = await supabase.from("events").insert(rows);

    if (error) {
      return { ok: false, status: 500, imported: 0, message: error.message };
    }

    return { ok: true, status: 200, imported: rows.length, message: `Imported ${rows.length} event(s) from Discord.` };
  } catch (err) {
    console.error("Discord event import error:", err);
    return { ok: false, status: 500, imported: 0, message: "Failed to import from Discord. Check bot token and permissions." };
  }
}

function guessEventType(name: string, description: string | null): string {
  const text = `${name} ${description ?? ""}`.toLowerCase();
  if (text.includes("pvm") || text.includes("boss") || text.includes("raid") || text.includes("cox") || text.includes("tob") || text.includes("toa")) return "pvm";
  if (text.includes("skill") || text.includes("sotw") || text.includes("mining") || text.includes("woodcut")) return "skilling";
  if (text.includes("drop party") || text.includes("giveaway")) return "drop_party";
  if (text.includes("hide") || text.includes("seek")) return "hide_seek";
  if (text.includes("social") || text.includes("hangout") || text.includes("movie")) return "social";
  return "other";
}
