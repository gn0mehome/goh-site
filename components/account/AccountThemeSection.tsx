"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ThemePicker } from "@/components/theme/ThemePicker";
import { SITE_THEMES, resolveTheme, type SiteThemeChoice } from "@/lib/site-theme";

/** My Account › Site theme: your own theme, or follow the clan's. */
export function AccountThemeSection() {
  const [loaded, setLoaded] = useState(false);
  const [siteChoice, setSiteChoice] = useState<SiteThemeChoice>("gnome");
  const [saved, setSaved] = useState<SiteThemeChoice | null>(null);
  const [choice, setChoice] = useState<SiteThemeChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void fetch("/api/account/site-theme")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setSiteChoice(d.siteChoice);
          setSaved(d.userChoice);
          setChoice(d.userChoice);
        }
        setLoaded(true);
      });
  }, []);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/account/site-theme", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme: choice }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage({ ok: false, text: data.error ?? "Couldn't save." });
    setSaved(choice);
    setMessage({ ok: true, text: "Saved." });
  };

  if (!loaded) return null;
  const siteNow = SITE_THEMES[resolveTheme(siteChoice)].name;
  return (
    <div className="max-w-4xl mx-auto px-4 pb-12">
      <Card hover={false} className="space-y-4">
        <div>
          <h2 className="font-display text-2xl text-gnome-green">Site theme</h2>
          <p className="text-sm text-bark-brown-light">
            Pick the colours you see on the site, or keep Default to go with the clan&apos;s choice. Light or dark is the moon button in the menu, and every theme has
            both.
          </p>
        </div>
        <ThemePicker
          value={choice}
          onChange={setChoice}
          siteChoice={siteChoice}
          defaultLabel={siteChoice === "auto" ? `What the clan uses: changes with the holidays (now ${siteNow})` : `What the clan uses: ${siteNow}`}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={busy || choice === saved}>
            {busy ? "Saving..." : "Save my theme"}
          </Button>
          {message && <span className={`text-sm ${message.ok ? "text-gnome-green" : "text-red-accent"}`}>{message.text}</span>}
        </div>
      </Card>
    </div>
  );
}
