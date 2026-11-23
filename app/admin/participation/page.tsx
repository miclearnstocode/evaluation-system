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

type SortField = "target_name" | "eligible" | "submitted" | "percent";
type SortOrder = "asc" | "desc";
type Report = { cycleId: string; items: Participation[]; error: string };

const reportColumns: { field: SortField; label: string }[] = [
  { field: "target_name", label: "Evaluation target" },
  { field: "eligible", label: "Eligible" },
  { field: "submitted", label: "Submitted" },
  { field: "percent", label: "Completion" },
];

export default function AdminParticipationPage() {
  const [catalog, setCatalog] = useState<{ items: Cycle[]; error: string } | null>(null);
  const [cycleId, setCycleId] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [sortField, setSortField] = useState<SortField>("percent");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  useEffect(() => {
    let active = true;
    apiFetch<{ items: Cycle[] }>("/api/admin/cycles")
      .then(({ items }) => {
        if (!active) return;
        setCatalog({ items, error: "" });
        const selected = items.find((cycle) => cycle.status === "open") ?? items[0];
        if (selected) setCycleId(String(selected.id));
      })
      .catch((requestError: Error) => {
        if (active) setCatalog({ items: [], error: requestError.message });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!cycleId) return;
    let active = true;
    apiFetch<{ items: Participation[] }>(`/api/admin/participation?cycle_id=${encodeURIComponent(cycleId)}`)
      .then(({ items }) => {
        if (active) setReport({ cycleId, items, error: "" });
      })
      .catch((requestError: Error) => {
        if (active) setReport({ cycleId, items: [], error: requestError.message });
      });
    return () => {
      active = false;
    };
  }, [cycleId]);

  const cycles = catalog?.items ?? [];
  const activeReport = report?.cycleId === cycleId ? report : null;
  const items = activeReport?.items ?? [];
  const error = catalog?.error || activeReport?.error || "";
  const loading = catalog === null || (cycleId !== "" && activeReport === null);
  const totals = items.reduce(
    (acc, item) => ({ eligible: acc.eligible + item.eligible, submitted: acc.submitted + item.submitted }),
    { eligible: 0, submitted: 0 },
  );
  const overallPercent = totals.eligible > 0 ? Math.round((totals.submitted / totals.eligible) * 100) : 0;
  const sortedItems = [...items].sort((first, second) => {
    const left = first[sortField];
    const right = second[sortField];
    const comparison = typeof left === "string"
      ? left.localeCompare(String(right))
      : left - Number(right);
    return sortOrder === "asc" ? comparison : -comparison;
  });

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder((current) => current === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="relative isolate overflow-hidden rounded-3xl bg-linear-to-br from-[#162B46] via-[#1F3A5F] to-[#126B64] px-6 py-7 text-white shadow-lg shadow-slate-900/10 sm:px-9 sm:py-9">
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-2/3 bg-[linear-gradient(to_right,#ffffff14_1px,transparent_1px),linear-gradient(to_bottom,#ffffff14_1px,transparent_1px)] bg-size-[28px_28px] mask-[linear-gradient(to_left,black,transparent_85%)]" />
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Participation</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-100">
              Track evaluation completion by cycle and target. This report shows aggregate counts.
            </p>
          </div>
          <label className="block w-full min-w-0 rounded-2xl border border-white/25 bg-white/10 p-4 text-sm font-semibold text-teal-50 sm:max-w-xs">
            Evaluation cycle
            <select
              value={cycleId}
              disabled={cycles.length === 0}
              onChange={(event) => {
                setReport(null);
                setCycleId(event.target.value);
              }}
              className="mt-2 block w-full rounded-xl border border-white/30 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none focus-visible:ring-4 focus-visible:ring-teal-200/50 disabled:opacity-70"
            >
              <option value="">{catalog === null ? "Loading cycles…" : "Select a cycle"}</option>
              {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name} ({cycle.status})</option>)}
            </select>
          </label>
        </div>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{error}</p>}

      {!loading && !error && cycleId && items.length > 0 && (
        <dl aria-label="Participation totals" className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <dt className="text-sm font-semibold text-slate-700">Evaluation targets</dt>
            <dd className="mt-3 text-4xl font-bold tracking-tight text-[#1F3A5F] tabular-nums">{items.length.toLocaleString()}</dd>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <dt className="text-sm font-semibold text-slate-700">Submissions</dt>
            <dd className="mt-3 text-4xl font-bold tracking-tight text-[#1F3A5F] tabular-nums">{totals.submitted.toLocaleString()}</dd>
            <dd className="mt-2 text-xs text-slate-600">of {totals.eligible.toLocaleString()} eligible submissions</dd>
          </div>
          <div className="rounded-2xl border border-teal-200 bg-teal-50 p-5 shadow-sm">
            <dt className="text-sm font-semibold text-teal-900">Overall completion</dt>
            <dd className="mt-3 text-4xl font-bold tracking-tight text-teal-950 tabular-nums">{overallPercent}%</dd>
            <dd aria-hidden="true" className="mt-3 h-2 overflow-hidden rounded-full bg-teal-200">
              <div className="h-full rounded-full bg-teal-700" style={{ width: `${Math.min(100, Math.max(0, overallPercent))}%` }} />
            </dd>
          </div>
        </dl>
      )}

      <section aria-labelledby="participation-report-title" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <h2 id="participation-report-title" className="text-xl font-bold tracking-tight text-[#1F3A5F]">Participation by target</h2>
        </div>
        {loading ? (
          <p role="status" className="px-5 py-8 text-sm text-slate-600 sm:px-6">Loading participation data…</p>
        ) : error || !cycleId || items.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-600 sm:px-6">
            {error ? "Participation data is unavailable."
              : cycles.length === 0 ? "No evaluation cycles have been created."
                : !cycleId ? "Select an evaluation cycle to view participation."
                  : "This cycle has no participation records."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-labelledby="participation-report-title" className="w-full min-w-[34rem] text-left text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  {reportColumns.map(({ field, label }) => (
                    <th
                      key={field}
                      scope="col"
                      aria-sort={sortField === field ? (sortOrder === "asc" ? "ascending" : "descending") : undefined}
                      className={field === "target_name" ? "px-5 py-2 sm:px-6" : "px-5 py-2 text-right sm:px-6"}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort(field)}
                        className="inline-flex items-center gap-1.5 rounded-md py-2 text-xs font-semibold hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                      >
                        {label}
                        <span aria-hidden="true" className={sortField === field ? "text-teal-700" : "text-slate-400"}>
                          {sortField === field ? (sortOrder === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedItems.map((item) => (
                  <tr key={item.id} className="transition hover:bg-slate-50/70">
                    <th scope="row" className="px-5 py-4 font-semibold text-slate-900 sm:px-6">{item.target_name}</th>
                    <td className="px-5 py-4 text-right tabular-nums text-slate-700 sm:px-6">{item.eligible.toLocaleString()}</td>
                    <td className="px-5 py-4 text-right tabular-nums text-slate-700 sm:px-6">{item.submitted.toLocaleString()}</td>
                    <td className="px-5 py-4 sm:px-6">
                      <div className="flex items-center justify-end gap-3">
                        <span className="font-semibold tabular-nums text-teal-900">{item.percent}%</span>
                        <div aria-hidden="true" className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.min(100, Math.max(0, item.percent))}%` }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
