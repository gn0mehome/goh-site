import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkPermission } from "@/lib/check-permission";
import { editChannelMessage, getBotUserId, getChannelInfo, getChannelMessage, isDiscordSnowflake, renameThread } from "@/lib/discord";
import { recordBotPostEdit, type BotPost } from "@/lib/bot-posts";

// Lists and edits the bot's own Discord posts (see lib/bot-posts.ts).
// Anyone with "Edit Bot Posts" can edit any of them; anyone who can manage
// competitions can edit the weekly SOTW/BotW posts from that page.

const MAX_CONTENT = 2000;
const THREAD_TYPES = new Set([10, 11, 12]);

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key) : null;
}

/** "https://discord.com/channels/guild/channel/message" -> ids. */
function parseLink(link: string): { channelId: string; messageId: string } | null {
  const m = /discord(?:app)?\.com\/channels\/(?:\d+|@me)\/(\d+)\/(\d+)/.exec(link);
  return m ? { channelId: m[1], messageId: m[2] } : null;
}

async function access() {
  const [all, comps] = await Promise.all([checkPermission("edit_bot_posts"), checkPermission("manage_competitions")]);
  return { all: all.allowed, weekly: comps.allowed, user: all.user ?? comps.user };
}

const isWeekly = (source: string | null | undefined) => !!source && source.startsWith("weekly_");

// GET ?scope=weekly&q=text        -> recent logged posts
// GET ?link=<message link>        -> the live message, ready to edit
export async function GET(request: NextRequest) {
  const { all, weekly } = await access();
  if (!all && !weekly) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = service();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const params = request.nextUrl.searchParams;

  const link = params.get("link");
  if (link) {
    const ids = parseLink(link) ?? { channelId: params.get("channelId") ?? "", messageId: params.get("messageId") ?? "" };
    if (!isDiscordSnowflake(ids.channelId) || !isDiscordSnowflake(ids.messageId)) {
      return NextResponse.json({ error: "That doesn't look like a Discord message link. In Discord, right-click the message and pick Copy Message Link." }, { status: 400 });
    }
    const { data: logged } = await supabase.from("bot_posts").select("source, label").eq("message_id", ids.messageId).maybeSingle();
    if (!all && !isWeekly(logged?.source)) return NextResponse.json({ error: "You can only edit the weekly SOTW/BotW posts here." }, { status: 403 });

    let message: { id: string; content: string; author?: { id: string }; poll?: unknown; embeds?: unknown[]; attachments?: unknown[] };
    try {
      message = await getChannelMessage(ids.channelId, ids.messageId);
    } catch {
      return NextResponse.json({ error: "Couldn't find that message. It may have been deleted, or the bot can't see that channel." }, { status: 404 });
    }
    const botId = await getBotUserId();
    if (message.author?.id !== botId) return NextResponse.json({ error: "That message wasn't posted by the bot, so it can't be edited from here. Discord only lets whoever sent a message change it." }, { status: 400 });

    const channel = await getChannelInfo(ids.channelId);
    const isThread = !!channel && THREAD_TYPES.has(channel.type);
    return NextResponse.json({
      channelId: ids.channelId,
      messageId: ids.messageId,
      content: message.content ?? "",
      label: logged?.label ?? null,
      isPoll: !!message.poll,
      images: (message.embeds?.length ?? 0) + (message.attachments?.length ?? 0),
      channelName: channel?.name ?? null,
      // The first message of a forum post shares the post's id, so its title can be changed too.
      threadTitle: isThread && ids.messageId === ids.channelId ? channel!.name : null,
      url: `https://discord.com/channels/${process.env.DISCORD_GUILD_ID ?? "@me"}/${ids.channelId}/${ids.messageId}`,
    });
  }

  let query = supabase.from("bot_posts").select("*").order("created_at", { ascending: false }).limit(Math.min(100, Number(params.get("limit")) || 40));
  if (params.get("scope") === "weekly" || !all) query = query.like("source", "weekly\\_%");
  const q = (params.get("q") ?? "").trim().replace(/[%_,()]/g, " ");
  if (q) query = query.or(`label.ilike.%${q}%,content.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: (data ?? []) as BotPost[], guildId: process.env.DISCORD_GUILD_ID ?? null });
}

// PATCH { channelId, messageId, content, threadTitle? } -> edits the message in place.
export async function PATCH(request: NextRequest) {
  const { all, weekly, user } = await access();
  if (!all && !weekly) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = service();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const channelId = String(body.channelId ?? "");
  const messageId = String(body.messageId ?? "");
  const content = typeof body.content === "string" ? body.content : "";
  const threadTitle = typeof body.threadTitle === "string" ? body.threadTitle.trim() : null;
  if (!isDiscordSnowflake(channelId) || !isDiscordSnowflake(messageId)) return NextResponse.json({ error: "Missing message." }, { status: 400 });
  if (content.length > MAX_CONTENT) return NextResponse.json({ error: `Discord messages can be at most ${MAX_CONTENT} characters (this one is ${content.length}).` }, { status: 400 });

  const { data: logged } = await supabase.from("bot_posts").select("source, label").eq("message_id", messageId).maybeSingle();
  if (!all && !isWeekly(logged?.source)) return NextResponse.json({ error: "You can only edit the weekly SOTW/BotW posts here." }, { status: 403 });

  let message: { author?: { id: string }; poll?: unknown; embeds?: unknown[]; attachments?: unknown[] };
  try {
    message = await getChannelMessage(channelId, messageId);
  } catch {
    return NextResponse.json({ error: "Couldn't find that message any more. It may have been deleted." }, { status: 404 });
  }
  if (message.author?.id !== (await getBotUserId())) return NextResponse.json({ error: "That message wasn't posted by the bot." }, { status: 400 });
  if (message.poll) return NextResponse.json({ error: "Discord doesn't allow polls to be edited." }, { status: 400 });
  if (!content.trim() && !(message.embeds?.length || message.attachments?.length)) return NextResponse.json({ error: "The message can't be empty." }, { status: 400 });

  try {
    // null keeps the message's images and link previews as they are.
    await editChannelMessage(channelId, messageId, content, null);
    await recordBotPostEdit(channelId, messageId, content, user?.discord_username || "staff", logged?.label ?? undefined);
    if (threadTitle && messageId === channelId) {
      const channel = await getChannelInfo(channelId);
      if (channel && THREAD_TYPES.has(channel.type) && channel.name !== threadTitle) {
        await renameThread(channelId, threadTitle);
        await supabase.from("bot_posts").update({ label: threadTitle.slice(0, 150) }).eq("message_id", messageId);
      }
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Discord didn't accept the edit." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
