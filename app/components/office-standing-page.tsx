"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { getTargetLocationLabel, TARGET_TYPE_LABELS, type TargetType } from "../lib/targets";

type Cycle = { id: number; name: string; status: "open" | "closed" };
type SectionMean = { section_id: number; title: string; mean_score: number | null };
type EvaluatorMean = { email: string; mean_score: number };
type OfficeStanding = {
  target_id: number;
  target_name: string;
  target_type: TargetType;
  campus_name: string | null;
  is_central: boolean | number;
  office_mean_score: number | null;
  response_count?: number;
  section_means?: SectionMean[];
  evaluator_means?: EvaluatorMean[];
};
type StandingResponse = {
  role: "admin" | "super_admin";
  cycles: Cycle[];
  selected_cycle_id: number | null;
  items: OfficeStanding[];
};

function scoreLabel(score: number | null | undefined) {
  return score === null || score === undefined ? "—" : score.toFixed(2);
}

export default function OfficeStandingPage({
  expectedRole,
}: {
  expectedRole: "admin" | "super_admin";
}) {
  const [role, setRole] = useState<StandingResponse["role"] | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [items, setItems] = useState<OfficeStanding[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const initialCycleHandled = useRef(false);

  useEffect(() => {
    let active = true;
    apiFetch<StandingResponse>("/api/admin/standing")
      .then((data) => {
        if (!active) return;
        if (data.role !== expectedRole) {
          setError("This page is not available for your account role.");
          return;
        }
        setRole(data.role);
        setCycles(data.cycles);
        setItems(data.items);
        setCycleId(data.selected_cycle_id ? String(data.selected_cycle_id) : "");
        setSelectedTargetId(data.items[0]?.target_id ?? null);
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
  }, [expectedRole]);

  const selectedCycle = cycles.find((cycle) => String(cycle.id) === cycleId);

  useEffect(() => {
    if (!cycleId) return;
    if (!initialCycleHandled.current) {
      initialCycleHandled.current = true;
      return;
    }

    let active = true;
    const loadStanding = () => {
      apiFetch<StandingResponse>(`/api/admin/standing?cycle_id=${encodeURIComponent(cycleId)}`)
        .then((data) => {
          if (!active) return;
          if (data.role !== expectedRole) {
            setRole(null);
            setItems([]);
            setSelectedTargetId(null);
            setError("This page is not available for your account role.");
            return;
          }
          setItems(data.items);
          setSelectedTargetId((current) =>
            data.items.some((item) => item.target_id === current)
              ? current
              : data.items[0]?.target_id ?? null,
          );
        })
        .catch((requestError: Error) => {
          if (active) setError(requestError.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };
    loadStanding();
    const refreshTimer = selectedCycle?.status === "open"
      ? window.setInterval(loadStanding, 10000)
      : undefined;
    return () => {
      active = false;
      if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
    };
  }, [cycleId, expectedRole, selectedCycle?.status]);

  const selectedTarget = items.find((item) => item.target_id === selectedTargetId);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-teal-800">Evaluation outcomes</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1F3A5F]">Live Office Standing</h1>
        <p className="mt-2 text-sm text-slate-600">
          Office mean is the average of submitted evaluators’ mean scores across all survey sections.
        </p>
        {selectedCycle?.status === "open" && (
          <p className="mt-1 text-xs text-slate-500">Open-cycle scores refresh every 10 seconds.</p>
        )}
      </div>

      <label className="block max-w-lg text-sm font-medium text-slate-700">
        Evaluation cycle
        <select
          value={cycleId}
          onChange={(event) => {
            setCycleId(event.target.value);
            setItems([]);
            setSelectedTargetId(null);
            setLoading(Boolean(event.target.value));
            setError("");
          }}
          disabled={!cycles.length}
          className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
        >
          <option value="">Select a cycle</option>
          {cycles.map((cycle) => (
            <option key={cycle.id} value={cycle.id}>
              {cycle.name} ({cycle.status})
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {loading && <p role="status" className="text-sm text-slate-500">Loading office scores…</p>}
      {!loading && !error && !cycles.length && (
        <p className="rounded-xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-600">
          No open or completed evaluation cycles are available.
        </p>
      )}
      {!loading && !error && cycleId && items.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-600">
          This cycle has no active evaluation targets.
        </p>
      )}

      {!!items.length && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead>
                <tr className="sticky top-0 bg-slate-50 text-[#1F3A5F]">
                  <th scope="col" className="px-5 py-3.5 font-semibold">Office</th>
                  {role === "super_admin" && (
                    <th scope="col" className="px-5 py-3.5 text-right font-semibold">Responses</th>
                  )}
                  <th scope="col" className="px-5 py-3.5 text-right font-semibold">Office mean score</th>
                  {role === "super_admin" && <th scope="col" className="px-5 py-3.5 text-right font-semibold">Details</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.target_id}
                    className={`border-t border-slate-100 ${
                      role === "super_admin" && selectedTargetId === item.target_id ? "bg-teal-50/50" : ""
                    }`}
                  >
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-800">{item.target_name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {TARGET_TYPE_LABELS[item.target_type]} · {getTargetLocationLabel(item.campus_name, Boolean(item.is_central))}
                      </p>
                    </td>
                    {role === "super_admin" && (
                      <td className="px-5 py-4 text-right text-slate-600">{item.response_count ?? 0}</td>
                    )}
                    <td className="px-5 py-4 text-right font-semibold text-teal-800">
                      {scoreLabel(item.office_mean_score)}
                    </td>
                    {role === "super_admin" && (
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedTargetId(item.target_id)}
                          className="rounded-lg px-3 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-50"
                        >
                          View evaluator means
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {role === "super_admin" && selectedTarget && (
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold text-[#1F3A5F]">Mean score by section</h2>
              <p className="mt-1 text-sm text-slate-500">{selectedTarget.target_name}</p>
            </div>
            <div className="divide-y divide-slate-100">
              {selectedTarget.section_means?.map((section) => (
                <div key={section.section_id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <span className="text-sm text-slate-700">{section.title}</span>
                  <span className="font-semibold text-teal-800">{scoreLabel(section.mean_score)}</span>
                </div>
              ))}
              {!selectedTarget.section_means?.length && (
                <p className="px-5 py-5 text-sm text-slate-500">No section scores are available.</p>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold text-[#1F3A5F]">Evaluator mean scores</h2>
              <p className="mt-1 text-sm text-slate-500">{selectedTarget.target_name}</p>
            </div>
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="sticky top-0 bg-slate-50 text-[#1F3A5F]">
                    <th scope="col" className="px-5 py-3 font-semibold">Evaluator email</th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">Mean score</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTarget.evaluator_means?.map((evaluator, index) => (
                    <tr key={`${evaluator.email}-${index}`} className="border-t border-slate-100">
                      <td className="px-5 py-3 text-slate-700">{evaluator.email}</td>
                      <td className="px-5 py-3 text-right font-semibold text-teal-800">
                        {scoreLabel(evaluator.mean_score)}
                      </td>
                    </tr>
                  ))}
                  {!selectedTarget.evaluator_means?.length && (
                    <tr><td colSpan={2} className="px-5 py-5 text-slate-500">No evaluator scores yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
