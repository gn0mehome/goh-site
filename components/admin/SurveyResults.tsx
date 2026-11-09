"use client";

import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { LIKERT_LABELS, QUESTION_TYPE_LABELS, type SurveyQuestion } from "@/lib/surveys";

type AnswerValue = string | number | string[] | null;

export interface SurveyResponse {
  id: string;
  answers: { question_id: string; value: AnswerValue }[];
  respondent_name: string | null;
  submitted_at: string;
  /** Whether an IP was recorded -- the address itself is never sent to the browser. */
  can_ban: boolean;
}

interface Respondent {
  response: SurveyResponse;
  /** Name, or "Anonymous #n" numbered by submission order so anonymous responses stay distinguishable. */
  label: string;
}

const inputClass = "px-3 py-2 rounded-md border border-bark-brown-light bg-parchment text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-gnome-green";
const tooltipStyle = { backgroundColor: "var(--color-parchment)", border: "1px solid var(--color-bark-brown-light)", borderRadius: "0.375rem", fontSize: "0.75rem" };

function answerOf(response: SurveyResponse, question: SurveyQuestion): AnswerValue {
  return response.answers.find((a) => a.question_id === question.id)?.value ?? null;
}

function isBlank(value: AnswerValue): boolean {
  return value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function formatAnswer(question: SurveyQuestion, value: AnswerValue): string {
  if (isBlank(value)) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (question.type === "likert" && typeof value === "number") {
    return LIKERT_LABELS[question.scale ?? 5][value - 1] ?? String(value);
  }
  if (question.type === "rating") return `${value} / 5`;
  return String(value);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function SurveyResults({
  questions,
  responses,
  onBan,
  banningId,
}: {
  questions: SurveyQuestion[];
  responses: SurveyResponse[];
  onBan: (responseId: string) => void;
  banningId: string | null;
}) {
  const [view, setView] = useState<"question" | "respondent">("question");

  // Responses arrive newest first; number anonymous ones oldest first so
  // "Anonymous #1" stays the same person as more come in.
  const respondents: Respondent[] = (() => {
    const oldestFirst = [...responses].reverse();
    let anon = 0;
    const labels = new Map<string, string>();
    for (const r of oldestFirst) {
      labels.set(r.id, r.respondent_name?.trim() || `Anonymous #${++anon}`);
    }
    return responses.map((response) => ({ response, label: labels.get(response.id)! }));
  })();

  if (responses.length === 0) {
    return <p className="text-sm text-iron-grey">No responses yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-iron-grey">
          {responses.length} response{responses.length === 1 ? "" : "s"} · {questions.length} question{questions.length === 1 ? "" : "s"}
        </p>
        <div className="inline-flex rounded-md border border-bark-brown-light overflow-hidden text-xs font-semibold">
          {([["question", "By question"], ["respondent", "By respondent"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`px-3 py-1.5 cursor-pointer transition-colors ${
                view === key ? "bg-gnome-green text-white" : "text-bark-brown hover:bg-parchment-dark"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "question" ? (
        <ByQuestion questions={questions} respondents={respondents} />
      ) : (
        <ByRespondent questions={questions} respondents={respondents} onBan={onBan} banningId={banningId} />
      )}
    </div>
  );
}

function ByQuestion({ questions, respondents }: { questions: SurveyQuestion[]; respondents: Respondent[] }) {
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {questions.length > 3 && (
          <select
            value=""
            onChange={(e) => document.getElementById(`survey-q-${e.target.value}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className={`${inputClass} cursor-pointer max-w-full sm:max-w-xs`}
            aria-label="Jump to question"
          >
            <option value="" disabled>Jump to question...</option>
            {questions.map((q, i) => (
              <option key={q.id} value={q.id}>Q{i + 1}. {q.prompt || "(untitled)"}</option>
            ))}
          </select>
        )}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search answers or names..."
          aria-label="Search answers or names"
          className={`${inputClass} flex-1 min-w-48`}
        />
      </div>

      {questions.map((q, i) => (
        <QuestionSection key={q.id} index={i} question={q} respondents={respondents} needle={needle} />
      ))}
    </div>
  );
}

function QuestionSection({
  index,
  question,
  respondents,
  needle,
}: {
  index: number;
  question: SurveyQuestion;
  respondents: Respondent[];
  needle: string;
}) {
  const answered = respondents
    .map((r) => ({ ...r, value: answerOf(r.response, question) }))
    .filter((a) => !isBlank(a.value));
  const matching = needle
    ? answered.filter((a) => a.label.toLowerCase().includes(needle) || formatAnswer(question, a.value).toLowerCase().includes(needle))
    : answered;

  return (
    <details id={`survey-q-${question.id}`} open className="group rounded-lg border border-parchment-dark bg-parchment-dark/20 scroll-mt-24">
      <summary className="flex items-start justify-between gap-3 px-4 py-3 cursor-pointer list-none select-none">
        <span className="min-w-0">
          <span className="text-xs font-semibold text-gnome-green mr-2">Q{index + 1}</span>
          <span className="text-sm font-semibold text-bark-brown">{question.prompt || "(untitled)"}</span>
          <span className="block text-xs text-iron-grey mt-0.5">
            {QUESTION_TYPE_LABELS[question.type]} · {answered.length} answer{answered.length === 1 ? "" : "s"}
            {needle && ` · ${matching.length} matching`}
          </span>
        </span>
        <span className="text-xs text-iron-grey shrink-0 group-open:rotate-90 transition-transform">▶</span>
      </summary>

      <div className="px-4 pb-4 space-y-3">
        {question.type !== "text" && answered.length > 0 && <QuestionChart question={question} values={answered.map((a) => a.value)} />}

        {answered.length === 0 ? (
          <p className="text-xs text-iron-grey">No answers yet.</p>
        ) : matching.length === 0 ? (
          <p className="text-xs text-iron-grey">No answers match the search.</p>
        ) : question.type === "text" ? (
          <ol className="space-y-2">
            {matching.map((a) => (
              <li key={a.response.id} className="rounded-md border border-parchment-dark bg-parchment px-3 py-2">
                <p className="text-xs text-iron-grey mb-1">
                  <span className="font-semibold text-bark-brown">{a.label}</span> · {formatDate(a.response.submitted_at)}
                </p>
                <TextAnswer text={String(a.value)} />
              </li>
            ))}
          </ol>
        ) : (
          <WhoAnswered question={question} answers={matching} />
        )}
      </div>
    </details>
  );
}

/** Long free-text answers collapse to a few lines with a toggle, so one essay doesn't bury the rest. */
function TextAnswer({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 280 || text.split("\n").length > 4;
  return (
    <div>
      <p className={`text-sm text-bark-brown whitespace-pre-wrap break-words ${long && !expanded ? "line-clamp-4" : ""}`}>{text}</p>
      {long && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="text-xs text-gnome-green hover:underline cursor-pointer mt-1">
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

/** Each choice with the names of everyone who picked it. */
function WhoAnswered({ question, answers }: { question: SurveyQuestion; answers: (Respondent & { value: AnswerValue })[] }) {
  const choices: { key: string; label: string; matches: (v: AnswerValue) => boolean }[] =
    question.type === "multiple_choice"
      ? (question.options ?? []).map((opt) => ({
          key: opt,
          label: opt,
          matches: (v) => (Array.isArray(v) ? v.includes(opt) : v === opt),
        }))
      : Array.from({ length: question.type === "likert" ? question.scale ?? 5 : 5 }, (_, idx) => idx + 1)
          .reverse()
          .map((n) => ({ key: String(n), label: formatAnswer(question, n), matches: (v) => v === n }));

  return (
    <div>
      <p className="text-xs text-iron-grey uppercase tracking-wide mb-1.5">Who answered what</p>
      <ul className="space-y-1.5">
        {choices.map((choice) => {
          const names = answers.filter((a) => choice.matches(a.value));
          if (names.length === 0) return null;
          return (
            <li key={choice.key} className="text-sm">
              <span className="font-semibold text-bark-brown">{choice.label}</span>
              <span className="text-xs text-iron-grey"> ({names.length})</span>
              <span className="flex flex-wrap gap-1 mt-1">
                {names.map((a) => (
                  <span key={a.response.id} className="text-xs px-2 py-0.5 rounded-full bg-parchment border border-parchment-dark text-bark-brown">
                    {a.label}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function QuestionChart({ question, values }: { question: SurveyQuestion; values: AnswerValue[] }) {
  if (question.type === "rating" || question.type === "likert") {
    const scale = question.type === "likert" ? question.scale ?? 5 : 5;
    const nums = values.filter((v): v is number => typeof v === "number");
    const avg = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    const data = Array.from({ length: scale }, (_, idx) => ({
      label: question.type === "likert" ? LIKERT_LABELS[scale as 3 | 5][idx] : String(idx + 1),
      count: nums.filter((v) => v === idx + 1).length,
    }));
    return (
      <div>
        <p className="text-xs text-iron-grey mb-2">Average: {avg.toFixed(1)} / {scale}</p>
        {question.type === "rating" ? (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8D5A8" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#555" }} />
              <YAxis tick={{ fontSize: 10, fill: "#555" }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="var(--color-gnome-green)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <HorizontalChart data={data} />
        )}
      </div>
    );
  }

  const data = (question.options ?? []).map((opt) => ({
    label: opt,
    count: values.filter((v) => (Array.isArray(v) ? v.includes(opt) : v === opt)).length,
  }));
  return <HorizontalChart data={data} />;
}

function HorizontalChart({ data }: { data: { label: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(100, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E8D5A8" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "#555" }} />
        <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 11, fill: "#555" }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="count" fill="var(--color-gnome-green)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ByRespondent({
  questions,
  respondents,
  onBan,
  banningId,
}: {
  questions: SurveyQuestion[];
  respondents: Respondent[];
  onBan: (responseId: string) => void;
  banningId: string | null;
}) {
  const [index, setIndex] = useState(0);
  const current = respondents[Math.min(index, respondents.length - 1)];
  const { response } = current;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className={`${inputClass} cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed`}
          aria-label="Previous respondent"
        >
          ←
        </button>
        <select
          value={response.id}
          onChange={(e) => setIndex(respondents.findIndex((r) => r.response.id === e.target.value))}
          className={`${inputClass} cursor-pointer flex-1 min-w-0`}
          aria-label="Respondent"
        >
          {respondents.map((r) => (
            <option key={r.response.id} value={r.response.id}>
              {r.label} · {formatDate(r.response.submitted_at)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(respondents.length - 1, i + 1))}
          disabled={index >= respondents.length - 1}
          className={`${inputClass} cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed`}
          aria-label="Next respondent"
        >
          →
        </button>
        <span className="text-xs text-iron-grey whitespace-nowrap">
          {index + 1} of {respondents.length}
        </span>
      </div>

      <div className="rounded-lg border border-parchment-dark bg-parchment-dark/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3 pb-3 border-b border-parchment-dark">
          <div>
            <p className="font-semibold text-bark-brown">{current.label}</p>
            <p className="text-xs text-iron-grey">{formatDate(response.submitted_at)}</p>
          </div>
          {response.can_ban && (
            <button
              type="button"
              onClick={() => onBan(response.id)}
              disabled={banningId === response.id}
              className="text-xs text-red-accent hover:underline cursor-pointer shrink-0"
            >
              {banningId === response.id ? "..." : "Ban IP"}
            </button>
          )}
        </div>

        <ol className="space-y-3">
          {questions.map((q, i) => {
            const value = answerOf(response, q);
            return (
              <li key={q.id}>
                <p className="text-xs font-semibold text-iron-grey">
                  Q{i + 1}. {q.prompt || "(untitled)"}
                </p>
                {isBlank(value) ? (
                  <p className="text-sm text-iron-grey italic">No answer</p>
                ) : (
                  <p className="text-sm text-bark-brown whitespace-pre-wrap break-words">{formatAnswer(q, value)}</p>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
