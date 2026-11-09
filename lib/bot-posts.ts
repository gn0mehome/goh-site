// A log of every message the site's bot posts to Discord (DMs aside), so
// staff can find and edit them later: Discord only lets the bot that sent a
// message change it. lib/discord.ts records each post here; callers can say
// what a post is for with withBotPost().

import { AsyncLocalStorage } from "node:async_hooks";
import { createClient } from "@supabase/supabase-js";

export interface BotPostContext {
  /** Which part of the site posted it, e.g. "weekly_forum". */
  source?: string;
  /** A short name for the list. */
  label?: string;
}

export interface BotPost {
  id: string;
  channel_id: string;
  message_id: string;
  source: string | null;
  label: string | null;
  content: string;
  has_poll: boolean;
  has_images: boolean;
  created_at: string;
  edited_at: string | null;
  edited_by: string | null;
}

const context = new AsyncLocalStorage<BotPostContext>();

/**
 * Runs fn with a source/label for anything it posts (an inner call adds to
 * or overrides an outer one). With `fallback`, only fills in what isn't set.
 */
export function withBotPost<T>(ctx: BotPostContext, fn: () => Promise<T>, { fallback = false } = {}): Promise<T> {
  const outer = context.getStore() ?? {};
  const set = (o: BotPostContext) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));
  return context.run(fallback ? { ...set(ctx), ...set(outer) } : { ...set(outer), ...set(ctx) }, fn);
}

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key) : null;
}

const firstLine = (s: string) => s.split("\n").map((l) => l.replace(/[*_#>`~|]/g, "").trim()).find(Boolean)?.slice(0, 120) ?? "";

/** Saves a post the bot just made. Never throws: a failed log mustn't fail the post. */
export async function recordBotPost(post: { channelId: string; messageId: string; content: string; label?: string; hasPoll?: boolean; hasImages?: boolean }) {
  try {
    const supabase = service();
    if (!supabase) return;
    const ctx = context.getStore() ?? {};
    await supabase.from("bot_posts").upsert(
      {
        channel_id: post.channelId,
        message_id: post.messageId,
        source: ctx.source ?? null,
        label: (ctx.label || post.label || firstLine(post.content) || "Bot post").slice(0, 150),
        content: post.content,
        has_poll: !!post.hasPoll,
        has_images: !!post.hasImages,
      },
      { onConflict: "message_id" },
    );
  } catch (err) {
    console.error("Couldn't log bot post:", err);
  }
}

/** Keeps the log's copy in step after an edit. Never throws. */
export async function recordBotPostEdit(channelId: string, messageId: string, content: string, editedBy?: string, label?: string) {
  try {
    const supabase = service();
    if (!supabase) return;
    const patch: Record<string, unknown> = { content, edited_at: new Date().toISOString(), edited_by: editedBy ?? null };
    const { data } = await supabase.from("bot_posts").update(patch).eq("message_id", messageId).select("id");
    if (!data?.length && editedBy) {
      // Posted before the log existed: add it now that someone's edited it.
      await supabase.from("bot_posts").insert({ channel_id: channelId, message_id: messageId, content, label: (label || firstLine(content) || "Bot post").slice(0, 150), ...patch });
    }
  } catch (err) {
    console.error("Couldn't log bot post edit:", err);
  }
}
