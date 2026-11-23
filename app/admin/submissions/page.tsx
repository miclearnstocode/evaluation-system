"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { getTargetLocationLabel, TARGET_TYPE_LABELS, type TargetType } from "../../lib/targets";

type Cycle = { id: number; name: string; status: string; target_ids: number[] };
type Target = {
  id: number;
  name: string;
  target_type: TargetType;
  campus_name: string | null;
  is_central: boolean | number;
};
type Submission = {
  submission_token: string;
  submitted_at: string;
  evaluator_email: string;
};

export default function SubmissionsPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [deletingToken, setDeletingToken] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ items: Cycle[] }>("/api/admin/cycles"),
      apiFetch<{ items: Target[] }>("/api/admin/targets"),
    ])
      .then(([cycleData, targetData]) => {
        if (!active) return;
        const availableCycles = cycleData.items.filter(
          (cycle) => cycle.status === "open" || cycle.status === "closed",
        );
        setCycles(availableCycles);
        setTargets(targetData.items);
        if (availableCycles.length) {
          setCycleId(String(availableCycles[0].id));
          const firstTarget = targetData.items.find((target) =>
            availableCycles[0].target_ids.includes(target.id),
          );
          if (firstTarget) {
            setTargetId(String(firstTarget.id));
            setLoadingSubmissions(true);
          }
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
  const availableTargets = targets.filter((target) =>
    selectedCycle?.target_ids.includes(target.id),
  );

  useEffect(() => {
    if (!cycleId || !targetId) return;
    let active = true;
    apiFetch<{ items: Submission[] }>(
      `/api/admin/submissions?cycle_id=${encodeURIComponent(cycleId)}&target_id=${encodeURIComponent(targetId)}`,
    )
      .then((data) => {
        if (active) setSubmissions(data.items);
      })
      .catch((requestError: Error) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoadingSubmissions(false);
      });
    return () => {
      active = false;
    };
  }, [cycleId, targetId]);

  async function removeSubmission(submission: Submission) {
    if (!window.confirm(
      `Remove the evaluation submitted by ${submission.evaluator_email}? This will retract it from the results and cannot be undone.`,
    )) {
      return;
    }
    setError("");
    setDeletingToken(submission.submission_token);
    try {
      await apiFetch("/api/admin/submissions", {
        method: "DELETE",
        body: JSON.stringify({ submission_token: submission.submission_token }),
      });
      setSubmissions((current) =>
        current.filter((item) => item.submission_token !== submission.submission_token),
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The evaluation could not be removed.");
    } finally {
      setDeletingToken("");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-teal-800">Evaluation administration</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1F3A5F]">Review Submissions</h1>
        <p className="mt-2 text-sm text-slate-600">
          Review the evaluator email associated with a submission and retract it if needed.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
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
              setSubmissions([]);
              setLoadingSubmissions(Boolean(nextTargets.length));
              setError("");
            }}
            disabled={loadingOptions}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
          >
            <option value="">Select a cycle</option>
            {cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>{cycle.name} ({cycle.status})</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Evaluation target
          <select
            value={targetId}
            onChange={(event) => {
              setTargetId(event.target.value);
              setSubmissions([]);
              setLoadingSubmissions(Boolean(event.target.value));
              setError("");
            }}
            disabled={!availableTargets.length}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
          >
            <option value="">Select a target</option>
            {availableTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {TARGET_TYPE_LABELS[target.target_type]}: {target.name} — {getTargetLocationLabel(target.campus_name, Boolean(target.is_central))}
              </option>
            ))}
          </select>
        </label>
      </section>

      {!loadingOptions && !cycles.length && !error && (
        <p className="rounded-xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-600">
          There are no open or completed evaluation cycles to review.
        </p>
      )}
      {!loadingOptions && cycleId && !availableTargets.length && !error && (
        <p className="rounded-xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-600">
          This cycle has no active evaluation targets.
        </p>
      )}

      {cycleId && targetId && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-[#1F3A5F]">Evaluator submissions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="bg-slate-50 text-[#1F3A5F]">
                  <th scope="col" className="px-5 py-3.5 font-semibold">Evaluator email</th>
                  <th scope="col" className="px-5 py-3.5 font-semibold">Submitted</th>
                  <th scope="col" className="px-5 py-3.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingSubmissions && (
                  <tr><td colSpan={3} className="px-5 py-6 text-slate-500">Loading evaluator submissions…</td></tr>
                )}
                {!loadingSubmissions && submissions.length === 0 && (
                  <tr><td colSpan={3} className="px-5 py-6 text-slate-500">No submissions for this target yet.</td></tr>
                )}
                {!loadingSubmissions && submissions.map((submission) => (
                  <tr key={submission.submission_token} className="border-t border-slate-100">
                    <td className="px-5 py-4 font-medium text-slate-800">{submission.evaluator_email}</td>
                    <td className="px-5 py-4 text-slate-600">{submission.submitted_at}</td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        disabled={Boolean(deletingToken)}
                        onClick={() => removeSubmission(submission)}
                        className="rounded-lg px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-50"
                      >
                        {deletingToken === submission.submission_token ? "Removing…" : "Remove evaluation"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
