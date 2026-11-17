"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import EvaluatorHeader from "./evaluator-header";
import { apiFetch } from "../lib/api";

type Evaluation = {
  cycle_id: number;
  cycle_name: string;
  target_id: number;
  target_name: string;
  campus_name: string;
  submitted: boolean;
};

export default function MyEvaluationsPage() {
  const router = useRouter();
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [selectedEvaluation, setSelectedEvaluation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const availableEvaluations = evaluations.filter((evaluation) => !evaluation.submitted);
  const selected = availableEvaluations.find(
    (evaluation) => `${evaluation.cycle_id}:${evaluation.target_id}` === selectedEvaluation,
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

  function startSelectedEvaluation() {
    if (!selected) return;
    router.push(`/evaluation/registrar?cycleId=${selected.cycle_id}&targetId=${selected.target_id}`);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <EvaluatorHeader currentPage="evaluations" />
      <main className="mx-auto max-w-6xl space-y-6 px-5 py-8 sm:py-10">
        <div>
          <p className="text-sm font-semibold text-teal-800">Evaluator dashboard</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1F3A5F]">My Evaluations</h1>
          <p className="mt-2 text-sm text-slate-600">
            Select an available evaluation. Your account profile determines which targets you can evaluate.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-4">
          <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-teal-800">
            i
          </span>
          <p className="text-sm leading-6 text-teal-950">
            Your identity is stored separately from your answers. Submitted evaluations are final.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <label htmlFor="target-selection" className="block text-base font-semibold text-[#1F3A5F]">
            Choose an evaluation
          </label>
          <p className="mt-1 text-sm text-slate-500">
            Only targets you are eligible to evaluate are listed.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <select
              id="target-selection"
              value={selectedEvaluation}
              onChange={(event) => setSelectedEvaluation(event.target.value)}
              disabled={loading || availableEvaluations.length === 0}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10 disabled:bg-slate-100"
            >
              <option value="">
                {loading ? "Loading available evaluations…" : "Select an evaluation"}
              </option>
              {availableEvaluations.map((evaluation) => (
                <option
                  key={`${evaluation.cycle_id}-${evaluation.target_id}`}
                  value={`${evaluation.cycle_id}:${evaluation.target_id}`}
                >
                  {evaluation.target_name} — {evaluation.campus_name} ({evaluation.cycle_name})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selected}
              onClick={startSelectedEvaluation}
              className="rounded-lg bg-[#0F9D8A] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0C8575] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start evaluation
            </button>
          </div>
          {!loading && !error && availableEvaluations.length === 0 && (
            <p className="mt-3 text-sm text-slate-500">There are no pending evaluations available to you.</p>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-[#1F3A5F]">Evaluation status</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-xl text-left text-sm">
              <thead>
                <tr className="bg-slate-50 text-[#1F3A5F]">
                  <th scope="col" className="px-5 py-3.5 font-semibold">Target</th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">Campus</th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">Status</th>
                  <th scope="col" className="px-5 py-3.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td className="px-5 py-6 text-slate-500" colSpan={4}>Loading your evaluations…</td></tr>
                )}
                {!loading && !error && evaluations.length === 0 && (
                  <tr><td className="px-5 py-6 text-slate-500" colSpan={4}>No evaluations are available right now.</td></tr>
                )}
                {evaluations.map((evaluation) => (
                  <tr key={`${evaluation.cycle_id}-${evaluation.target_id}`} className="border-t border-slate-100">
                    <td className="px-5 py-4 font-medium text-slate-800">
                      {evaluation.target_name}
                      <span className="mt-1 block text-xs font-normal text-slate-500">{evaluation.cycle_name}</span>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{evaluation.campus_name}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                        evaluation.submitted ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"
                      }`}>
                        {evaluation.submitted ? "Submitted" : "Pending"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {evaluation.submitted ? (
                        <span className="text-xs font-medium text-slate-400">Complete</span>
                      ) : (
                        <Link
                          href={`/evaluation/registrar?cycleId=${evaluation.cycle_id}&targetId=${evaluation.target_id}`}
                          className="rounded-lg px-3 py-2 text-xs font-semibold text-teal-800 transition hover:bg-teal-50"
                        >
                          Evaluate
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
