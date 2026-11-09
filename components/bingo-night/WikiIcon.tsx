/* eslint-disable @next/next/no-img-element -- tiny OSRS Wiki item pictures, shown as is */
"use client";

import { useState } from "react";

/** An OSRS Wiki item picture, kept crisp when scaled up; hides itself if it fails to load. */
export function WikiIcon({ src, size, className = "", style }: { src: string | null | undefined; size: number | string; className?: string; style?: React.CSSProperties }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return null;
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={`inline-block object-contain shrink-0 ${className}`}
      style={{ width: size, height: size, imageRendering: "pixelated", ...style }}
    />
  );
}
