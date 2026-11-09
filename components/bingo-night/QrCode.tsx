"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** A QR code for `url`, drawn as crisp SVG. Dark on light so phones can always scan it. */
export function QrCode({ url, size = 200, className = "" }: { url: string; size?: number; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let cancel = false;
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1b1209", light: "#ffffff" } })
      .then((s) => !cancel && setSvg(s))
      .catch(() => !cancel && setSvg(null));
    return () => {
      cancel = true;
    };
  }, [url]);
  return (
    <div
      className={className}
      style={{ width: size, height: size, background: "#fff", borderRadius: size * 0.06, padding: size * 0.04 }}
      role="img"
      aria-label={`QR code for ${url}`}
      // The SVG comes from the qrcode library, built only from the URL string.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}

/** Saves a large PNG of the QR code, for posting in Discord or printing. */
export async function downloadQrPng(url: string, filename: string) {
  const dataUrl = await QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: "M", color: { dark: "#1b1209", light: "#ffffff" } });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
