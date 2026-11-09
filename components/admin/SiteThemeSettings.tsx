"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ThemePicker } from "@/components/theme/ThemePicker";
import type { SiteThemeChoice } from "@/lib/site-theme";

/** Admin › Settings › Site Theme: the site's default theme. */
export function SiteThemeSettings() {
  const [saved, setSaved] = useState<SiteThemeChoice | null>(null);
  const [choice, setChoice] = useState<SiteThemeChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void fetch("/api/admin/site-theme")
      .then((r) => r.json())
      .then((d) => {
        setSaved(d.theme ?? "gnome");
        setChoice(d.theme ?? "gnome");
      })
      .catch(() => setMessage({ ok: false, text: "Couldn't load the current theme." }));
  }, []);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/site-theme", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme: choice }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage({ ok: false, text: data.error ?? "Couldn't save." });
    setSaved(choice);
    setMessage({ ok: true, text: "Saved. Everyone sees it on their next page load (unless they picked their own theme)." });
  };

  if (!choice) return <p className="text-sm text-iron-grey">{message?.text ?? "Loading..."}</p>;
  return (
    <Card hover={false} className="space-y-4">
      <p className="text-sm text-bark-brown-light">Click a theme to try it on this page. Nothing changes for anyone else until you save.</p>
      <ThemePicker value={choice} onChange={(v) => v && setChoice(v)} />
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={busy || choice === saved}>
          {busy ? "Saving..." : "Save site theme"}
        </Button>
        {choice !== saved && (
          <Button variant="ghost" onClick={() => setChoice(saved)}>
            Undo
          </Button>
        )}
        {message && <span className={`text-sm ${message.ok ? "text-gnome-green" : "text-red-accent"}`}>{message.text}</span>}
      </div>
    </Card>
  );
}
