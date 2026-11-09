"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { QrCode, downloadQrPng } from "@/components/bingo-night/QrCode";

type Target = "bingo" | "site" | "custom";

/**
 * An invite QR code: the Bingo Night page (to join the game), the site's
 * homepage, or any link. Copy the link, save a PNG to post in Discord, or
 * show it big on screen for people to scan.
 */
export function InviteQr({ className = "" }: { className?: string }) {
  const [origin, setOrigin] = useState("https://gn0mehome.com");
  const [target, setTarget] = useState<Target>("bingo");
  const [custom, setCustom] = useState("");
  const [big, setBig] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const customOk = /^https?:\/\/\S+\.\S+/.test(custom.trim());
  const url = target === "bingo" ? `${origin}/bingo-night` : target === "site" ? `${origin}/` : customOk ? custom.trim() : "";
  const shown = url.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the link is on screen to copy by hand */
    }
  };

  return (
    <Card hover={false} className={`space-y-3 ${className}`}>
      <h2 className="font-display text-xl text-bark-brown">Invite with a QR code</h2>
      <div className="flex flex-wrap gap-4 text-sm" role="radiogroup" aria-label="Where the QR code goes">
        {(
          [
            ["bingo", "Bingo Night (join the game)"],
            ["site", "The website"],
            ["custom", "Another link"],
          ] as [Target, string][]
        ).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={target === k} onChange={() => setTarget(k)} className="accent-gnome-green" />
            {label}
          </label>
        ))}
      </div>
      {target === "custom" && (
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="https://discord.gg/..."
          className="w-full px-3 py-2 rounded-md border border-bark-brown-light bg-parchment text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-gnome-green"
        />
      )}
      {url ? (
        <div className="flex flex-wrap items-center gap-5">
          <QrCode url={url} size={180} className="shadow-sm border border-bark-brown-light/40" />
          <div className="space-y-2 min-w-0">
            <p className="font-semibold text-bark-brown break-all">{shown}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={copy}>
                {copied ? "Copied!" : "Copy link"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => downloadQrPng(url, target === "bingo" ? "bingo-night-qr.png" : target === "site" ? "gn0mehome-qr.png" : "qr-code.png")}>
                Save as image
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setBig(true)}>
                Show full screen
              </Button>
            </div>
            <p className="text-xs text-iron-grey">Post the image in Discord, or show it full screen on stream for people to scan with their phone camera.</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-iron-grey">Paste a full link starting with https://</p>
      )}

      {big && url && (
        <button type="button" onClick={() => setBig(false)} className="fixed inset-0 z-[300] bg-black/85 flex flex-col items-center justify-center gap-6 cursor-zoom-out" aria-label="Close the QR code">
          <QrCode url={url} size={Math.min(560, typeof window !== "undefined" ? Math.min(window.innerWidth, window.innerHeight) - 160 : 560)} />
          <p className="text-white font-display text-3xl">{shown}</p>
          <p className="text-white/70 text-sm">Click anywhere to close</p>
        </button>
      )}
    </Card>
  );
}
