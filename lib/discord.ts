/**
 * Discord API helpers for bidirectional event sync.
 * Requires DISCORD_BOT_TOKEN and DISCORD_GUILD_ID env vars.
 */

import { resolveUnicodeShortcodes } from "./emoji-shortcodes";
import { recordBotPost, recordBotPostEdit, withBotPost } from "./bot-posts";

const DISCORD_API = "https://discord.com/api/v10";

function getHeaders() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN not set");
  return {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
  };
}

const GUILD_FORUM = 15;
const GUILD_MEDIA = 16;

/**
 * Look up a channel's type (e.g. to tell a forum channel apart from a plain
 * text channel/thread). Swallows errors and returns null on failure — the
 * caller falls through to its normal posting attempt either way, which
 * surfaces a clear Discord API error on its own rather than failing
 * confusingly inside this check.
 */
async function getChannelType(channelId: string): Promise<number | null> {
  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}`, {
      headers: getHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.type === "number" ? data.type : null;
  } catch {
    return null;
  }
}

export interface GuildEmoji {
  id: string;
  name: string;
  animated: boolean;
}

let guildEmojiCache: { data: GuildEmoji[]; fetchedAt: number } | null = null;
const GUILD_EMOJI_CACHE_TTL_MS = 10 * 60 * 1000;

/** The server's custom emotes, cached briefly since the list rarely changes. */
export async function getGuildEmojis(): Promise<GuildEmoji[]> {
  if (guildEmojiCache && Date.now() - guildEmojiCache.fetchedAt < GUILD_EMOJI_CACHE_TTL_MS) {
    return guildEmojiCache.data;
  }

  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) return guildEmojiCache?.data ?? [];

  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/emojis`, {
      headers: getHeaders(),
    });
    if (!res.ok) return guildEmojiCache?.data ?? [];
    const data: GuildEmoji[] = await res.json();
    guildEmojiCache = { data, fetchedAt: Date.now() };
    return data;
  } catch {
    return guildEmojiCache?.data ?? [];
  }
}

/**
 * Resolves :name: shorthand for both custom server emotes (into Discord's
 * actual <:name:id>/<a:name:id> message syntax) and standard Unicode emoji
 * (into the real character, via lib/emoji-shortcodes.ts). Discord's own
 * client does both automatically as you type, but that conversion never
 * happens for messages sent through the bot API -- without this, an emote
 * typed as :GnomePog: or :crescent_moon: just posts as literal text.
 * Content with no :word:-shaped token skips the emoji-list fetch entirely;
 * a name that doesn't match either source is left untouched rather than
 * erroring (it might just be literal text with colons in it).
 */
async function resolveEmoteShorthand(content: string): Promise<string> {
  if (!/:[a-zA-Z0-9_]+:/.test(content)) return content;

  const emojis = await getGuildEmojis();
  const byName = new Map(emojis.map((e) => [e.name, e]));

  const withCustomEmotes = content.replace(/:([a-zA-Z0-9_]+):/g, (match, name) => {
    const emoji = byName.get(name);
    return emoji ? `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>` : match;
  });

  return resolveUnicodeShortcodes(withCustomEmotes);
}

/**
 * Discord's recurrence rule for a scheduled event. Only the subset the site
 * actually uses is modelled: weekly on one weekday (Discord currently
 * requires by_weekday to be exactly one entry for WEEKLY), with interval 1
 * (every week) or 2 (every other week -- the only frequency that permits an
 * interval other than 1). `start` must match the event's start time.
 */
export interface DiscordRecurrenceRule {
  start: string;
  frequency: 2; // WEEKLY
  interval: 1 | 2;
  by_weekday: number[]; // 0 = Monday ... 6 = Sunday, exactly one entry
}

interface DiscordScheduledEvent {
  name: string;
  description?: string;
  scheduled_start_time: string;
  scheduled_end_time?: string;
  entity_type: 3; // External
  entity_metadata?: { location?: string };
  privacy_level: 2; // Guild only
  image?: string | null; // base64 data URI -- Discord's scheduled-event cover doesn't accept a plain URL
  recurrence_rule?: DiscordRecurrenceRule | null;
}

/** Discord's weekday numbering (Monday = 0 ... Sunday = 6) for the given instant, vs JS's Sunday = 0. */
export function discordWeekday(iso: string): number {
  const jsDay = new Date(iso).getUTCDay(); // 0 = Sunday
  return (jsDay + 6) % 7;
}

/**
 * The site's own vocabulary for a series' repeat pattern. "other" is a
 * pattern set in Discord directly that the site can't express (monthly,
 * multi-weekday daily, ...) -- surfaced read-only so an edit never silently
 * overwrites it with something narrower.
 */
export type SiteRecurrence = "none" | "weekly" | "biweekly" | "other";

/** Builds Discord's recurrence_rule for a site pattern; null means "no recurrence" (which PATCH accepts to remove one). */
export function buildRecurrenceRule(startIso: string, recurrence: SiteRecurrence): DiscordRecurrenceRule | null {
  if (recurrence !== "weekly" && recurrence !== "biweekly") return null;
  return {
    start: startIso,
    frequency: 2,
    interval: recurrence === "biweekly" ? 2 : 1,
    by_weekday: [discordWeekday(startIso)],
  };
}

/** Reads a Discord recurrence_rule back into the site's vocabulary. */
export function recurrenceFromRule(rule: { frequency?: number; interval?: number; by_weekday?: number[] | null } | null | undefined): SiteRecurrence {
  if (!rule) return "none";
  const singleWeekday = Array.isArray(rule.by_weekday) && rule.by_weekday.length === 1;
  if (rule.frequency === 2 && singleWeekday) {
    if (rule.interval === 2) return "biweekly";
    if (!rule.interval || rule.interval === 1) return "weekly";
  }
  return "other";
}

/** One scheduled event, including its recurrence_rule -- the site stores no recurrence itself, Discord is the source of truth. */
export async function getDiscordEvent(eventId: string): Promise<{ recurrence_rule: DiscordRecurrenceRule | null } & Record<string, unknown>> {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) throw new Error("DISCORD_GUILD_ID not set");

  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/scheduled-events/${eventId}`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Discord API error: ${res.status} ${error}`);
  }

  return res.json();
}

/**
 * Fetches an image (e.g. a public Supabase Storage URL) and re-encodes it as
 * a base64 data URI -- required by Discord's scheduled-event `image` field,
 * which unlike message embeds doesn't accept a plain URL. Returns null on
 * any failure so a broken/unreachable banner never blocks the rest of event
 * creation/sync.
 */
export async function urlToDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/png";
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function createDiscordEvent(event: DiscordScheduledEvent) {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) throw new Error("DISCORD_GUILD_ID not set");

  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/scheduled-events`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Discord API error: ${res.status} ${error}`);
  }

  return res.json();
}

export async function updateDiscordEvent(eventId: string, updates: Partial<DiscordScheduledEvent>) {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) throw new Error("DISCORD_GUILD_ID not set");

  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/scheduled-events/${eventId}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Discord API error: ${res.status} ${error}`);
  }

  return res.json();
}

export async function deleteDiscordEvent(eventId: string) {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) throw new Error("DISCORD_GUILD_ID not set");

  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/scheduled-events/${eventId}`, {
    method: "DELETE",
    headers: getHeaders(),
  });

  if (!res.ok && res.status !== 204) {
    const error = await res.text();
    throw new Error(`Discord API error: ${res.status} ${error}`);
  }
}

/**
 * Fetch recent messages from a Discord channel.
 */
export async function getChannelMessages(channelId: string, limit: number = 50) {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages?limit=${limit}`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Discord API error: ${res.status} ${error}`);
  }

  return res.json();
}

/**
 * Post a message to a Discord channel, optionally with image embed(s).
 * Supports single image URL string or array of URLs (up to 10 embeds).
 */
export async function postToChannel(channelId: string, content: string, imageUrl?: string | string[]) {
  return sendMessage(channelId, content, imageUrl, true);
}

async function sendMessage(channelId: string, content: string, imageUrl: string | string[] | undefined, record: boolean) {
  const body: Record<string, unknown> = { content: await resolveEmoteShorthand(content) };

  if (imageUrl) {
    const urls = Array.isArray(imageUrl) ? imageUrl.filter(Boolean) : [imageUrl].filter(Boolean);
    if (urls.length > 0) {
      body.embeds = urls.slice(0, 10).map((url) => ({ image: { url } }));
    }
  }

  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Discord API error: ${res.status} ${error}`);
  }

  const message = await res.json();
  if (record) await recordBotPost({ channelId, messageId: message.id, content: body.content as string, hasImages: !!body.embeds });
  return message;
}

/** Gets (or lazily creates) the DM channel id for a user -- Discord treats DMs as just another channel once one exists. */
async function getOrCreateDmChannel(discordId: string): Promise<string> {
  const res = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ recipient_id: discordId }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Discord API error creating DM channel: ${res.status} ${error}`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Sends a direct message to a user. Throws (rather than swallowing) on
 * failure -- e.g. the user has DMs closed, has blocked the bot, or shares no
 * server with it -- so callers can record the specific error rather than
 * silently treating a failed DM as sent.
 */
export async function sendDirectMessage(discordId: string, content: string) {
  const channelId = await getOrCreateDmChannel(discordId);
  // DMs are private, so they're not added to the bot post log.
  return sendMessage(channelId, content, undefined, false);
}

/**
 * Edit an existing message in a Discord channel, optionally replacing its
 * image embed(s). Pass the full desired image set, not a diff — Discord
 * replaces embeds wholesale on PATCH. Unlike postToChannel, an absent
 * imageUrl explicitly clears embeds (embeds: []) rather than omitting the
 * key, so editing a post to remove its banner actually removes it.
 *
 * Pass `null` to leave the message's embeds exactly as they are -- for
 * edits that only change the text (and so mustn't wipe images the site
 * didn't put there, like link previews or a banner on an older post).
 */
export async function editChannelMessage(channelId: string, messageId: string, content: string, imageUrl?: string | string[] | null) {
  const body: Record<string, unknown> = { content: await resolveEmoteShorthand(content) };

  if (imageUrl === null) {
    // Leave embeds untouched.
  } else if (imageUrl) {
    const urls = Array.isArray(imageUrl) ? imageUrl.filter(Boolean) : [imageUrl].filter(Boolean);
    body.embeds = urls.length > 0 ? urls.slice(0, 10).map((url) => ({ image: { url } })) : [];
  } else {
    body.embeds = [];
  }

  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Discord API error: ${res.status} ${error}`);
  }

  const edited = await res.json();
  await recordBotPostEdit(channelId, messageId, body.content as string);
  return edited;
}

/**
 * Create a brand-new post in a Discord Forum (or Media) channel — these
 * channel types don't accept plain messages, only this "start a thread"
 * request, which creates a titled post with its own starter message.
 * Known gap: unlike postToChannel, there's no way to attach a native
 * Discord poll to a forum post's starter message (not supported by
 * Discord's API), so createPoll is deliberately not routed through this.
 */
export async function createForumPost(
  channelId: string,
  title: string,
  content: string,
  imageUrl?: string | string[],
  autoArchiveDuration?: number
): Promise<{ threadId: string; messageId: string }> {
  const message: Record<string, unknown> = { content: await resolveEmoteShorthand(content) };

  if (imageUrl) {
    const urls = Array.isArray(imageUrl) ? imageUrl.filter(Boolean) : [imageUrl].filter(Boolean);
    if (urls.length > 0) {
      message.embeds = urls.slice(0, 10).map((url) => ({ image: { url } }));
    }
  }

  const res = await fetch(`${DISCORD_API}/channels/${channelId}/threads`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      name: title.slice(0, 100),
      message,
      // Discord's "inactivity" window in minutes (60 / 1440 / 4320 / 10080,
      // see lib/thread-archive.ts). Left out, Discord applies the forum's
      // own default -- usually 3 days -- which is what admins used to get
      // with no say in it.
      ...(autoArchiveDuration ? { auto_archive_duration: autoArchiveDuration } : {}),
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Discord API error creating forum post: ${res.status} ${error}`);
  }

  const thread = await res.json();
  await recordBotPost({ channelId: thread.id, messageId: thread.message.id, content: message.content as string, label: title, hasImages: !!message.embeds });
  return { threadId: thread.id, messageId: thread.message.id };
}

/**
 * Post to a destination channel, transparently creating a new forum post
 * instead of a plain message if the destination turns out to be a Forum
 * (or Media) channel. Every *creation* posting flow should go through this
 * rather than postToChannel directly, and must persist the returned
 * channelId (not the input one) for any future edits — once a forum post
 * exists, the message actually lives in the new thread, not the forum
 * channel itself.
 */
export async function postToDestination(
  channelId: string,
  title: string,
  content: string,
  imageUrl?: string | string[],
  autoArchiveDuration?: number
): Promise<{ channelId: string; messageId: string }> {
  return withBotPost({ label: title }, async () => {
    const type = await getChannelType(channelId);
    if (type === GUILD_FORUM || type === GUILD_MEDIA) {
      const { threadId, messageId } = await createForumPost(channelId, title, content, imageUrl, autoArchiveDuration);
      return { channelId: threadId, messageId };
    }
    // A plain channel has nothing to archive -- autoArchiveDuration is
    // deliberately ignored here rather than rejected, so one form can serve
    // both kinds of destination.

    const result = await postToChannel(channelId, content, imageUrl);
    return { channelId, messageId: result.id as string };
  }, { fallback: true });
}

/**
 * Archive + lock a forum post (thread) so it stops accepting new replies —
 * used when a recap closes out the event the post was about. Silently
 * no-ops rather than throwing if the target isn't actually a thread (a
 * plain channel ID was pasted, or it's already closed), since callers treat
 * this as a best-effort cleanup step, not something that should block the
 * recap post itself from succeeding.
 */
export async function closeForumThread(threadId: string): Promise<boolean> {
  try {
    const res = await fetch(`${DISCORD_API}/channels/${threadId}`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ archived: true, locked: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Create a thread in a channel (for sign-ups). If the channel is a Forum
 * (or Media) channel, creates a proper forum post instead of the usual
 * message-then-threadify flow, since forum channels don't accept plain
 * messages at all.
 */
export async function createSignupThread(
  channelId: string,
  eventTitle: string,
  initialMessage: string,
  autoArchiveDuration?: number
): Promise<{ threadId: string; messageId: string }> {
  const threadName = `Sign-ups: ${eventTitle}`;

  const type = await getChannelType(channelId);
  if (type === GUILD_FORUM || type === GUILD_MEDIA) {
    return createForumPost(channelId, threadName, initialMessage, undefined, autoArchiveDuration);
  }

  // Post the initial message
  const msg = await postToChannel(channelId, initialMessage);

  // Create a public thread from that message
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${msg.id}/threads`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      name: threadName.slice(0, 100),
      auto_archive_duration: autoArchiveDuration ?? 10080, // admin's pick, else the 7 days sign-ups always had
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Discord API error creating thread: ${res.status} ${error}`);
  }

  const thread = await res.json();
  return { threadId: thread.id, messageId: msg.id };
}

/**
 * Parse a pasted Discord message link into its channel/message components.
 * Handles both full links (.../channels/<guild>/<channel>/<message>) and
 * channel-only links (.../channels/<guild>/<channel>). Returns nulls for
 * anything that isn't a recognizable Discord link — use `isDiscordSnowflake`
 * to handle a bare pasted ID separately, since a raw ID is ambiguous
 * (channel vs. message vs. thread) without link context.
 */
export function parseDiscordMessageLink(input: string): { channelId: string | null; messageId: string | null } {
  const trimmed = input.trim();
  const full = trimmed.match(/channels\/\d+\/(\d+)\/(\d+)/);
  if (full) return { channelId: full[1], messageId: full[2] };
  const channelOnly = trimmed.match(/channels\/\d+\/(\d+)\/?$/);
  if (channelOnly) return { channelId: channelOnly[1], messageId: null };
  return { channelId: null, messageId: null };
}

export function isDiscordSnowflake(input: string): boolean {
  return /^\d{15,25}$/.test(input.trim());
}

/**
 * Resolve a "Post To" destination: a pasted message link or raw channel/
 * thread ID overrides where to post, an empty input falls back to a fixed
 * channel (typically an env var). Shared by every posting flow that lets an
 * admin redirect a post instead of always using one hardcoded channel.
 */
export function resolvePostDestination(input: string | undefined | null, fallbackChannelId: string | undefined | null): string | null {
  if (typeof input === "string" && input.trim()) {
    const { channelId } = parseDiscordMessageLink(input);
    if (channelId) return channelId;
    if (isDiscordSnowflake(input)) return input.trim();
    return null;
  }
  return fallbackChannelId ?? null;
}

export interface PollOption {
  answerId: number;
  text: string;
}

/**
 * Create a native Discord poll message. Discord assigns each answer's
 * answer_id in the response and explicitly says not to rely on array order
 * to map it back to what was submitted — so we match by poll_media.text
 * instead of by index.
 */
export async function createPoll(
  channelId: string,
  question: string,
  answerTexts: string[],
  durationHours: number,
  allowMultiselect: boolean
): Promise<{ messageId: string; options: PollOption[] }> {
  const resolvedQuestion = await resolveEmoteShorthand(question);
  const resolvedAnswers = await Promise.all(answerTexts.map((text) => resolveEmoteShorthand(text)));

  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      poll: {
        question: { text: resolvedQuestion },
        answers: resolvedAnswers.map((text) => ({ poll_media: { text } })),
        duration: durationHours,
        allow_multiselect: allowMultiselect,
        layout_type: 1,
      },
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Discord API error creating poll: ${res.status} ${error}`);
  }

  const message = await res.json();
  await recordBotPost({ channelId, messageId: message.id, content: [resolvedQuestion, ...resolvedAnswers.map((a) => `• ${a}`)].join("\n"), label: question, hasPoll: true });
  const answers: { answer_id: number; poll_media: { text: string } }[] = message.poll?.answers ?? [];

  // Match against Discord's response using the resolved text (what was
  // actually sent), but return the original admin-authored text so the UI
  // never has to show raw <:name:id> syntax back.
  const options: PollOption[] = answerTexts.map((originalText, i) => {
    const match = answers.find((a) => a.poll_media?.text === resolvedAnswers[i]);
    return { answerId: match?.answer_id ?? -1, text: originalText };
  });

  return { messageId: message.id, options };
}

/**
 * Fetch a message that has a poll on it, so the caller can read
 * `.poll.results.answer_counts` / `.poll.results.is_finalized`.
 */
export async function getPollMessage(channelId: string, messageId: string) {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Discord API error fetching poll message: ${res.status} ${error}`);
  }

  return res.json();
}

/** End a poll early. Cannot be undone — Discord does not allow restarting an ended poll. */
export async function endPoll(channelId: string, messageId: string) {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/polls/${messageId}/expire`, {
    method: "POST",
    headers: getHeaders(),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Discord API error ending poll: ${res.status} ${error}`);
  }

  return res.json();
}

export async function getDiscordEvents() {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) throw new Error("DISCORD_GUILD_ID not set");

  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/scheduled-events`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Discord API error: ${res.status} ${error}`);
  }

  return res.json();
}

/** Fetches one message (any kind), e.g. to load a bot post for editing. */
export async function getChannelMessage(channelId: string, messageId: string) {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}`, { headers: getHeaders() });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Discord API error fetching message: ${res.status} ${error}`);
  }
  return res.json();
}

/** A channel or thread's name, type and parent, or null if it can't be read. */
export async function getChannelInfo(channelId: string): Promise<{ id: string; name: string; type: number; parent_id: string | null } | null> {
  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}`, { headers: getHeaders() });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

/** Renames a thread or forum post. */
export async function renameThread(threadId: string, name: string) {
  const res = await fetch(`${DISCORD_API}/channels/${threadId}`, { method: "PATCH", headers: getHeaders(), body: JSON.stringify({ name: name.slice(0, 100) }) });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Discord API error renaming thread: ${res.status} ${error}`);
  }
  return res.json();
}

let botUserId: string | null = null;
/** The bot's own user id (only its messages can be edited). */
export async function getBotUserId(): Promise<string> {
  if (botUserId) return botUserId;
  const res = await fetch(`${DISCORD_API}/users/@me`, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Discord API error: ${res.status} ${await res.text()}`);
  botUserId = (await res.json()).id as string;
  return botUserId;
}
