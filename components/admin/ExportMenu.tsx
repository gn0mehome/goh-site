"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { downloadXlsx, slugifyFilename, type ExportSheet } from "@/lib/export-xlsx";

/**
 * "Export" button for admin dashboards: a picture of the dashboard (PNG, for
 * Discord), an Excel workbook of its tables, or the browser's print dialog
 * (Save as PDF). While exporting, anything marked data-export-hide (filters,
 * buttons) is hidden and anything marked data-export-only (a title bar) is
 * shown; print does the same through globals.css.
 */
export function ExportMenu({
  title,
  captureRef,
  sheets,
}: {
  /** Used for the file names, e.g. "SOTW & BotW Insights". */
  title: string;
  /** The part of the page the picture is taken of. */
  captureRef: RefObject<HTMLElement | null>;
  /** The workbook's sheets, built when Excel is picked (so they match the current filters). */
  sheets: () => ExportSheet[];
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const base = `${slugifyFilename(`gn0me-home ${title}`)}-${new Date().toISOString().slice(0, 10)}`;

  const png = async () => {
    const node = captureRef.current;
    if (!node) return;
    setBusy("Making the picture…");
    setError(null);
    node.classList.add("exporting");
    try {
      // Let the title bar appear and charts settle before the picture is taken.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const { toPng } = await import("html-to-image");
      const bg = getComputedStyle(document.body).backgroundColor;
      const url = await toPng(node, { pixelRatio: 2, backgroundColor: bg, cacheBust: true, filter: (el) => !(el instanceof HTMLElement && el.dataset.exportHide !== undefined) });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${base}.png`;
      a.click();
    } catch {
      setError("Couldn't make the picture. Try Print / Save as PDF instead.");
    } finally {
      node.classList.remove("exporting");
      setBusy(null);
    }
  };

  const excel = () => {
    setError(null);
    try {
      downloadXlsx(base, sheets());
    } catch {
      setError("Couldn't build the spreadsheet.");
    }
  };

  const pick = (fn: () => void | Promise<void>) => {
    setOpen(false);
    void fn();
  };

  const item = "w-full text-left px-3 py-2 text-sm text-bark-brown hover:bg-parchment-dark/60 flex flex-col";
  return (
    <div ref={box} className="relative inline-block" data-export-hide>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={!!busy}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md border border-bark-brown-light bg-parchment px-3 py-1.5 text-sm font-semibold text-bark-brown hover:bg-parchment-dark/60 disabled:opacity-60"
      >
        <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor" aria-hidden>
          <path d="M10 2a1 1 0 0 1 1 1v7.6l2.3-2.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 1.4-1.4L9 10.6V3a1 1 0 0 1 1-1ZM4 15a1 1 0 0 1 1 1v1h10v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z" />
        </svg>
        {busy ?? "Export"}
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-64 overflow-hidden rounded-md border border-bark-brown-light bg-parchment shadow-xl">
          <button type="button" role="menuitem" className={item} onClick={() => pick(png)}>
            <span className="font-semibold">Picture (PNG)</span>
            <span className="text-xs text-iron-grey">The dashboard as an image, ready for Discord.</span>
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => pick(excel)}>
            <span className="font-semibold">Spreadsheet (Excel)</span>
            <span className="text-xs text-iron-grey">Every table as its own sheet, with the current filters.</span>
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => pick(() => window.print())}>
            <span className="font-semibold">Print / Save as PDF</span>
            <span className="text-xs text-iron-grey">A clean printable report. Pick &quot;Save as PDF&quot; as the printer.</span>
          </button>
        </div>
      )}
      {error && <p className="absolute right-0 mt-1 w-64 text-xs text-red-accent">{error}</p>}
    </div>
  );
}

/** A title bar that only shows in exported pictures and printouts. */
export function ExportHeader({ title, detail }: { title: string; detail?: string }) {
  return (
    <div data-export-only className="mb-4 border-b-2 border-gold pb-2">
      <p className="font-display text-2xl text-gnome-green">Gn0me Home · {title}</p>
      <p className="text-xs text-iron-grey">
        {detail ? `${detail} · ` : ""}Exported {new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })} from gn0mehome.com
      </p>
    </div>
  );
}
