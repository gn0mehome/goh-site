"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmojiPickerButton } from "@/components/admin/EmojiPickerButton";
import { ChannelSelector } from "@/components/admin/ChannelSelector";
import { downloadXlsx, slugifyFilename, type SheetCell } from "@/lib/export-xlsx";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface Poll {
  id: string;
  question: string;
  options: { answer_id: number; text: string }[];
  allow_multiselect: boolean;
  duration_hours: number;
  created_by: string | null;
  created_at: string;
}

interface PollResults {
  question: string;
  options: { text: string; count: number }[];
  totalVotes: number;
  isFinalized: boolean;
  allowMultiselect: boolean;
  available: boolean;
  discordMessageUrl: string | null;
}

const DURATION_PRESETS = [
  { label: "1 Day", hours: 24 },
  { label: "3 Days", hours: 72 },
  { label: "1 Week", hours: 168 },
  { label: "2 Weeks", hours: 336 },
];

function exportPollResults(results: PollResults) {
  const summaryRows: SheetCell[][] = [
    ["Question", results.question],
    ["Total Votes", results.totalVotes],
    ["Status", results.isFinalized ? "Closed" : "Open"],
    ["Allows Multiple Choices", results.allowMultiselect ? "Yes" : "No"],
  ];
  const resultsRows: SheetCell[][] = [
    ["Option", "Votes", "Share"],
    ...results.options.map((o) => [o.text, o.count, results.totalVotes > 0 ? `${Math.round((o.count / results.totalVotes) * 100)}%` : "0%"] as SheetCell[]),
  ];

  downloadXlsx(`poll-${slugifyFilename(results.question)}`, [
    { name: "Summary", rows: summaryRows },
    { name: "Results", rows: resultsRows },
  ]);
}

const inputClass = "w-full px-3 py-2 rounded-md border border-bark-brown-light bg-parchment text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-gnome-green";
const labelClass = "block text-sm font-semibold text-bark-brown mb-1";

export default function AdminPollsPage() {
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<string[]>(["", ""]);
  const [allowMultiselect, setAllowMultiselect] = useState(false);
  const [durationHours, setDurationHours] = useState(24);
  const [destination, setDestination] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, PollResults>>({});
  const [resultsLoading, setResultsLoading] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);

  const loadPolls = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/polls");
    const data = await res.json().catch(() => ({}));
    setPolls(res.ok ? data.polls ?? [] : []);
    setLoading(false);
  }, []);

  useEffect(() => { loadPolls(); }, [loadPolls]);

  const updateAnswer = (i: number, value: string) => {
    setAnswers((prev) => prev.map((a, idx) => (idx === i ? value : a)));
  };

  const addAnswer = () => {
    if (answers.length >= 10) return;
    setAnswers((prev) => [...prev, ""]);
  };

  const removeAnswer = (i: number) => {
    if (answers.length <= 2) return;
    setAnswers((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setStatus(null);

    const res = await fetch("/api/polls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        answers: answers.filter((a) => a.trim()),
        allowMultiselect,
        durationHours,
        destination: destination || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      setStatus("Poll posted to Discord.");
      setQuestion("");
      setAnswers(["", ""]);
      setAllowMultiselect(false);
      setDurationHours(24);
      setDestination("");
      await loadPolls();
    } else {
      setError(data.error ?? "Failed to create poll.");
    }
    setSubmitting(false);
  };

  const toggleExpand = async (poll: Poll) => {
    if (expandedId === poll.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(poll.id);
    if (!results[poll.id]) {
      setResultsLoading(poll.id);
      const res = await fetch(`/api/polls/${poll.id}/results`);
      const data = await res.json().catch(() => null);
      if (data) setResults((prev) => ({ ...prev, [poll.id]: data }));
      setResultsLoading(null);
    }
  };

  const refreshResults = async (pollId: string) => {
    setResultsLoading(pollId);
    const res = await fetch(`/api/polls/${pollId}/results`);
    const data = await res.json().catch(() => null);
    if (data) setResults((prev) => ({ ...prev, [pollId]: data }));
    setResultsLoading(null);
  };

  const closePoll = async (poll: Poll) => {
    setClosingId(poll.id);
    const res = await fetch(`/api/polls/${poll.id}/close`, { method: "POST" });
    if (res.ok) {
      await refreshResults(poll.id);
    } else {
      setError("Failed to close the poll.");
    }
    setClosingId(null);
  };

  return (
    <div>
      <h1 className="font-display text-3xl text-gnome-green mb-1">Polls</h1>
      <p className="text-bark-brown-light mb-6">
        Create a native Discord poll for clan votes — members vote right in Discord, results show up here.
      </p>

      <Card hover={false} className="mb-8">
        <h3 className="font-display text-lg text-bark-brown mb-4">New Poll</h3>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-red-accent/10 border border-red-accent/30 text-sm text-red-accent">
            {error}
          </div>
        )}
        {status && (
          <div className="mb-4 p-3 rounded-md bg-gnome-green/10 border border-gnome-green/30 text-sm text-gnome-green">
            {status}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-semibold text-bark-brown">Question *</label>
              <EmojiPickerButton onInsert={(t) => setQuestion((prev) => prev + (prev ? " " : "") + t)} />
            </div>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={300}
              rows={2}
              required
              className={inputClass}
            />
            <p className="text-xs text-iron-grey mt-1">{question.length}/300</p>
          </div>

          <div>
            <label className={labelClass}>Options * (2-10)</label>
            <div className="space-y-2">
              {answers.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={a}
                    onChange={(e) => updateAnswer(i, e.target.value)}
                    maxLength={55}
                    className={inputClass}
                    placeholder={`Option ${i + 1}`}
                  />
                  <EmojiPickerButton onInsert={(t) => updateAnswer(i, a + (a ? " " : "") + t)} />
                  {answers.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeAnswer(i)}
                      className="text-red-accent text-sm px-2 shrink-0 cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            {answers.length < 10 && (
              <button
                type="button"
                onClick={addAnswer}
                className="text-xs text-gnome-green hover:underline mt-2 cursor-pointer"
              >
                + Add option
              </button>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-bark-brown cursor-pointer">
            <input
              type="checkbox"
              checked={allowMultiselect}
              onChange={(e) => setAllowMultiselect(e.target.checked)}
              className="accent-gnome-green"
            />
            Allow selecting multiple options
          </label>

          <div>
            <label className={labelClass}>Duration</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {DURATION_PRESETS.map((p) => (
                <Button
                  key={p.hours}
                  type="button"
                  size="sm"
                  variant={durationHours === p.hours ? "primary" : "ghost"}
                  onClick={() => setDurationHours(p.hours)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <input
              type="number"
              min={1}
              max={768}
              value={durationHours}
              onChange={(e) => setDurationHours(Number(e.target.value))}
              className={`${inputClass} max-w-[140px]`}
            />
            <p className="text-xs text-iron-grey mt-1">Hours (max 768 / 32 days)</p>
          </div>

          <div className="space-y-2">
            <ChannelSelector value={destination} onChange={setDestination} label="Post To (optional)" allowBlank excludeForums />
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className={`${inputClass} font-mono text-xs`}
              placeholder="Or paste a link/ID manually"
            />
          </div>

          <Button type="submit" disabled={submitting}>
            {submitting ? "Posting..." : "Post Poll to Discord"}
          </Button>
        </form>
      </Card>

      <h3 className="font-display text-lg text-bark-brown mb-4">Past Polls</h3>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-parchment-dark border-t-gnome-green rounded-full animate-spin" />
        </div>
      ) : polls.length === 0 ? (
        <Card hover={false}>
          <p className="text-sm text-iron-grey">No polls yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {polls.map((poll) => {
            const expanded = expandedId === poll.id;
            const pollResults = results[poll.id];
            const chartData = pollResults?.options ?? [];

            return (
              <Card key={poll.id} hover={false}>
                <button
                  onClick={() => toggleExpand(poll)}
                  className="w-full flex items-center justify-between gap-4 text-left cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-bark-brown truncate">{poll.question}</p>
                    <p className="text-xs text-iron-grey">
                      {new Date(poll.created_at).toLocaleDateString()}
                      {poll.created_by && <span> · by {poll.created_by}</span>}
                      {poll.allow_multiselect && <span> · multiselect</span>}
                    </p>
                  </div>
                  <span className="text-xs text-gnome-green shrink-0">{expanded ? "Hide" : "View Results"}</span>
                </button>

                {expanded && (
                  <div className="mt-4 pt-4 border-t border-parchment-dark">
                    {resultsLoading === poll.id ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 border-4 border-parchment-dark border-t-gnome-green rounded-full animate-spin" />
                      </div>
                    ) : pollResults ? (
                      <>
                        {!pollResults.available && (
                          <p className="text-sm text-iron-grey mb-3">
                            Couldn&apos;t reach this poll in Discord right now — it may have been deleted.
                          </p>
                        )}
                        <p className="text-xs text-iron-grey mb-3">
                          {pollResults.totalVotes} total vote{pollResults.totalVotes === 1 ? "" : "s"}
                          {pollResults.isFinalized && <span> · Closed</span>}
                        </p>
                        {chartData.length > 0 && (
                          <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 40)}>
                            <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#E8D5A8" />
                              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "#555" }} />
                              <YAxis type="category" dataKey="text" width={160} tick={{ fontSize: 11, fill: "#555" }} />
                              <Tooltip contentStyle={{ backgroundColor: "var(--color-parchment)", border: "1px solid var(--color-bark-brown-light)", borderRadius: "0.375rem", fontSize: "0.75rem" }} />
                              <Bar dataKey="count" name="Votes" fill="var(--color-gnome-green)" radius={[0, 4, 4, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                        <div className="flex flex-wrap items-center gap-3 mt-4">
                          <Button size="sm" variant="ghost" onClick={() => refreshResults(poll.id)}>
                            Refresh
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => exportPollResults(pollResults)}>
                            Export to Excel
                          </Button>
                          {!pollResults.isFinalized && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-accent hover:bg-red-accent/10"
                              disabled={closingId === poll.id}
                              onClick={() => closePoll(poll)}
                            >
                              {closingId === poll.id ? "Closing..." : "Close Poll Now"}
                            </Button>
                          )}
                          {pollResults.discordMessageUrl && (
                            <a
                              href={pollResults.discordMessageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-gnome-green hover:underline"
                            >
                              View in Discord
                            </a>
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
