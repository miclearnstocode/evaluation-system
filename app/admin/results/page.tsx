"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";

type Cycle = { id: number; name: string; status: string; target_ids: number[] };
type Target = { id: number; name: string; target_type: "office" | "administrator"; campus_name: string };
type Distribution = { value: number; label: string; count: number };
type ResultQuestion = {
  id: number;
  text: string;
  type: string;
  mean: number | null;
  distribution: Distribution[];
};
type IndividualAnswer = { question: string; answer: number | string | string[] };
type Results = {
  released: boolean;
  minimum: number;
  response_count: number;
  cycle?: { id: number; name: string };
  target?: { id: number; name: string };
  questions?: ResultQuestion[];
  individual_responses?: { answers: IndividualAnswer[] }[];
};

export default function AdminResultsPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ items: Cycle[] }>("/api/admin/cycles"),
      apiFetch<{ items: Target[] }>("/api/admin/targets"),
    ])
      .then(([cycleData, targetData]) => {
        if (!active) return;
        const availableCycles = cycleData.items.filter((cycle) => cycle.status === "open" || cycle.status === "closed");
        setCycles(availableCycles);
        setTargets(targetData.items);
        if (availableCycles.length) {
          const firstCycleId = String(availableCycles[0].id);
          setCycleId(firstCycleId);
          const firstTarget = targetData.items.find((target) => availableCycles[0].target_ids.includes(target.id));
          setTargetId(firstTarget ? String(firstTarget.id) : "");
          setLoadingResults(Boolean(firstTarget));
        }
      })
      .catch((requestError: Error) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedCycle = cycles.find((cycle) => String(cycle.id) === cycleId);
  const availableTargets = useMemo(
    () => targets.filter((target) => selectedCycle?.target_ids.includes(target.id)),
    [targets, selectedCycle],
  );

  useEffect(() => {
    if (!cycleId || !targetId) return;
    let active = true;
    const loadResults = (initialLoad = false) => {
      apiFetch<Results>(
        `/api/admin/results?cycle_id=${encodeURIComponent(cycleId)}&target_id=${encodeURIComponent(targetId)}`,
      )
        .then((data) => {
          if (active) setResults(data);
        })
        .catch((requestError: Error) => {
          if (active) {
            setError(requestError.message);
            setLoadingResults(false);
          }
        })
        .finally(() => {
          if (active && initialLoad) setLoadingResults(false);
        });
    };
    loadResults(true);
    const refreshTimer = selectedCycle?.status === "open"
      ? window.setInterval(() => loadResults(), 15000)
      : undefined;
    return () => {
      active = false;
      if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
    };
  }, [cycleId, targetId, selectedCycle?.status]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-teal-800">Evaluation outcomes</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1F3A5F]">Results</h1>
      </div>

      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Evaluation cycle
          <select
            value={cycleId}
            onChange={(event) => {
              const nextCycleId = event.target.value;
              const nextCycle = cycles.find((cycle) => String(cycle.id) === nextCycleId);
              const nextTargets = targets.filter((target) => nextCycle?.target_ids.includes(target.id));
              setCycleId(nextCycleId);
              setTargetId(nextTargets.length ? String(nextTargets[0].id) : "");
              setResults(null);
              setLoadingResults(Boolean(nextTargets.length));
              setError("");
            }}
            disabled={loadingOptions}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
          >
            <option value="">Select a cycle</option>
            {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Office or administrator
          <select
            value={targetId}
            onChange={(event) => {
              setTargetId(event.target.value);
              setResults(null);
              setLoadingResults(Boolean(event.target.value));
              setError("");
            }}
            disabled={!availableTargets.length}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
          >
            <option value="">Select a target</option>
            {availableTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.name} — {target.campus_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {loadingResults && <p role="status" className="text-sm text-slate-500">Loading results…</p>}
      {!loadingOptions && !cycles.length && !error && (
        <p className="rounded-lg border border-slate-200 bg-white px-5 py-6 text-sm text-slate-600">
          Results become available when an evaluation cycle is open.
        </p>
      )}
      {!loadingResults && results && !results.released && (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-950">Waiting for the first response</h2>
          <p className="mt-1 text-sm text-amber-900">
            Results for this target will appear as soon as the first evaluator submits.
          </p>
        </div>
      )}

      {results?.released && (
        <section className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{results.cycle?.name}{selectedCycle ? ` · ${selectedCycle.status}` : ""}</p>
            <h2 className="mt-1 text-xl font-semibold text-[#1F3A5F]">{results.target?.name}</h2>
            <p className="mt-2 text-sm text-slate-600">
              {results.response_count} total responses
            </p>
          </div>
          {results.questions?.map((question) => {
            const max = Math.max(1, ...question.distribution.map((item) => item.count));
            return (
              <article key={question.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <h3 className="font-semibold text-[#1F3A5F]">{question.text}</h3>
                  {question.mean !== null && (
                    <p className="shrink-0 text-right">
                      <span className="block text-2xl font-bold text-teal-800">{question.mean.toFixed(2)}</span>
                      <span className="text-xs text-slate-500">Average</span>
                    </p>
                  )}
                </div>
                {!!question.distribution.length && (
                  <div className="mt-5 space-y-3">
                    {question.distribution.map((item) => (
                      <div key={item.value} className="grid grid-cols-[minmax(6rem,10rem)_1fr_2.5rem] items-center gap-3 text-sm">
                        <span className="truncate text-slate-600" title={item.label}>{item.label}</span>
                        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-[#0F9D8A]" style={{ width: `${(item.count / max) * 100}%` }} />
                        </div>
                        <span className="text-right font-medium text-slate-700">{item.count}</span>
                      </div>
                    ))}
                  </div>
                )}
                {question.type === "text" && (
                  <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-500">
                    Written responses are not shown in aggregate results to prevent accidental disclosure of evaluator identity.
                  </p>
                )}
              </article>
            );
          })}
          {!!results.individual_responses?.length && (
            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-[#1F3A5F]">Individual submitted evaluations</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Responses are shown without evaluator identity. Email addresses in written answers are redacted.
                </p>
              </div>
              {results.individual_responses.map((response, index) => (
                <article key={index} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="font-semibold text-[#1F3A5F]">Anonymous response {index + 1}</h3>
                  <dl className="mt-3 divide-y divide-slate-100">
                    {response.answers.map((answer, answerIndex) => (
                      <div key={`${answer.question}-${answerIndex}`} className="grid gap-1 py-3 sm:grid-cols-[minmax(12rem,1fr)_2fr] sm:gap-4">
                        <dt className="text-sm font-medium text-slate-600">{answer.question}</dt>
                        <dd className="whitespace-pre-wrap text-sm text-slate-800">
                          {Array.isArray(answer.answer) ? answer.answer.join(", ") : answer.answer}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </section>
          )}
        </section>
      )}
    </div>
  );
}
