"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";
import EvaluatorHeader from "../evaluator-header";

type Option = {
  id: number;
  label: string;
};

type Question = {
  id: number;
  type: "scale" | "rating" | "single_choice" | "multi_choice" | "yes_no" | "text";
  question_text: string;
  required: boolean;
  scale_min: number | null;
  scale_max: number | null;
  min_label: string | null;
  max_label: string | null;
  options: Option[];
};

type Section = {
  id: number;
  title: string;
  questions: Question[];
};

type EvaluationFormData = {
  cycle_id: number;
  target_id: number;
  target_name: string;
  office_head_name?: string | null;
  survey_title: string;
  description: string | null;
  sections: Section[];
};

type Answer = string | number | boolean | number[];
type SubmissionResult = {
  total_score: number;
  mean_score: number;
  section_scores: { section_id: number; title: string; score: number }[];
  question_scores: Record<string, number | null>;
};

const FOCUS_RING = "peer-focus-visible:ring-4 peer-focus-visible:ring-teal-600/25";

function isSubmissionResult(value: unknown): value is SubmissionResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Record<string, unknown>;
  if (
    typeof result.total_score !== "number" ||
    !Number.isFinite(result.total_score) ||
    typeof result.mean_score !== "number" ||
    !Number.isFinite(result.mean_score) ||
    !Array.isArray(result.section_scores) ||
    typeof result.question_scores !== "object" ||
    result.question_scores === null
  ) {
    return false;
  }
  return (
    result.section_scores.every(
      (section) =>
        typeof section === "object" &&
        section !== null &&
        "section_id" in section &&
        typeof section.section_id === "number" &&
        "title" in section &&
        typeof section.title === "string" &&
        "score" in section &&
        typeof section.score === "number" &&
        Number.isFinite(section.score),
    ) &&
    Object.values(result.question_scores).every(
      (score) => score === null || (typeof score === "number" && Number.isFinite(score)),
    )
  );
}

function isAnswered(answer: Answer | undefined) {
  if (answer === undefined || answer === null) return false;
  if (typeof answer === "string") return answer.trim().length > 0;
  if (Array.isArray(answer)) return answer.length > 0;
  return true;
}

function CheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function EvaluationForm({
  cycleId,
  targetId,
}: {
  cycleId: string;
  targetId: string;
}) {
  const [form, setForm] = useState<EvaluationFormData | null>(null);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [sectionIndex, setSectionIndex] = useState(0);
  const sectionHeading = useRef<HTMLHeadingElement>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<SubmissionResult | null>(null);
  const [error, setError] = useState(
    cycleId && targetId ? "" : "Choose an evaluation from My Evaluations first.",
  );
  const [loading, setLoading] = useState(Boolean(cycleId && targetId));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!cycleId || !targetId) {
      return;
    }

    let active = true;
    apiFetch<EvaluationFormData>(
      `/api/evaluator/targets/${encodeURIComponent(targetId)}/form?cycle_id=${encodeURIComponent(cycleId)}`,
    )
      .then((data) => {
        if (active) {
          setForm(data);
          setSectionIndex(0);
        }
      })
      .catch((requestError: Error) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cycleId, targetId]);

  function setAnswer(questionId: number, value: Answer) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }

  function toggleOption(questionId: number, optionId: number) {
    const current = answers[questionId];
    const selected = Array.isArray(current) ? current : [];
    setAnswer(
      questionId,
      selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : [...selected, optionId],
    );
  }

  const currentSection = form?.sections[sectionIndex];
  const hasNextSection = Boolean(form && sectionIndex + 1 < form.sections.length);

  function goToSection(index: number, message = "") {
    setSectionIndex(index);
    setError(message);
    requestAnimationFrame(() => {
      sectionHeading.current?.focus({ preventScroll: true });
      sectionHeading.current?.scrollIntoView({ block: "start" });
    });
  }

  function hasUnansweredRequiredQuestions(section: Section) {
    return section.questions.some((question) => question.required && !isAnswered(answers[question.id]));
  }

  async function advanceOrSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || submitting) return;
    const requiredMessage = "Answer all required questions in this section to continue.";
    if (currentSection && hasUnansweredRequiredQuestions(currentSection)) {
      goToSection(sectionIndex, requiredMessage);
      return;
    }
    if (hasNextSection) {
      goToSection(sectionIndex + 1);
      return;
    }

    const incompleteSection = form.sections.findIndex(hasUnansweredRequiredQuestions);
    if (incompleteSection !== -1) {
      goToSection(incompleteSection, requiredMessage);
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const result = await apiFetch<unknown>("/api/evaluator/submit", {
        method: "POST",
        body: JSON.stringify({
          cycle_id: form.cycle_id,
          target_id: form.target_id,
          answers,
        }),
      });
      setSubmissionResult(isSubmissionResult(result) ? result : null);
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The evaluation could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  const allQuestions = form ? form.sections.flatMap((section) => section.questions) : [];
  const totalQuestions = allQuestions.length;
  const answeredQuestions = allQuestions.filter((question) => isAnswered(answers[question.id])).length;
  const progress = totalQuestions === 0 ? 0 : Math.round((answeredQuestions / totalQuestions) * 100);

  function renderQuestion(question: Question) {
    const current = answers[question.id];
    const selectedOptions = Array.isArray(current) ? current : [];
    const optionRow = (isSelected: boolean) =>
      `group flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3.5 text-sm transition ${
        isSelected
          ? "border-teal-500 bg-teal-50/70 text-teal-950 shadow-sm shadow-teal-600/10"
          : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
      }`;

    return (
      <div key={question.id} className="py-7 first:pt-0 last:pb-0">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <h3 className="min-w-0 wrap-anywhere text-[15px] font-semibold leading-6 text-slate-900">
            {question.question_text}
            {question.required ? (
              <span className="ml-1 text-red-600" aria-label="required">*</span>
            ) : null}
          </h3>
          {isAnswered(current) && (
            <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700 ring-1 ring-teal-600/20">
              <CheckIcon className="h-3 w-3" />
              Answered
            </span>
          )}
        </div>

        {(question.type === "scale" || question.type === "rating") && (() => {
          const min = question.scale_min ?? 1;
          const max = question.scale_max ?? 5;
          const values = Array.from({ length: max - min + 1 }, (_, index) => min + index)
            .filter((value) => value !== 0);
          const scaleLabelsId = `scale-labels-${question.id}`;
          return (
            <div className="max-w-xl">
              <div
                className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,2.75rem),1fr))] gap-1.5 sm:gap-2"
                role="radiogroup"
                aria-label={question.question_text}
                aria-describedby={scaleLabelsId}
              >
                {values.map((value) => {
                  const isSelected = current === value;
                  return (
                    <label key={value} className="cursor-pointer">
                      <input
                        className="peer sr-only"
                        type="radio"
                        name={`question-${question.id}`}
                        value={value}
                        checked={isSelected}
                        onChange={() => setAnswer(question.id, value)}
                        required={question.required}
                      />
                      <span
                        className={`flex h-14 items-center justify-center rounded-xl border text-base font-semibold transition ${FOCUS_RING} ${
                          isSelected
                            ? "border-[#0F9D8A] bg-linear-to-b from-[#12AC97] to-[#0F9D8A] text-white shadow-md shadow-teal-600/25"
                            : "border-slate-300 bg-white text-slate-700 hover:border-teal-500 hover:bg-teal-50"
                        }`}
                      >
                        {value}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div id={scaleLabelsId} className="mt-2.5 grid grid-cols-2 gap-3 wrap-anywhere text-xs text-slate-600">
                <div>
                  <p className="font-semibold">{values[0]} — Lowest rating</p>
                  {question.min_label && <p>{question.min_label}</p>}
                </div>
                <div className="text-right">
                  <p className="font-semibold">{values[values.length - 1]} — Highest rating</p>
                  {question.max_label && <p>{question.max_label}</p>}
                </div>
              </div>
            </div>
          );
        })()}

        {question.type === "single_choice" && (
          <div className="space-y-2.5">
            {question.options.map((option) => {
              const isSelected = current === option.id;
              return (
                <label key={option.id} className={optionRow(isSelected)}>
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    value={option.id}
                    checked={isSelected}
                    onChange={() => setAnswer(question.id, option.id)}
                    required={question.required}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                      isSelected ? "border-[#0F9D8A] bg-[#0F9D8A] text-white" : "border-slate-300 bg-white group-hover:border-teal-400"
                    }`}
                  >
                    {isSelected && <span className="h-2 w-2 rounded-full bg-white" />}
                  </span>
                  <span className="min-w-0 flex-1 wrap-anywhere">{option.label}</span>
                </label>
              );
            })}
          </div>
        )}

        {question.type === "multi_choice" && (
          <div className="space-y-2.5">
            {question.options.map((option) => {
              const isSelected = selectedOptions.includes(option.id);
              return (
                <label key={option.id} className={optionRow(isSelected)}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOption(question.id, option.id)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
                      isSelected ? "border-[#0F9D8A] bg-[#0F9D8A] text-white" : "border-slate-300 bg-white group-hover:border-teal-400"
                    }`}
                  >
                    {isSelected && <CheckIcon className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1 wrap-anywhere">{option.label}</span>
                </label>
              );
            })}
          </div>
        )}

        {question.type === "yes_no" && (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3" role="radiogroup" aria-label={question.question_text}>
            {[{ label: "Yes", value: true }, { label: "No", value: false }].map((choice) => {
              const isSelected = current === choice.value;
              return (
                <label key={choice.label} className="cursor-pointer min-w-0">
                  <input
                    className="peer sr-only"
                    type="radio"
                    name={`question-${question.id}`}
                    checked={isSelected}
                    onChange={() => setAnswer(question.id, choice.value)}
                    required={question.required}
                  />
                  <span
                    className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 py-3 sm:min-w-28 sm:px-6 text-sm font-semibold transition ${FOCUS_RING} ${
                      isSelected
                        ? "border-[#0F9D8A] bg-linear-to-b from-[#12AC97] to-[#0F9D8A] text-white shadow-md shadow-teal-600/25"
                        : "border-slate-300 bg-white text-slate-700 hover:border-teal-500 hover:bg-teal-50"
                    }`}
                  >
                    {isSelected && <CheckIcon className="h-4 w-4" />}
                    {choice.label}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {question.type === "text" && (
          <>
            <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs leading-5 text-amber-800">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
              </svg>
              <p>Do not include your name or details that could identify you. Comments are reviewed before they can be shown.</p>
            </div>
            <div className="relative">
              <textarea
                rows={4}
                maxLength={5000}
                value={typeof current === "string" ? current : ""}
                onChange={(event) => setAnswer(question.id, event.target.value)}
                required={question.required}
                placeholder="Share additional feedback…"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 pt-3 pb-8 text-base text-slate-800 outline-none sm:text-sm transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
              />
              <span className="pointer-events-none absolute bottom-2.5 right-3 rounded-md bg-white/90 px-1.5 py-0.5 text-xs font-medium text-slate-400">
                {(typeof current === "string" ? current.length : 0).toLocaleString()} / 5,000
              </span>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-teal-50/40 text-slate-900">
      <EvaluatorHeader currentPage="form" />
      <main className="mx-auto max-w-3xl space-y-5 px-3 py-5 sm:space-y-6 sm:px-5 sm:py-10">
        {loading ? (
          <div role="status" aria-label="Loading evaluation" className="animate-pulse space-y-4">
            <div className="h-44 rounded-3xl border border-slate-200 bg-white shadow-sm" />
            <div className="h-72 rounded-3xl border border-slate-200 bg-white shadow-sm" />
            <span className="sr-only">Loading evaluation…</span>
          </div>
        ) : error && !form ? (
          <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p>{error}</p>
            </div>
            <Link
              href="/evaluation"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-teal-800"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              Return to My Evaluations
            </Link>
          </div>
        ) : form && submitted ? (
          <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 sm:p-8">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-2xl font-bold text-teal-800" aria-hidden="true">
                ✓
              </div>
              <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#1F3A5F]">
                Evaluation submitted
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Thank you for your feedback. Your evaluation has been recorded.
              </p>
            </div>

            {submissionResult ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-teal-50 p-5 text-center">
                    <p className="text-sm font-medium text-teal-900">Mean score</p>
                    <p className="mt-2 text-3xl font-bold text-teal-950">
                      {submissionResult.mean_score.toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-5 text-center">
                    <p className="text-sm font-medium text-slate-700">Total score</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">
                      {submissionResult.total_score.toFixed(2)}
                    </p>
                  </div>
                </div>

                {form.sections.map((section) => {
                  const sectionScore = submissionResult.section_scores.find(
                    (score) => score.section_id === section.id,
                  );
                  return (
                    <section key={section.id} className="overflow-hidden rounded-2xl border border-slate-200">
                      <header className="flex items-center justify-between gap-4 bg-slate-50 px-5 py-3">
                        <h2 className="font-semibold text-[#1F3A5F]">{section.title}</h2>
                        <span className="text-sm font-semibold text-slate-700">
                          Section score: {sectionScore?.score.toFixed(2) ?? "0.00"}
                        </span>
                      </header>
                      <ul className="divide-y divide-slate-100 px-5">
                        {section.questions.map((question) => {
                          const score = submissionResult.question_scores[String(question.id)];
                          const scoreLabel =
                            question.type === "text"
                              ? "Not scored"
                              : typeof score === "number"
                                ? `${score.toFixed(2)} points`
                                : "Not answered";
                          return (
                            <li key={question.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                              <span className="text-slate-700">{question.question_text}</span>
                              <span className="shrink-0 font-semibold text-slate-900">{scoreLabel}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </>
            ) : (
              <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Your evaluation was submitted, but score details were not returned. Restart the backend before the next evaluation to enable score display.
              </p>
            )}

            <Link
              href="/evaluation"
              className="inline-flex w-full justify-center rounded-lg bg-[#0F9D8A] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0C8575]"
            >
              Back to My Evaluations
            </Link>
          </section>
        ) : form ? (
          <>
            <Link
              href="/evaluation"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-teal-800"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              Back to My Evaluations
            </Link>

            {/* Hero */}
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50">
              <div className="relative overflow-hidden bg-linear-to-br from-[#1F3A5F] via-[#1a4a5f] to-[#0F9D8A] px-4 py-5 text-white sm:px-8 sm:py-8">
                <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
                <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-teal-300/20 blur-3xl" aria-hidden="true" />
                <div className="relative">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-teal-100 ring-1 ring-white/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal-300" aria-hidden="true" />
                    {form.survey_title}
                  </span>
                  <h1 className="mt-3 wrap-anywhere text-2xl font-bold tracking-tight sm:text-3xl">{form.target_name}</h1>
                  {form.office_head_name && (
                    <p className="mt-2 text-sm text-teal-50/90">
                      <span className="text-teal-200/80">Office head:</span>{" "}
                      <span className="font-medium text-white">{form.office_head_name}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="p-4 sm:p-8">
                {form.description && (
                  <p className="text-sm leading-6 text-slate-600">{form.description}</p>
                )}
                <div className="mt-5 flex items-start gap-3 rounded-2xl border border-teal-200 bg-linear-to-r from-teal-50 to-white px-4 py-3.5">
                  <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-teal-700 ring-1 ring-teal-600/20">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                  </span>
                  <p className="text-sm leading-6 text-teal-950">
                    Your name, email address, and account ID are hidden in the Admin submission review.
                  </p>
                </div>
              </div>
            </section>

            {/* Sticky progress */}
            <div className="sticky top-0 z-10 -mx-3 border-b border-slate-200/70 bg-slate-50/85 px-3 py-3 sm:-mx-5 sm:px-5 backdrop-blur-md">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="inline-flex items-center gap-1.5 text-slate-600">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                  Progress
                </span>
                <span className="text-teal-800">
                  {answeredQuestions} of {totalQuestions} answered · {progress}%
                </span>
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
                role="progressbar"
                aria-label="Evaluation progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div
                  className="h-full rounded-full bg-linear-to-r from-[#1F3A5F] via-[#12AC97] to-[#0F9D8A] transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <form onSubmit={advanceOrSubmit} noValidate className="space-y-6">
              {currentSection && (
                <section key={currentSection.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm" aria-labelledby="current-section-title">
                  <header className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-4 sm:px-8">
                    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-[#1F3A5F] to-[#0F9D8A] text-sm font-bold text-white shadow-sm">
                      {sectionIndex + 1}
                    </span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Section {sectionIndex + 1} of {form.sections.length}
                      </p>
                      <h2 id="current-section-title" ref={sectionHeading} tabIndex={-1} className="scroll-mt-24 text-lg font-semibold leading-6 text-[#1F3A5F]">
                        {currentSection.title}
                      </h2>
                    </div>
                  </header>
                  <div className="divide-y divide-slate-100 px-4 py-5 sm:px-8 sm:py-7">
                    {currentSection.questions.map(renderQuestion)}
                  </div>
                </section>
              )}

              {error && (
                <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p>{error}</p>
                </div>
              )}

              <nav aria-label="Evaluation sections" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:px-8">
                <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
                  <button
                    type="button"
                    disabled={sectionIndex === 0 || submitting}
                    onClick={() => goToSection(sectionIndex - 1)}
                    className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-teal-600 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous section
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="group inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-[#0F9D8A] to-[#0C8575] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-600/20 transition hover:shadow-teal-600/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/30 disabled:cursor-wait disabled:opacity-70 disabled:shadow-none"
                  >
                    {submitting ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Submitting…
                      </>
                    ) : (
                      <>
                        {hasNextSection ? "Next section" : "Submit evaluation"}
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true">
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              </nav>
            </form>
          </>
        ) : null}
      </main>
    </div>
  );
}
