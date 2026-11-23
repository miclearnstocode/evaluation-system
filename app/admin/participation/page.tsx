"use client";

import { useEffect, useState, useMemo } from "react";
import { apiFetch } from "../../lib/api";

type Cycle = { id: number; name: string; status: string };
type Participation = {
  id: number;
  target_name: string;
  eligible: number;
  submitted: number;
  percent: number;
};

type SortField = "target_name" | "eligible" | "submitted" | "percent";
type SortOrder = "asc" | "desc";

export default function AdminParticipationPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [items, setItems] = useState<Participation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Sorting state
  const [sortField, setSortField] = useState<SortField>("percent");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

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

  // Calculate overall totals for the summary cards
  const totals = useMemo(() => {
    return items.reduce(
      (acc, item) => ({
        eligible: acc.eligible + item.eligible,
        submitted: acc.submitted + item.submitted,
      }),
      { eligible: 0, submitted: 0 }
    );
  }, [items]);

  const overallPercent = totals.eligible > 0 
    ? Math.round((totals.submitted / totals.eligible) * 100) 
    : 0;

  // Sort items based on selected column
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      
      if (typeof valA === "string" && typeof valB === "string") {
        return sortOrder === "asc" 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      }
      
      // Numbers
      return sortOrder === "asc" 
        ? (valA as number) - (valB as number) 
        : (valB as number) - (valA as number);
    });
  }, [items, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc"); // Default to desc for new fields
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-1 h-3.5 w-3.5 text-slate-300">
          <path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>
        </svg>
      );
    }
    return sortOrder === "asc" ? (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-1 h-3.5 w-3.5 text-teal-600">
        <path d="m7 15 5 5 5-5"/>
      </svg>
    ) : (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-1 h-3.5 w-3.5 text-teal-600">
        <path d="m7 9 5-5 5 5"/>
      </svg>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-teal-800 ring-1 ring-teal-600/15">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden="true" />
            Monitoring
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#1F3A5F]">Participation</h1>
          <p className="mt-2 text-sm text-slate-600">View completion counts without access to individual responses.</p>
        </div>
        <div className="flex flex-col sm:items-end gap-2">
          <label className="text-sm font-semibold text-slate-700">
            Evaluation Cycle
          </label>
          <div className="relative">
            <select
              value={cycleId}
              onChange={(event) => setCycleId(event.target.value)}
              className="w-full min-w-[16rem] appearance-none rounded-xl border border-slate-300 bg-white py-2.5 pl-4 pr-10 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
            >
              <option value="">Select a cycle</option>
              {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name} ({cycle.status})</option>)}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {/* Summary Cards */}
      {!loading && !error && cycleId && items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Offices / Targets</p>
            <p className="mt-2 text-3xl font-bold text-[#1F3A5F]">{items.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Submissions</p>
            <p className="mt-2 text-3xl font-bold text-[#1F3A5F]">{totals.submitted}</p>
          </div>
          <div className="rounded-2xl border border-teal-100 bg-linear-to-br from-teal-50 to-white p-5 shadow-sm ring-1 ring-teal-600/10">
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-800">Overall Completion Rate</p>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="text-3xl font-bold text-teal-900">{overallPercent}%</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-teal-200/50">
              <div 
                className="h-full rounded-full bg-teal-500 transition-all duration-1000 ease-out" 
                style={{ width: `${overallPercent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[#1F3A5F]">
                <th 
                  scope="col" 
                  className="cursor-pointer px-5 py-4 font-semibold transition hover:bg-slate-100/50"
                  onClick={() => handleSort("target_name")}
                >
                  <div className="flex items-center">
                    Evaluation Target
                    <SortIcon field="target_name" />
                  </div>
                </th>
                <th 
                  scope="col" 
                  className="cursor-pointer px-5 py-4 text-right font-semibold transition hover:bg-slate-100/50"
                  onClick={() => handleSort("eligible")}
                >
                  <div className="flex items-center justify-end">
                    Eligible
                    <SortIcon field="eligible" />
                  </div>
                </th>
                <th 
                  scope="col" 
                  className="cursor-pointer px-5 py-4 text-right font-semibold transition hover:bg-slate-100/50"
                  onClick={() => handleSort("submitted")}
                >
                  <div className="flex items-center justify-end">
                    Submitted
                    <SortIcon field="submitted" />
                  </div>
                </th>
                <th 
                  scope="col" 
                  className="cursor-pointer px-5 py-4 text-right font-semibold transition hover:bg-slate-100/50"
                  onClick={() => handleSort("percent")}
                >
                  <div className="flex items-center justify-end">
                    Completion
                    <SortIcon field="percent" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center">
                    <div className="flex items-center justify-center text-slate-500">
                      <svg className="mr-3 h-5 w-5 animate-spin text-teal-600" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading participation data…
                    </div>
                  </td>
                </tr>
              )}
              {!loading && !error && !cycleId && (
                <tr><td colSpan={4} className="px-5 py-12 text-center text-slate-500">No evaluation cycles have been created.</td></tr>
              )}
              {!loading && !error && cycleId && items.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-12 text-center text-slate-500">This cycle has no participation records.</td></tr>
              )}
              {!loading && !error && sortedItems.map((item) => (
                <tr key={item.id} className="group transition hover:bg-slate-50">
                  <td className="px-5 py-4 font-medium text-slate-800">
                    {item.target_name}
                  </td>
                  <td className="px-5 py-4 text-right text-slate-600">
                    {item.eligible}
                  </td>
                  <td className="px-5 py-4 text-right text-slate-600">
                    {item.submitted}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <span className={`font-semibold ${item.percent === 100 ? 'text-teal-600' : item.percent > 50 ? 'text-[#1F3A5F]' : 'text-slate-500'}`}>
                        {item.percent}%
                      </span>
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div 
                          className={`h-full rounded-full transition-all duration-700 ease-out ${
                            item.percent === 100 ? 'bg-teal-400' : item.percent > 50 ? 'bg-[#0F9D8A]' : 'bg-slate-300'
                          }`}
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}