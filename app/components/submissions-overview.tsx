"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { getTargetLocationLabel, TARGET_TYPE_LABELS, type TargetType } from "../lib/targets";
import ReviewPageHeader from "./review-page-header";

type Cycle = { id: number; name: string; status: string; target_ids: number[] };
type Target = {
  id: number;
  name: string;
  target_type: TargetType;
  campus_name: string | null;
  office_head_name?: string | null;
  is_central: boolean | number;
};
type EvaluatorData = {
  evaluator_number?: number;
  user_id?: number;
  first_name?: string | null;
  last_name?: string | null;
  evaluator_email?: string;
  submitted?: boolean;
  submission_token?: string | null;
  total_score?: number | string | null;
  mean_score: number | string | null;
};
type RosterEntry = { evaluator: EvaluatorData; id: number; name: string; marker: string };

function targetSubtitle(target: Target, isSuperAdmin: boolean) {
  return isSuperAdmin
    ? target.office_head_name?.trim()
    : getTargetLocationLabel(target.campus_name, Boolean(target.is_central));
}

function hasSubmission(evaluator: EvaluatorData) {
  return evaluator.submitted ?? Boolean(evaluator.submission_token);
}

function getAvatarColor(name: string) {
  const colors = ["bg-blue-100 text-blue-600", "bg-teal-100 text-teal-600", "bg-indigo-100 text-indigo-600", "bg-purple-100 text-purple-600"];
  const charCode = name.charCodeAt(0) || 0;
  return colors[charCode % colors.length];
}

function evaluatorName(evaluator: EvaluatorData) {
  return [evaluator.first_name, evaluator.last_name].filter(Boolean).join(" ").trim() || evaluator.evaluator_email || "Evaluator";
}

function evaluatorInitials(evaluator: EvaluatorData) {
  return `${evaluator.first_name?.trim()[0] ?? ""}${evaluator.last_name?.trim()[0] ?? ""}`
    || evaluatorName(evaluator)[0];
}

function scoreLabel(score: number | string | null | undefined) {
  if (score === null || score === undefined) return "—";
  const number = Number(score);
  return Number.isFinite(number) ? number.toFixed(2) : "—";
}

function EvaluatorDiagram({
  evaluators,
  officeMean,
}: {
  evaluators: RosterEntry[];
  officeMean: number | null;
}) {
  const perRing = 24;
  const innerRadius = 120;
  const ringSpacing = 54;
  const ringCount = Math.ceil(evaluators.length / perRing);
  const outerRadius = innerRadius + (ringCount - 1) * ringSpacing;
  const center = outerRadius + 24;
  const nodes = evaluators.map((entry, index) => {
    const ring = Math.floor(index / perRing);
    const ringSize = Math.min(perRing, evaluators.length - ring * perRing);
    const angle = ((index % perRing) / ringSize) * Math.PI * 2 - Math.PI / 2 + ring * 0.13;
    const radius = innerRadius + ring * ringSpacing;
    return {
      ...entry,
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
    };
  });

  return (
    <figure className="border-b border-slate-200 px-5 py-5 sm:px-6">
      <figcaption className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="evaluator-diagram-title" className="font-semibold text-[#1F3A5F]">Evaluator diagram</h3>
          <p className="mt-1 text-xs text-slate-600">Select a marker to find that evaluator in the list.</p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs font-semibold text-slate-700">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-teal-600" /> Submitted
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" /> Pending
          </span>
        </div>
      </figcaption>
      <svg
        viewBox={`0 0 ${center * 2} ${center * 2}`}
        aria-labelledby="evaluator-diagram-title"
        className="mx-auto mt-4 block w-full max-w-sm"
      >
        <g aria-hidden="true">
          {nodes.map(({ id, x, y }) => (
            <line key={id} x1={center} y1={center} x2={x} y2={y} className="stroke-slate-300" strokeDasharray="3 4" />
          ))}
          <circle cx={center} cy={center} r={55} className="fill-teal-50 stroke-teal-200" strokeWidth={2} />
          <text x={center} y={center - 8} textAnchor="middle" className="fill-teal-800 text-[11px] font-semibold">
            Office mean
          </text>
          <text x={center} y={center + 18} textAnchor="middle" className="fill-[#1F3A5F] text-[24px] font-bold tabular-nums">
            {scoreLabel(officeMean)}
          </text>
        </g>
        {nodes.map(({ evaluator, id, name, marker, x, y }) => {
          const submitted = hasSubmission(evaluator);
          const label = `${name} · ${submitted ? "Submitted" : "Pending"}`;
          return (
            <a key={id} href={`#review-evaluator-${id}`} aria-label={label} className="group">
              <title>{label}</title>
              <circle
                cx={x}
                cy={y}
                r={13}
                className={submitted
                  ? "fill-teal-100 stroke-teal-600 group-hover:fill-teal-200 group-focus-visible:stroke-[3]"
                  : "fill-amber-100 stroke-amber-600 group-hover:fill-amber-200 group-focus-visible:stroke-[3]"}
              />
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className="fill-slate-900 text-[9px] font-bold uppercase">
                {marker}
              </text>
            </a>
          );
        })}
      </svg>
    </figure>
  );
}

export function SubmissionsOverview({ audience = "admin" }: { audience?: "admin" | "super_admin" }) {
  const isSuperAdmin = audience === "super_admin";
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [targetId, setTargetId] = useState("");
  
  const [evaluators, setEvaluators] = useState<EvaluatorData[]>([]);
  const [officeMean, setOfficeMean] = useState<number | null>(null);
  
  const [loadedSubmissionKey, setLoadedSubmissionKey] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [deletingToken, setDeletingToken] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const optionsRequest = isSuperAdmin
      ? apiFetch<{ cycles: Cycle[]; targets: Target[] }>("/api/admin/results/options")
      : Promise.all([
          apiFetch<{ items: Cycle[] }>("/api/admin/cycles"),
          apiFetch<{ items: Target[] }>("/api/admin/targets"),
        ]).then(([cycleData, targetData]) => ({
          cycles: cycleData.items,
          targets: targetData.items,
        }));
    optionsRequest
      .then(({ cycles: cycleItems, targets: targetItems }) => {
        if (!active) return;
        const availableCycles = cycleItems.filter(
          (cycle) => cycle.status === "open" || cycle.status === "closed",
        );
        setCycles(availableCycles);
        setTargets(targetItems);
        if (availableCycles.length) {
          setCycleId(String(availableCycles[0].id));
          const firstTarget = targetItems.find((target) =>
            availableCycles[0].target_ids.includes(target.id),
          );
          if (firstTarget) setTargetId(String(firstTarget.id));
        }
      })
      .catch((requestError: Error) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoadingOptions(false); });
    return () => { active = false; };
  }, [isSuperAdmin]);

  const selectedCycle = cycles.find((cycle) => String(cycle.id) === cycleId);
  const availableTargets = targets.filter((target) => selectedCycle?.target_ids.includes(target.id));
  const submissionRequestKey = `${cycleId}:${targetId}`;
  const loadingSubmissions = Boolean(cycleId && targetId) && loadedSubmissionKey !== submissionRequestKey;

  useEffect(() => {
    if (!cycleId || !targetId) return;
    let active = true;
    apiFetch<{ items: EvaluatorData[]; office_mean: number | null }>(
      `${isSuperAdmin ? "/api/admin/super-admin/submissions" : "/api/admin/submissions"}?cycle_id=${encodeURIComponent(cycleId)}&target_id=${encodeURIComponent(targetId)}`,
    )
      .then((data) => {
        if (active) {
          const sorted = [...data.items].sort((a, b) => Number(hasSubmission(b)) - Number(hasSubmission(a)));
          setEvaluators(sorted);
          setOfficeMean(data.office_mean);
        }
      })
      .catch((requestError: Error) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoadedSubmissionKey(submissionRequestKey); });
    return () => { active = false; };
  }, [cycleId, isSuperAdmin, submissionRequestKey, targetId]);

  function resetSelection() {
    setError("");
    setEvaluators([]);
    setOfficeMean(null);
    setLoadedSubmissionKey("");
  }

  async function removeSubmission(evaluator: EvaluatorData) {
    if (isSuperAdmin || deletingToken || !evaluator.submission_token) return;
    if (!window.confirm(`Remove the evaluation submitted by ${evaluatorName(evaluator)}?`)) return;

    setError("");
    setDeletingToken(evaluator.submission_token);
    try {
      await apiFetch("/api/admin/submissions", {
        method: "DELETE",
        body: JSON.stringify({ submission_token: evaluator.submission_token }),
      });
      
      const nextEvaluators = evaluators.map(ev => 
        ev.user_id === evaluator.user_id ? { ...ev, submission_token: null, mean_score: null } : ev
      );
      setEvaluators(nextEvaluators);
      
      const validScores = nextEvaluators
        .map(s => s.mean_score !== null ? Number(s.mean_score) : null)
        .filter((s): s is number => s !== null && !Number.isNaN(s));

      if (validScores.length > 0) {
        const newMean = validScores.reduce((a, b) => a + b, 0) / validScores.length;
        setOfficeMean(Number(newMean.toFixed(2)));
      } else {
        setOfficeMean(null);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The evaluation could not be removed.");
    } finally {
      setDeletingToken("");
    }
  }

  const currentTarget = availableTargets.find((target) => String(target.id) === targetId);
  const currentTargetSubtitle = currentTarget && targetSubtitle(currentTarget, isSuperAdmin);
  const roster: RosterEntry[] = evaluators.map((evaluator, index) => {
    const number = evaluator.evaluator_number ?? index + 1;
    return isSuperAdmin
      ? { evaluator, id: number, name: `Evaluator ${number}`, marker: String(number) }
      : { evaluator, id: evaluator.user_id ?? number, name: evaluatorName(evaluator), marker: evaluatorInitials(evaluator) };
  });
  const submittedCount = evaluators.filter(hasSubmission).length;

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <ReviewPageHeader
        title={isSuperAdmin ? "Submission Review" : "Review Submissions"}
        description={isSuperAdmin
          ? "Review submission status and individual scores by office."
          : "Review evaluator submission status and office mean scores by evaluation cycle."}
      >
        <label className="block w-full min-w-0 rounded-2xl border border-white/25 bg-white/10 p-4 text-sm font-semibold text-teal-50 sm:max-w-xs">
          Evaluation cycle
          <select
            value={cycleId}
            disabled={loadingOptions || cycles.length === 0 || Boolean(deletingToken)}
            onChange={(event) => {
              const nextCycleId = event.target.value;
              const nextCycle = cycles.find((cycle) => String(cycle.id) === nextCycleId);
              const nextTarget = targets.find((target) => nextCycle?.target_ids.includes(target.id));
              resetSelection();
              setCycleId(nextCycleId);
              setTargetId(nextTarget ? String(nextTarget.id) : "");
            }}
            className="mt-2 block w-full rounded-xl bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none focus-visible:ring-4 focus-visible:ring-teal-200/50 disabled:opacity-70"
          >
            <option value="">{loadingOptions ? "Loading cycles…" : "Select a cycle"}</option>
            {cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>{cycle.name} ({cycle.status})</option>
            ))}
          </select>
        </label>
      </ReviewPageHeader>

      {error && (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{error}</p>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)]">
        <aside aria-labelledby="review-targets-title" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <h2 id="review-targets-title" className="font-semibold text-[#1F3A5F]">Evaluation targets</h2>
            {selectedCycle && (
              <p className="mt-1 text-xs text-slate-600">{availableTargets.length} in this cycle</p>
            )}
          </div>
          {availableTargets.length === 0 ? (
            <p className="px-5 py-5 text-sm text-slate-600">
              {loadingOptions ? "Loading targets…" : selectedCycle ? "This cycle has no evaluation targets." : "No cycle selected."}
            </p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto p-2 xl:max-h-[36rem]">
              {availableTargets.map((target) => {
                const isSelected = String(target.id) === targetId;
                return (
                  <li key={target.id}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      disabled={Boolean(deletingToken)}
                      onClick={() => {
                        if (isSelected) return;
                        resetSelection();
                        setTargetId(String(target.id));
                      }}
                      className={`block w-full rounded-xl border px-3.5 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-teal-700 disabled:cursor-wait ${
                        isSelected ? "border-teal-200 bg-teal-50 text-teal-950" : "border-transparent text-slate-800 hover:bg-slate-50"
                      }`}
                    >
                      <span className="block text-sm font-semibold">{target.name}</span>
                      <span className="mt-1 block text-xs text-slate-600">
                        {[TARGET_TYPE_LABELS[target.target_type], targetSubtitle(target, isSuperAdmin)].filter(Boolean).join(" \u00b7 ")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section aria-labelledby="review-office-title" className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
            <h2 id="review-office-title" className="text-xl font-bold tracking-tight text-[#1F3A5F]">
              {currentTarget?.name ?? "Office review"}
            </h2>
            {currentTargetSubtitle && (
              <p className="mt-1 text-sm text-slate-600">
                {currentTargetSubtitle}
              </p>
            )}
          </div>

          {loadingOptions || loadingSubmissions ? (
            <p role="status" className="px-5 py-8 text-sm text-slate-600 sm:px-6">Loading submissions…</p>
          ) : !currentTarget ? (
            <p className="px-5 py-8 text-sm text-slate-600 sm:px-6">
              {cycles.length === 0 ? "No open or closed cycles are available for review." : "Select an evaluation target to view submissions."}
            </p>
          ) : error && evaluators.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-600 sm:px-6">Submission data is unavailable.</p>
          ) : (
            <div>
              <dl aria-label="Office submission summary" className="grid gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 sm:grid-cols-3 sm:px-6">
                <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3">
                  <dt className="text-xs font-semibold text-teal-900">Office mean score</dt>
                  <dd className="mt-1 text-2xl font-bold text-teal-950 tabular-nums">{scoreLabel(officeMean)}</dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <dt className="text-xs font-semibold text-slate-600">Submitted</dt>
                  <dd className="mt-1 text-2xl font-bold text-[#1F3A5F] tabular-nums">{submittedCount}</dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <dt className="text-xs font-semibold text-slate-600">Pending</dt>
                  <dd className="mt-1 text-2xl font-bold text-[#1F3A5F] tabular-nums">{evaluators.length - submittedCount}</dd>
                </div>
              </dl>

              {evaluators.length > 0 && <EvaluatorDiagram evaluators={roster} officeMean={officeMean} />}

              {evaluators.length === 0 ? (
                <p className="px-5 py-8 text-sm text-slate-600 sm:px-6">No evaluators are listed for this target.</p>
              ) : (
                <ul aria-label="Evaluators" className="divide-y divide-slate-100">
                  {roster.map(({ evaluator, id, name, marker }) => {
                    const submitted = hasSubmission(evaluator);
                    return (
                      <li key={id} id={`review-evaluator-${id}`} tabIndex={-1} className="flex scroll-mt-24 flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-slate-50/70 target:bg-teal-50 sm:px-6">
                        <div className="flex min-w-0 items-center gap-3">
                          <span aria-hidden="true" className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold uppercase ${getAvatarColor(name)}`}>
                            {marker}
                          </span>
                          <p className="min-w-0 text-sm font-semibold wrap-anywhere text-slate-900">{name}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                            submitted ? "bg-teal-50 text-teal-800 ring-teal-200" : "bg-amber-50 text-amber-800 ring-amber-200"
                          }`}>
                            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                            {submitted ? "Submitted" : "Pending"}
                          </span>
                          {submitted && (isSuperAdmin ? (
                            <span className="text-xs text-slate-700 tabular-nums">
                              Total {scoreLabel(evaluator.total_score)} ? Mean {scoreLabel(evaluator.mean_score)}
                            </span>
                          ) : (
                            <button
                              type="button"
                              aria-label={`Remove evaluation for ${name}`}
                              onClick={() => removeSubmission(evaluator)}
                              disabled={Boolean(deletingToken)}
                              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-700 disabled:cursor-wait disabled:opacity-60"
                            >
                              {deletingToken === evaluator.submission_token ? "Removing…" : "Remove"}
                            </button>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
