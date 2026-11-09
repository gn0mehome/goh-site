"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import { Button } from "@/components/ui/Button";
import { useIsStaff } from "@/lib/use-is-staff";
import { CheckInCodeControl } from "@/components/events/CheckInCodeControl";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  color?: string;
  extendedProps?: {
    eventType: string;
    hostRsn?: string;
    world?: number;
    description?: string;
    location?: string;
    meetLocation?: string;
    spots?: string;
    signupType?: string;
    voiceChannel?: string;
    prizePool?: string;
    requirements?: string;
    requirementsList?: string;
    requiresCode?: boolean;
    isCompetition?: boolean;
    metric?: string;
    competitionType?: string;
    womUrl?: string;
  };
}

interface EventCalendarProps {
  events: CalendarEvent[];
  /** Opens this event's details on load and shows its month (from /events?event=<id>). */
  initialEventId?: string;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  pvm: "#8B1A1A",
  skilling: "#2D5016",
  drop_party: "#DAA520",
  hide_seek: "#4A7C23",
  social: "#3E2B1C",
  competition: "#5D3A9E",
  other: "#6B6B6B",
};

/** Skill / Boss of the Week (and other WOM competitions) in the month view: a thin line across the week, named in the left column. */
const WEEKLY_COLORS = { sotw: "#2E7D6B", botw: "#5D3A9E", other: "#8A6A12" } as const;
type WeeklyKind = keyof typeof WEEKLY_COLORS;

function weeklyInfo(title: string): { kind: WeeklyKind; tag: string; name: string } {
  const clean = title.replace(/^🏆\s*/, "");
  const parts = clean.split("|").map((p) => p.trim());
  if (/^skill of the week/i.test(clean)) return { kind: "sotw", tag: "Skill of the Week", name: parts[parts.length - 1] || clean };
  if (/^boss of the week/i.test(clean)) return { kind: "botw", tag: "Boss of the Week", name: parts[parts.length - 1] || clean };
  return { kind: "other", tag: "Competition", name: clean };
}

/** Local YYYY-MM-DD for a time. */
function localDay(t: string | number | Date): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A competition as whole days: the day it starts up to (not including) the day it ends, so a Sunday-to-Sunday week fills one row. */
function competitionDays(e: { start: string; end?: string }): { start: string; end: string } {
  const start = localDay(e.start);
  let end = localDay(e.end ?? e.start);
  if (end <= start) end = localDay(new Date(`${start}T12:00:00`).getTime() + 86_400_000);
  return { start, end };
}

interface WeekRow {
  /** First day shown in the row (YYYY-MM-DD). */
  date: string;
  top: number;
  height: number;
}

const FILTER_TYPES: { key: string; label: string; color: string }[] = [
  { key: "pvm", label: "PvM", color: "#8B1A1A" },
  { key: "skilling", label: "Skilling", color: "#2D5016" },
  { key: "drop_party", label: "Drop Party", color: "#DAA520" },
  { key: "hide_seek", label: "Hide & Seek", color: "#4A7C23" },
  { key: "social", label: "Social", color: "#3E2B1C" },
  { key: "competition", label: "Competitions", color: "#5D3A9E" },
];

export function EventCalendar({ events, initialEventId }: EventCalendarProps) {
  const initialEvent = initialEventId ? events.find((e) => e.id === initialEventId) ?? null : null;
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(initialEvent);
  const [linkCopied, setLinkCopied] = useState(false);
  const isStaff = useIsStaff();
  // Empty = nothing hidden = every type shown by default; clicking a legend
  // chip toggles that type out (or back in) rather than the other way
  // around, so filtering is something you opt into, not a default limit.
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());

  const toggleType = (key: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleCopyCheckInLink = async (eventId: string) => {
    const url = `${window.location.origin}/events/${eventId}/signup`;
    await navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const closeEvent = () => {
    setSelectedEvent(null);
    // Drop ?event= so a refresh doesn't pop the same event open again.
    const url = new URL(window.location.href);
    if (url.searchParams.has("event")) {
      url.searchParams.delete("event");
      window.history.replaceState(null, "", url);
    }
  };

  const visibleEvents = events.filter(
    (e) => !hiddenTypes.has(e.extendedProps?.eventType ?? "other")
  );

  const coloredEvents = visibleEvents.map((e) =>
    e.extendedProps?.isCompetition
      ? { ...e, ...competitionDays(e), allDay: true, color: WEEKLY_COLORS[weeklyInfo(e.title).kind] }
      : { ...e, color: e.color ?? EVENT_TYPE_COLORS[e.extendedProps?.eventType ?? "other"] ?? "#6B6B6B" },
  );

  // Month view: where each week row sits, so the left column can line up with it.
  const shell = useRef<HTMLDivElement>(null);
  const [isMonth, setIsMonth] = useState(true);
  const [rows, setRows] = useState<WeekRow[]>([]);
  const [shellHeight, setShellHeight] = useState(0);
  const measure = useCallback(() => {
    const root = shell.current;
    if (!root) return;
    const base = root.getBoundingClientRect().top;
    const trs = [...root.querySelectorAll<HTMLTableRowElement>(".fc-daygrid-body tbody tr")];
    setRows(
      trs
        .map((tr) => {
          const first = tr.querySelector<HTMLElement>("td[data-date]");
          const r = tr.getBoundingClientRect();
          return first ? { date: first.dataset.date!, top: r.top - base, height: r.height } : null;
        })
        .filter((x): x is WeekRow => !!x),
    );
    setShellHeight(root.getBoundingClientRect().height);
  }, []);
  const scheduleMeasure = useCallback(() => requestAnimationFrame(measure), [measure]);
  useEffect(() => {
    const root = shell.current;
    if (!root) return;
    const ro = new ResizeObserver(scheduleMeasure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [scheduleMeasure]);

  const competitions = visibleEvents.filter((e) => e.extendedProps?.isCompetition).map((e) => ({ event: e, ...competitionDays(e) }));
  const weekLabels = (row: WeekRow) => {
    const to = localDay(new Date(`${row.date}T12:00:00`).getTime() + 7 * 86_400_000);
    return competitions
      .filter((c) => c.start < to && c.end > row.date)
      .map((c) => ({ event: c.event, ...weeklyInfo(c.event.title) }))
      .sort((a, b) => a.kind.localeCompare(b.kind));
  };
  const openEvent = (e: CalendarEvent) => {
    setSelectedEvent(e);
    setLinkCopied(false);
  };

  return (
    <div>
      {/* Legend / filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTER_TYPES.map((type) => {
          const active = !hiddenTypes.has(type.key);
          return (
            <button
              key={type.key}
              onClick={() => toggleType(type.key)}
              className={`flex items-center gap-2 text-sm px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                active
                  ? "border-transparent bg-parchment-dark text-bark-brown"
                  : "border-parchment-dark text-iron-grey opacity-50"
              }`}
              title={active ? `Hide ${type.label}` : `Show ${type.label}`}
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: type.color }}
              />
              {type.label}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 sm:gap-3">
        {isMonth && (
          <div className="relative w-20 sm:w-36 shrink-0" style={{ height: shellHeight }} aria-label="Skill and Boss of the Week">
            {rows.map((row) => {
              const labels = weekLabels(row);
              if (!labels.length) return null;
              return (
                <div key={row.date} className="absolute inset-x-0 flex flex-col justify-center gap-1 py-1 overflow-hidden" style={{ top: row.top, height: row.height }}>
                  {labels.map((l) => (
                    <button
                      key={l.event.id}
                      type="button"
                      onClick={() => openEvent(l.event)}
                      className="text-left rounded-r-md pl-2 pr-1 py-0.5 border-l-4 bg-parchment-dark/60 hover:bg-parchment-dark cursor-pointer"
                      style={{ borderColor: WEEKLY_COLORS[l.kind] }}
                      title={l.event.title.replace(/^🏆\s*/, "")}
                    >
                      <span className="block text-[10px] sm:text-[11px] uppercase tracking-wide text-iron-grey leading-tight">
                        <span className="sm:hidden">{l.kind === "other" ? "Comp" : l.kind.toUpperCase()}</span>
                        <span className="hidden sm:inline">{l.tag}</span>
                      </span>
                      <span className="block text-xs sm:text-sm font-semibold text-bark-brown leading-tight truncate">{l.name}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      <div className="fc-gnome flex-1 min-w-0" ref={shell}>
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
          initialView="dayGridMonth"
          initialDate={initialEvent?.start}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,listWeek",
          }}
          events={coloredEvents}
          eventClick={(info) => {
            const event = visibleEvents.find((e) => e.id === info.event.id);
            if (event) openEvent(event);
          }}
          height="auto"
          eventDisplay="block"
          datesSet={(arg) => {
            setIsMonth(arg.view.type === "dayGridMonth");
            scheduleMeasure();
          }}
          eventsSet={scheduleMeasure}
          // Month view: competitions are a thin line across the week (named in the left column).
          eventClassNames={(arg) => (arg.view.type === "dayGridMonth" && arg.event.extendedProps.isCompetition ? ["fc-week-line"] : [])}
          eventDidMount={(arg) => {
            if (arg.view.type === "dayGridMonth" && arg.event.extendedProps.isCompetition) arg.el.title = arg.event.title.replace(/^🏆\s*/, "");
          }}
        />
      </div>
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={closeEvent}
        >
          <div
            className="card-wood max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl text-gnome-green">
                {selectedEvent.title}
              </h3>
              <button
                onClick={closeEvent}
                className="text-iron-grey hover:text-bark-brown cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {selectedEvent.extendedProps?.isCompetition ? (
              <>
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="text-iron-grey">Period: </span>
                    {new Date(selectedEvent.start).toLocaleDateString()}
                    {selectedEvent.end && ` — ${new Date(selectedEvent.end).toLocaleDateString()}`}
                  </p>
                  {selectedEvent.extendedProps.metric && (
                    <p>
                      <span className="text-iron-grey">Metric: </span>
                      <span className="capitalize">{selectedEvent.extendedProps.metric.replace(/_/g, " ")}</span>
                    </p>
                  )}
                  {selectedEvent.extendedProps.competitionType && (
                    <p>
                      <span className="text-iron-grey">Type: </span>
                      <span className="capitalize">{selectedEvent.extendedProps.competitionType}</span>
                    </p>
                  )}
                </div>
                {selectedEvent.extendedProps.womUrl && (
                  <a
                    href={selectedEvent.extendedProps.womUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block mt-4"
                  >
                    <Button className="w-full">View on Wise Old Man</Button>
                  </a>
                )}
              </>
            ) : (
              <>
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="text-iron-grey">When: </span>
                    {new Date(selectedEvent.start).toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  {selectedEvent.extendedProps?.hostRsn && (
                    <p>
                      <span className="text-iron-grey">Host: </span>
                      <span className="font-mono">{selectedEvent.extendedProps.hostRsn}</span>
                    </p>
                  )}
                  {selectedEvent.extendedProps?.world && (
                    <p>
                      <span className="text-iron-grey">World: </span>
                      {selectedEvent.extendedProps.world}
                    </p>
                  )}
                  {selectedEvent.extendedProps?.location && (
                    <p>
                      <span className="text-iron-grey">Location: </span>
                      {selectedEvent.extendedProps.location}
                    </p>
                  )}
                  {selectedEvent.extendedProps?.meetLocation && (
                    <p>
                      <span className="text-iron-grey">Meet: </span>
                      {selectedEvent.extendedProps.meetLocation}
                    </p>
                  )}
                  {selectedEvent.extendedProps?.spots && (
                    <p>
                      <span className="text-iron-grey">Spots: </span>
                      {selectedEvent.extendedProps.spots}
                    </p>
                  )}
                  {selectedEvent.extendedProps?.signupType && (
                    <p>
                      <span className="text-iron-grey">Signup: </span>
                      {selectedEvent.extendedProps.signupType}
                    </p>
                  )}
                  {selectedEvent.extendedProps?.voiceChannel && (
                    <p>
                      <span className="text-iron-grey">Voice: </span>
                      {selectedEvent.extendedProps.voiceChannel}
                    </p>
                  )}
                  {selectedEvent.extendedProps?.prizePool && (
                    <p>
                      <span className="text-iron-grey">Prize Pool: </span>
                      {selectedEvent.extendedProps.prizePool}
                    </p>
                  )}
                  {selectedEvent.extendedProps?.description && (
                    <p className="text-bark-brown-light mt-3">
                      {selectedEvent.extendedProps.description}
                    </p>
                  )}
                  {selectedEvent.extendedProps?.requirements && (
                    <p className="text-bark-brown-light mt-2">
                      <span className="text-iron-grey">Requirements: </span>
                      {selectedEvent.extendedProps.requirements}
                    </p>
                  )}
                </div>
                <a href={`/events/${selectedEvent.id}/signup`} className="block mt-4">
                  <Button className="w-full">Check In</Button>
                </a>
                {isStaff && (
                  <Button
                    variant="ghost"
                    className="w-full mt-2"
                    onClick={() => handleCopyCheckInLink(selectedEvent.id)}
                  >
                    {linkCopied ? "Copied!" : "Copy Check-In Link"}
                  </Button>
                )}
                {isStaff && <CheckInCodeControl key={selectedEvent.id} eventId={selectedEvent.id} className="mt-2" />}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
