"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

type Cycle = { id: number; name: string; status: string };
type Participation = {
  id: number;
  target_name: string;
  eligible: number;
  submitted: number;
  percent: number;
};

export default function AdminParticipationPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [items, setItems] = useState<Participation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch<{ items: Cycle[] }>("/api/admin/cycles")
      .then(({ items: cycleItems }) => {
        if (!active) return;
        setCycles(cycleItems);
        const selected = cycleItems.find((cycle) => cycle.status === "open") ?? cycleItems[0];
        if (selected) setCycleId(String(selected.id));
        else setLoading(false);
      })
      .catch((requestError: Error) => {
        if (active) {
          setError(requestError.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!cycleId) return;
    let active = true;
    setLoading(true);
    setError("");
    apiFetch<{ items: Participation[] }>(`/api/admin/participation?cycle_id=${encodeURIComponent(cycleId)}`)
      .then((data) => {
        if (active) setItems(data.items);
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
  }, [cycleId]);

  const selectedCycle = cycles.find((cycle) => String(cycle.id) === cycleId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-teal-800">Monitoring</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1F3A5F]">Participation</h1>
          <p className="mt-2 text-sm text-slate-600">View completion counts without access to individual responses.</p>
        </div>
        <label className="text-sm font-medium text-slate-700">
          Evaluation cycle
          <select
            value={cycleId}
            onChange={(event) => setCycleId(event.target.value)}
            className="mt-1 block min-w-64 rounded-lg border border-slate-300 bg-white px-3 py-2.5"
          >
            <option value="">Select a cycle</option>
            {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name} ({cycle.status})</option>)}
          </select>
        </label>
      </div>

      {selectedCycle && (
        <p className="text-sm text-slate-500">
          Selected cycle: <span className="font-medium text-slate-700">{selectedCycle.name}</span>
        </p>
      )}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-50 text-[#1F3A5F]">
              <th className="px-5 py-4 font-semibold">Evaluation target</th>
              <th className="px-5 py-4 text-right font-semibold">Eligible</th>
              <th className="px-5 py-4 text-right font-semibold">Submitted</th>
              <th className="px-5 py-4 text-right font-semibold">Completion</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="px-5 py-6 text-slate-500">Loading participation…</td></tr>}
            {!loading && !error && !cycleId && <tr><td colSpan={4} className="px-5 py-6 text-slate-500">No evaluation cycles have been created.</td></tr>}
            {!loading && !error && cycleId && items.length === 0 && <tr><td colSpan={4} className="px-5 py-6 text-slate-500">This cycle has no participation records.</td></tr>}
            {items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-5 py-4 font-medium text-slate-800">{item.target_name}</td>
                <td className="px-5 py-4 text-right text-slate-600">{item.eligible}</td>
                <td className="px-5 py-4 text-right text-slate-600">{item.submitted}</td>
                <td className="px-5 py-4 text-right font-semibold text-teal-800">{item.percent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
