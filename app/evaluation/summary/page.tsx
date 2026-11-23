"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import EvaluatorHeader from "../evaluator-header";
import { apiFetch } from "../../lib/api";
import { getTargetLocationLabel } from "../../lib/targets";

type AnswerValue = string | number | string[];

type EvaluationSummary = {
  cycle_id: number;
  cycle_name: string;
  target_id: number;
  target_name: string;
  campus_name: string | null;
  is_central: boolean | number;
  survey_title: string;
  scores: {
    total_score: number;
    mean_score: number;
    section_count: number;
    section_scores: {
      section_id: number;
      title: string;
      score: number;
    }[];
  } | null;
  sections: {
    id: number;
    title: string;
    answers: {
      question_id: number;
      question: string;
      answer: AnswerValue;
    }[];
  }[];
};

function EvaluationSummaryContent() {
  const searchParams = useSearchParams();
  const cycleId = searchParams.get("cycleId") ?? "";
  const targetId = searchParams.get("targetId") ?? "";
  const [summary, setSummary] = useState<EvaluationSummary | null>(null);
  const [requestError, setRequestError] = useState<{ key: string; message: string } | null>(null);
  const [completedRequestKey, setCompletedRequestKey] = useState("");
  const [sectionIndex, setSectionIndex] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const sectionHeading = useRef<HTMLHeadingElement>(null);
  const requestKey = `${cycleId}:${targetId}`;
  const invalidIdentifier = !cycleId || !targetId;

  useEffect(() => {
    if (invalidIdentifier) return;

    let active = true;
    apiFetch<EvaluationSummary>(
      `/api/evaluator/submissions?cycle_id=${encodeURIComponent(cycleId)}&target_id=${encodeURIComponent(targetId)}`,
    )
      .then((data) => {
        if (active) {
          setSummary(data);
          setSectionIndex(0);
        }
      })
      .catch((requestError: Error) => {
        if (active) setRequestError({ key: requestKey, message: requestError.message });
      })
      .finally(() => {
        if (active) setCompletedRequestKey(requestKey);
      });

    return () => {
      active = false;
    };
  }, [cycleId, invalidIdentifier, requestKey, targetId]);

  useEffect(() => {
    let scrollTimer: number | undefined;

    function handleScroll() {
      setIsScrolling(true);
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => setIsScrolling(false), 200);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.clearTimeout(scrollTimer);
    };
  }, []);

  const loading = !invalidIdentifier && completedRequestKey !== requestKey;
  const visibleSummary =
    summary?.cycle_id === Number(cycleId) && summary.target_id === Number(targetId) ? summary : null;
  const sections = [...(visibleSummary?.sections ?? [])];
  for (const score of visibleSummary?.scores?.section_scores ?? []) {
    if (!sections.some((section) => section.id === score.section_id)) {
      sections.push({ id: score.section_id, title: score.title, answers: [] });
    }
  }
  const sectionCount = sections.length;
  const currentSection = sections[sectionIndex];
  const sectionScore = visibleSummary?.scores?.section_scores.find(
    (score) => score.section_id === currentSection?.id,
  );
  const error = invalidIdentifier
    ? "The evaluation could not be identified."
    : requestError?.key === requestKey
      ? requestError.message
      : "";

  function goToSection(index: number) {
    setSectionIndex(index);
    requestAnimationFrame(() => {
      sectionHeading.current?.focus({ preventScroll: true });
      sectionHeading.current?.scrollIntoView({ block: "start" });
    });
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-teal-50/40 text-slate-900">
      <EvaluatorHeader currentPage="evaluations" />
      <main className="mx-auto max-w-4xl space-y-6 px-5 pt-8 pb-28 sm:pt-10">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-800">My submission</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#1F3A5F]">Your submitted answers</h1>
          {visibleSummary && (
            <div className="mt-3 space-y-1 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">{visibleSummary.target_name}</p>
              <p>
                {getTargetLocationLabel(visibleSummary.campus_name, Boolean(visibleSummary.is_central))}
                {" · "}
                {visibleSummary.cycle_name}
              </p>
              <p>{visibleSummary.survey_title}</p>
            </div>
          )}
        </div>

        {!loading && visibleSummary && (
          <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-[#1F3A5F]">Scores for this evaluation</h2>
            {visibleSummary.scores ? (
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-teal-50 p-4">
                  <dt className="text-sm font-medium text-teal-900">Total score</dt>
                  <dd className="mt-1 text-2xl font-bold text-teal-950">
                    {visibleSummary.scores.total_score.toFixed(2)}
                  </dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <dt className="text-sm font-medium text-slate-600">Mean per section</dt>
                  <dd className="mt-1 text-2xl font-bold text-slate-900">
                    {visibleSummary.scores.mean_score.toFixed(2)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-slate-600">
                Score details are not available for this submission.
              </p>
            )}
          </section>
        )}

        {loading && (
          <p role="status" className="rounded-xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-600">
            Loading your answers…
          </p>
        )}

        {!loading && error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {error}
          </p>
        )}

        {!loading && visibleSummary && sectionCount === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-600">
            No saved answers were found for this evaluation.
          </p>
        )}

        {!loading && currentSection && (
          <section aria-labelledby="summary-section-title" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-semibold text-teal-800">Section {sectionIndex + 1} of {sectionCount}</p>
                <h2 id="summary-section-title" ref={sectionHeading} tabIndex={-1} className="mt-1 scroll-mt-6 text-lg font-semibold text-[#1F3A5F]">
                  {currentSection.title}
                </h2>
              </div>
              {sectionScore && (
                <p className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-900">
                  Section score {sectionScore.score.toFixed(2)}
                </p>
              )}
            </header>
            <div className="space-y-4 p-5 sm:p-6">
              {currentSection.answers.length === 0 && (
                <p className="text-sm text-slate-600">No saved answers for this section.</p>
              )}
              {currentSection.answers.map((answer) => (
                <article key={answer.question_id} className="border-t border-slate-100 pt-4 first:border-0 first:pt-0">
                  <h3 className="text-sm font-medium leading-6 text-slate-700">{answer.question}</h3>
                  {Array.isArray(answer.answer) ? (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {answer.answer.map((value, index) => (
                        <li key={`${answer.question_id}-${index}`} className="rounded-full bg-teal-50 px-3 py-1 text-sm text-teal-900">
                          {value}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-900">
                      {String(answer.answer)}
                    </p>
                  )}
                </article>
              ))}
            </div>
            {sectionCount > 1 && (
              <nav aria-label="Summary sections" className="flex justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:px-6">
                <button
                  type="button"
                  disabled={sectionIndex === 0}
                  onClick={() => goToSection(sectionIndex - 1)}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous section
                </button>
                <button
                  type="button"
                  disabled={sectionIndex + 1 >= sectionCount}
                  onClick={() => goToSection(sectionIndex + 1)}
                  className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next section
                </button>
              </nav>
            )}
          </section>
        )}
      </main>
      <Link
        href="/evaluation/"
        className={`fixed right-5 bottom-5 z-20 inline-flex items-center gap-2 rounded-full bg-[#1F3A5F] px-4 py-3 text-sm font-semibold text-white shadow-lg transition-[opacity,transform] duration-150 hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 motion-reduce:transition-none sm:bottom-8 lg:right-[max(1.25rem,calc(50%_-_26.75rem))] ${
          isScrolling
            ? "pointer-events-none translate-y-2 opacity-0 focus-visible:pointer-events-auto focus-visible:translate-y-0 focus-visible:opacity-100"
            : "translate-y-0 opacity-100"
        }`}
      >
        <span aria-hidden="true">←</span>
        Back to My Evaluations
      </Link>
    </div>
  );
}

export default function EvaluationSummaryPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-slate-500">Loading your submission…</p>}>
      <EvaluationSummaryContent />
    </Suspense>
  );
}
