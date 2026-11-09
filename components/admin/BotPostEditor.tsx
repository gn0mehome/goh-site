"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { BotPost } from "@/lib/bot-posts";

interface LiveMessage {
  channelId: string;
  messageId: string;
  content: string;
  label: string | null;
  isPoll: boolean;
  images: number;
  channelName: string | null;
  threadTitle: string | null;
  url: string;
}

const MAX = 2000;
const inputClass = "w-full px-3 py-2 rounded-md border border-bark-brown-light bg-parchment text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-gnome-green";
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const SOURCE_LABEL: Record<string, string> = {
  weekly_forum: "Weekly thread",
  weekly_results: "Weekly results",
  weekly_raffle: "Raffle winners",
  weekly_poll: "Voting poll",
  weekly_announce: "New competition",
};

/**
 * Find a message the bot posted and fix its text in place. `scope="weekly"`
 * lists only the weekly SOTW/BotW posts (for that page); without it, every
 * post the bot has made since the log started.
 */
export function BotPostEditor({ scope, className = "" }: { scope?: "weekly"; className?: string }) {
  const [posts, setPosts] = useState<BotPost[] | null>(null);
  const [guildId, setGuildId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [editing, setEditing] = useState<LiveMessage | null>(null);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadList = useCallback(async (q = "") => {
    const params = new URLSearchParams({ limit: scope ? "15" : "50" });
    if (scope) params.set("scope", scope);
    if (q) params.set("q", q);
    const res = await fetch(`/api/admin/bot-posts?${params}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setPosts(data.posts ?? []);
      setGuildId(data.guildId ?? null);
    } else setPosts([]);
  }, [scope]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadList();
  }, [loadList]);

  const open = async (key: string, query: Record<string, string>) => {
    setLoading(key);
    setMessage(null);
    const res = await fetch(`/api/admin/bot-posts?${new URLSearchParams(query)}`);
    const data = await res.json().catch(() => ({}));
    setLoading(null);
    if (!res.ok) return setMessage({ ok: false, text: data.error ?? "Couldn't load that message." });
    setEditing(data);
    setDraft(data.content);
    setTitle(data.threadTitle ?? "");
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/admin/bot-posts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: editing.channelId, messageId: editing.messageId, content: draft, threadTitle: editing.threadTitle != null ? title : undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setMessage({ ok: false, text: data.error ?? "Discord didn't accept the edit." });
    setMessage({ ok: true, text: "Saved. The message is updated in Discord." });
    setEditing(null);
    void loadList(search);
  };

  const changed = editing && (draft !== editing.content || (editing.threadTitle != null && title.trim() !== editing.threadTitle));
  const discordUrl = (p: BotPost) => `https://discord.com/channels/${guildId ?? "@me"}/${p.channel_id}/${p.message_id}`;

  return (
    <Card hover={false} className={`space-y-4 ${className}`}>
      <div>
        <h2 className="font-display text-xl text-bark-brown">{scope === "weekly" ? "Edit a weekly post" : "Edit a bot post"}</h2>
        <p className="text-sm text-bark-brown-light mt-1">
          Discord only lets the bot change what it posted, so fix typos here. Pick a post below, or paste a message link (in Discord, right-click the message, then Copy Message Link).
          Editing doesn&apos;t ping anyone again, and images stay as they are.
        </p>
      </div>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (link.trim()) void open("link", { link: link.trim() });
        }}
      >
        <input type="text" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://discord.com/channels/..." className={`${inputClass} flex-1 min-w-[16rem]`} aria-label="Discord message link" />
        <Button size="sm" type="submit" disabled={!link.trim() || loading === "link"}>
          {loading === "link" ? "Loading..." : "Load message"}
        </Button>
      </form>

      {message && <p className={`text-sm ${message.ok ? "text-gnome-green" : "text-red-accent"}`}>{message.text}</p>}

      {editing && (
        <div className="rounded-md border-2 border-gnome-green/40 p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-bark-brown">
              {editing.label ?? "Bot post"}
              {editing.channelName && editing.channelName !== editing.threadTitle && <span className="text-xs text-iron-grey font-normal"> · #{editing.channelName}</span>}
            </p>
            <a href={editing.url} target="_blank" rel="noopener noreferrer" className="text-xs text-gnome-green hover:underline">
              Open in Discord →
            </a>
          </div>
          {editing.isPoll ? (
            <p className="text-sm text-bark-brown">
              This is a poll, and Discord doesn&apos;t allow polls to be changed once they&apos;re posted. To fix one, delete it in Discord and post a new one.
            </p>
          ) : (
            <>
              {editing.threadTitle != null && (
                <label className="block text-sm text-bark-brown">
                  Post title
                  <input type="text" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} className={`${inputClass} mt-1`} />
                </label>
              )}
              <label className="block text-sm text-bark-brown">
                Message
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={Math.min(18, Math.max(6, draft.split("\n").length + 1))} className={`${inputClass} mt-1 font-mono text-[13px]`} />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" onClick={save} disabled={saving || !changed || draft.length > MAX}>
                  {saving ? "Saving..." : "Save to Discord"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
                  Cancel
                </Button>
                <span className={`text-xs ml-auto ${draft.length > MAX ? "text-red-accent font-semibold" : "text-iron-grey"}`}>
                  {draft.length}/{MAX}
                </span>
              </div>
              {editing.images > 0 && <p className="text-xs text-iron-grey">This message has {editing.images === 1 ? "an image" : `${editing.images} images`}; they stay as they are.</p>}
            </>
          )}
        </div>
      )}

      <div className="space-y-2">
        {!scope && (
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              void loadList(e.target.value.trim());
            }}
            placeholder="Search posts..."
            className={inputClass}
            aria-label="Search bot posts"
          />
        )}
        {posts === null ? (
          <p className="text-sm text-iron-grey">Loading...</p>
        ) : posts.length === 0 ? (
          <p className="text-sm text-iron-grey">
            {search ? "Nothing matches that." : "No posts yet. Posts the bot makes from now on show up here; for older ones, paste the message link above."}
          </p>
        ) : (
          <ul className="divide-y divide-bark-brown-light/30">
            {posts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-bark-brown truncate">
                    {p.has_poll && "📊 "}
                    {p.label || "Bot post"}
                  </p>
                  <p className="text-xs text-iron-grey">
                    {p.source && SOURCE_LABEL[p.source] ? `${SOURCE_LABEL[p.source]} · ` : ""}
                    Posted {when(p.created_at)}
                    {p.edited_at && ` · edited ${when(p.edited_at)}${p.edited_by ? ` by ${p.edited_by}` : ""}`}
                  </p>
                </div>
                <a href={discordUrl(p)} target="_blank" rel="noopener noreferrer" className="text-xs text-gnome-green hover:underline">
                  View
                </a>
                {!p.has_poll && (
                  <Button size="sm" variant="ghost" disabled={loading === p.id} onClick={() => open(p.id, { link: discordUrl(p) })}>
                    {loading === p.id ? "Loading..." : "Edit"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
