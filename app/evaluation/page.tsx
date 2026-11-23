"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import EvaluatorHeader from "./evaluator-header";
import { apiFetch } from "../lib/api";
import { getTargetLocationLabel } from "../lib/targets";

type Evaluation = {
  cycle_id: number | null;
  target_id: number;
  target_name: string;
  office_head_name?: string | null;
  campus_name: string | null;
  is_central: boolean | number;
  submitted: boolean;
};

function evaluationKey(evaluation: Evaluation) {
  return `${evaluation.cycle_id ?? "none"}:${evaluation.target_id}`;
}

export default function MyEvaluationsPage() {
  const router = useRouter();
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedEvaluationKey, setSelectedEvaluationKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const comboboxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = evaluations.find((evaluation) => evaluationKey(evaluation) === selectedEvaluationKey);

  // Extract all successfully submitted evaluations
  const submittedEvaluations = useMemo(() => {
    return evaluations.filter((evaluation) => evaluation.submitted);
  }, [evaluations]);

  function locationOf(evaluation: Evaluation) {
    return getTargetLocationLabel(evaluation.campus_name, Boolean(evaluation.is_central));
  }

  function labelOf(evaluation: Evaluation) {
    return `${evaluation.target_name} — ${locationOf(evaluation)}`;
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredEvaluations = useMemo(
    () =>
      evaluations.filter((evaluation) =>
        [
          evaluation.target_name,
          evaluation.office_head_name ?? "",
          getTargetLocationLabel(evaluation.campus_name, Boolean(evaluation.is_central)),
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
      ),
    [evaluations, normalizedQuery],
  );

  useEffect(() => {
    let active = true;
    apiFetch<{ items: Evaluation[] }>("/api/evaluator/targets")
      .then((data) => {
        if (active) setEvaluations(data.items);
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
  }, []);

  // Close the list when clicking outside the combobox.
  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (comboboxRef.current && !comboboxRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  // Keep the highlighted option visible while using the keyboard.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function chooseEvaluation(evaluation: Evaluation) {
    setSelectedEvaluationKey(evaluationKey(evaluation));
    setQuery("");
    setOpen(false);
  }

  function clearSelection() {
    setSelectedEvaluationKey("");
    setQuery("");
    setActiveIndex(0);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
      } else if (filteredEvaluations.length > 0) {
        setActiveIndex((index) => (index + 1) % filteredEvaluations.length);
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
      } else if (filteredEvaluations.length > 0) {
        setActiveIndex((index) => (index - 1 + filteredEvaluations.length) % filteredEvaluations.length);
      }
    } else if (event.key === "Enter") {
      if (open && filteredEvaluations[activeIndex]) {
        event.preventDefault();
        chooseEvaluation(filteredEvaluations[activeIndex]);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setQuery("");
      }
    } else if (event.key === "Tab") {
      setOpen(false);
      setQuery("");
    }
  }

  function startSelectedEvaluation() {
    if (!selected || selected.submitted || selected.cycle_id === null) return;
    router.push(`/evaluation/registrar?cycleId=${selected.cycle_id}&targetId=${selected.target_id}`);
  }

  function viewSubmittedEvaluation(evaluation: Evaluation) {
    if (!evaluation.submitted) return;
    router.push(`/evaluation/summary?targetId=${evaluation.target_id}&cycleId=${evaluation.cycle_id}`);
  }

  const listboxId = "target-listbox";
  const activeOptionId = open && filteredEvaluations[activeIndex] ? `target-option-${activeIndex}` : undefined;
  const inputValue = open ? query : selected ? labelOf(selected) : "";
  const placeholder = loading
    ? "Loading targets…"
    : open && selected
      ? labelOf(selected)
      : "Search or select an evaluation target";

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-teal-50/40 text-slate-900">
      <EvaluatorHeader currentPage="evaluations" />
      <main className="mx-auto max-w-6xl space-y-6 px-5 py-8 sm:py-10">
        {/* Page heading */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-teal-800 ring-1 ring-teal-600/15">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden="true" />
              Evaluator dashboard
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#1F3A5F] sm:text-4xl">
              My Evaluations
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Search the offices/units selected in your membership and choose who to evaluate. An open evaluation cycle is required to submit.
            </p>
          </div>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 rounded-2xl border border-teal-200 bg-linear-to-r from-teal-50 to-white px-4 py-4 shadow-sm sm:px-5">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-teal-700 ring-1 ring-teal-600/20"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </span>
          <p className="text-sm leading-6 text-teal-950">
            Your account email is available to administrators for review. Your email is not shown alongside your answers.
          </p>
        </div>

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

        <div
          className={`grid gap-6 ${
            !loading && submittedEvaluations.length > 0
              ? "lg:grid-cols-2"
              : ""
          }`}
        >
          <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 sm:p-8">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-600/20">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <div>
                <h2 className="text-lg font-semibold text-[#1F3A5F]">Choose a target to evaluate</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Open the list and type to filter by target, head, campus, or cycle.
                </p>
              </div>
            </div>

            <label htmlFor="target-selection" className="mt-6 block text-sm font-semibold text-slate-700">
              Evaluation target
            </label>
            <div ref={comboboxRef} className="relative mt-1.5 max-w-2xl">
              {/* Leading search icon */}
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                ref={inputRef}
                id="target-selection"
                type="text"
                role="combobox"
                aria-expanded={open}
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-activedescendant={activeOptionId}
                autoComplete="off"
                value={inputValue}
                placeholder={placeholder}
                disabled={loading}
                onFocus={() => {
                  setOpen(true);
                  setActiveIndex(0);
                }}
                onClick={() => setOpen(true)}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setOpen(true);
                  setActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
                className="block w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-20 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10 disabled:bg-slate-100"
              />
              <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-3">
                {selected && !loading && (
                  <button
                    type="button"
                    aria-label="Clear selected target"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={clearSelection}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={open ? "Close target list" : "Open target list"}
                  disabled={loading}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (open) {
                      setOpen(false);
                      setQuery("");
                    } else {
                      setOpen(true);
                      setActiveIndex(0);
                      inputRef.current?.focus();
                    }
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
                  >
                    <path fillRule="evenodd" d="M5.22 7.22a.75.75 0 0 1 1.06 0L10 10.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              {open && !loading && (
                <ul
                  ref={listRef}
                  id={listboxId}
                  role="listbox"
                  aria-label="Evaluation targets"
                  className="absolute z-20 mt-2 max-h-80 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl shadow-slate-200/70 ring-1 ring-black/5"
                >
                  {filteredEvaluations.length === 0 ? (
                    <li role="presentation" className="px-4 py-6 text-center text-sm text-slate-500">
                      {evaluations.length === 0
                        ? "No offices/units are available for your registered memberships."
                        : "No targets match your search."}
                    </li>
                  ) : (
                    filteredEvaluations.map((evaluation, index) => {
                      const key = evaluationKey(evaluation);
                      const isActive = index === activeIndex;
                      const isSelected = key === selectedEvaluationKey;
                      return (
                        <li
                          key={key}
                          id={`target-option-${index}`}
                          data-index={index}
                          role="option"
                          aria-selected={isSelected}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => chooseEvaluation(evaluation)}
                          className={`mx-1.5 flex cursor-pointer items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                            isActive ? "bg-teal-50" : "hover:bg-slate-50"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className={`block truncate ${isSelected ? "font-semibold text-teal-900" : "font-medium text-slate-800"}`}>
                              {evaluation.target_name}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500">
                              {evaluation.office_head_name ? `${evaluation.office_head_name} · ` : ""}
                              {locationOf(evaluation)}
                            </span>
                          </span>
                          <span
                            className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              evaluation.submitted
                                ? "bg-teal-50 text-teal-700 ring-1 ring-teal-600/20"
                                : "bg-amber-50 text-amber-800 ring-1 ring-amber-500/20"
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${evaluation.submitted ? "bg-teal-500" : "bg-amber-500"}`} aria-hidden="true" />
                            {evaluation.submitted ? "Submitted" : "Pending"}
                          </span>
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
            </div>

            {!loading && !error && evaluations.length === 0 && (
              <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                No offices/units are available for your registered memberships.
              </p>
            )}
            {!loading && !error && evaluations.length > 0 && evaluations.every((evaluation) => evaluation.cycle_id === null) && (
              <p className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true">
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                </svg>
                All targets are listed, but no evaluation cycle is currently open.
              </p>
            )}

            {selected && (
              <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-linear-to-br from-slate-50 to-white shadow-sm">
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-600/20">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </span>
                      <p className="truncate font-semibold text-slate-800">{selected.target_name}</p>
                    </div>
                    {selected.office_head_name && (
                      <p className="mt-2 text-xs text-slate-600">{selected.office_head_name}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        {locationOf(selected)}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="inline-flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                      </span>
                    </div>
                  </div>

                  {selected.submitted ? (
                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-3 py-1.5 text-sm font-semibold text-teal-800 ring-1 ring-teal-600/20">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Already submitted
                      </span>
                      <button
                        type="button"
                        onClick={() => viewSubmittedEvaluation(selected)}
                        className="text-sm font-semibold text-teal-700 hover:underline"
                      >
                        View my evaluation
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={selected.cycle_id === null}
                      onClick={startSelectedEvaluation}
                      className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-linear-to-r from-[#0F9D8A] to-[#0C8575] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-600/20 transition hover:shadow-teal-600/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                    >
                      {selected.cycle_id === null ? "No open cycle" : "Start evaluation"}
                      {selected.cycle_id !== null && (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true">
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          {!loading && submittedEvaluations.length > 0 && (
            <section className="min-w-0 rounded-3xl border border-teal-100 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-start gap-3 border-b border-slate-100 pb-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-600/20">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-[#1F3A5F]">Offices You&apos;ve Evaluated</h2>
                  <p className="mt-0.5 text-sm text-slate-500">
                    You have successfully submitted evaluations for the following targets.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {submittedEvaluations.map((evaluation) => (
                  <div
                    key={evaluationKey(evaluation)}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/50 p-4 transition hover:border-teal-200 hover:bg-white hover:shadow-sm"
                  >
                    <div>
                      <p className="font-semibold text-slate-800 line-clamp-1" title={evaluation.target_name}>
                        {evaluation.target_name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {locationOf(evaluation)}
                      </p>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-100/50 px-2.5 py-1 text-[11px] font-semibold text-teal-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                        Submitted
                      </span>
                      <button
                        type="button"
                        onClick={() => viewSubmittedEvaluation(evaluation)}
                        className="text-xs font-semibold text-[#0F9D8A] transition hover:text-[#0C8575] hover:underline"
                      >
                        View Answers →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
