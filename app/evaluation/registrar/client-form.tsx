"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  survey_title: string;
  description: string | null;
  sections: Section[];
};

type Answer = string | number | boolean | number[];

export default function EvaluationForm({
  cycleId,
  targetId,
}: {
  cycleId: string;
  targetId: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<EvaluationFormData | null>(null);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
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
        if (active) setForm(data);
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    setError("");
    setSubmitting(true);
    try {
      await apiFetch("/api/evaluator/submit", {
        method: "POST",
        body: JSON.stringify({
          cycle_id: form.cycle_id,
          target_id: form.target_id,
          answers,
        }),
      });
      router.push("/evaluation/thank-you");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The evaluation could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderQuestion(question: Question) {
    const current = answers[question.id];
    const selectedOptions = Array.isArray(current) ? current : [];
    return (
      <section key={question.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-base font-semibold leading-6 text-[#1F3A5F]">
          {question.question_text}
          {question.required && <span className="ml-1 text-red-600" aria-label="required">*</span>}
        </h2>

        {(question.type === "scale" || question.type === "rating") && (
          <>
            <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label={question.question_text}>
              {Array.from(
                { length: (question.scale_max ?? 5) - (question.scale_min ?? 1) + 1 },
                (_, index) => (question.scale_min ?? 1) + index,
              ).map((value) => (
                <label key={value} className="cursor-pointer">
                  <input
                    className="peer sr-only"
                    type="radio"
                    name={`question-${question.id}`}
                    value={value}
                    checked={current === value}
                    onChange={() => setAnswer(question.id, value)}
                    required={question.required}
                  />
                  <span className="flex h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition peer-checked:border-[#0F9D8A] peer-checked:bg-[#0F9D8A] peer-checked:text-white">
                    {value}
                  </span>
                </label>
              ))}
            </div>
            {(question.min_label || question.max_label) && (
              <div className="mt-2 flex justify-between text-xs text-slate-500">
                <span>{question.min_label}</span>
                <span>{question.max_label}</span>
              </div>
            )}
          </>
        )}

        {question.type === "single_choice" && (
          <div className="space-y-3">
            {question.options.map((option) => (
              <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-teal-500 hover:bg-teal-50/40">
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  value={option.id}
                  checked={current === option.id}
                  onChange={() => setAnswer(question.id, option.id)}
                  required={question.required}
                  className="h-4 w-4 accent-[#0F9D8A]"
                />
                <span className="text-sm text-gray-800">{option.label}</span>
              </label>
            ))}
          </div>
        )}

        {question.type === "multi_choice" && (
          <div className="space-y-3">
            {question.options.map((option) => (
              <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-teal-500 hover:bg-teal-50/40">
                <input
                  type="checkbox"
                  checked={selectedOptions.includes(option.id)}
                  onChange={() => toggleOption(question.id, option.id)}
                  className="h-4 w-4 accent-[#0F9D8A]"
                />
                <span className="text-sm text-gray-800">{option.label}</span>
              </label>
            ))}
          </div>
        )}

        {question.type === "yes_no" && (
          <div className="flex gap-3" role="radiogroup" aria-label={question.question_text}>
            {[{ label: "Yes", value: true }, { label: "No", value: false }].map((choice) => (
              <label key={choice.label} className="cursor-pointer">
                <input
                  className="peer sr-only"
                  type="radio"
                  name={`question-${question.id}`}
                  checked={current === choice.value}
                  onChange={() => setAnswer(question.id, choice.value)}
                  required={question.required}
                />
                <span className="inline-flex rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 peer-checked:border-[#0F9D8A] peer-checked:bg-[#0F9D8A] peer-checked:text-white">
                  {choice.label}
                </span>
              </label>
            ))}
          </div>
        )}

        {question.type === "text" && (
          <>
            <p className="mb-4 text-xs text-amber-700">
              Do not include your name or details that could identify you. Comments are reviewed before they can be shown.
            </p>
            <textarea
              rows={4}
              maxLength={5000}
              value={typeof current === "string" ? current : ""}
              onChange={(event) => setAnswer(question.id, event.target.value)}
              required={question.required}
              placeholder="Share additional feedback…"
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
            />
          </>
        )}
      </section>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <EvaluatorHeader currentPage="form" />
      <main className="mx-auto max-w-3xl space-y-6 px-5 py-8 sm:py-10">
        {loading ? (
          <div role="status" className="rounded-xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-600 shadow-sm">
            Loading evaluation…
          </div>
        ) : error && !form ? (
          <div>
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</p>
            <Link href="/evaluation" className="mt-4 inline-flex text-sm font-semibold text-teal-800 hover:underline">
              Return to My Evaluations
            </Link>
          </div>
        ) : form ? (
          <>
            <section className="rounded-xl border border-slate-200 border-t-4 border-t-[#0F9D8A] bg-white p-5 shadow-sm sm:p-6">
              <p className="text-sm font-semibold text-teal-800">{form.survey_title}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1F3A5F]">{form.target_name}</h1>
              {form.description && <p className="mt-3 text-sm leading-6 text-slate-600">{form.description}</p>}
              <div className="mt-5 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-950">
                Your answers are stored separately from your identity. Submissions are final.
              </div>
            </section>
            <form onSubmit={submit} className="space-y-6">
              {form.sections.map((section, index) => (
                <section key={section.id} className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Section {index + 1}</p>
                    <h2 className="mt-1 text-lg font-semibold text-[#1F3A5F]">{section.title}</h2>
                  </div>
                  {section.questions.map(renderQuestion)}
                </section>
              ))}
              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
              <div className="flex flex-col items-end gap-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#0F9D8A] px-7 py-3 text-sm font-semibold text-white transition hover:bg-[#0C8575] disabled:cursor-wait disabled:opacity-70"
                >
                  {submitting ? "Submitting…" : "Submit evaluation"}
                </button>
                <p className="text-xs text-slate-500">Please review your answers. Submissions are final.</p>
              </div>
            </form>
          </>
        ) : null}
      </main>
    </div>
  );
}
