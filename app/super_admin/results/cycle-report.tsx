"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";

type ResponseScore = { role: string; total: number | null; mean: number | null };
type Office = { id: number; name: string; campus: string | null; responses: ResponseScore[] };
type Report = {
  cycle: string;
  evaluator_count: number;
  offices: Office[];
  comment_count: number;
};

const colors = ["#0f766e", "#1d4ed8", "#9333ea", "#b45309", "#be185d", "#475569", "#15803d", "#0369a1", "#a21caf", "#b91c1c", "#4338ca", "#4d7c0f"];
const roleLabel = (role: string) => role.replaceAll("_", " ");
const pageSize = 25;
const officeLabel = (office: Office) => [office.name, office.campus].filter(Boolean).join(" · ");

function EvaluatorScores({ responses }: { responses: ResponseScore[] }) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(pageSize);

  return (
    <details className="border-t border-slate-100 pt-3" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-semibold text-teal-800">Individual evaluator scores</summary>
      {open && (
        <>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-slate-600">
              <tr>
                <th scope="col" className="p-2">Evaluation</th>
                <th scope="col" className="p-2">Role</th>
                <th scope="col" className="p-2 text-right">Total score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {responses.slice(0, limit).map((response, index) => (
                <tr key={index}>
                  <td className="p-2">{index + 1}</td>
                  <td className="p-2 capitalize">{roleLabel(response.role)}</td>
                  <td className="p-2 text-right tabular-nums">{response.total?.toFixed(2) ?? "Unavailable"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p role="status" className="mt-2 text-xs text-slate-600">
            Showing {Math.min(limit, responses.length)} of {responses.length} evaluations
          </p>
          {limit < responses.length && (
            <button type="button" className="mt-2 text-sm font-semibold text-teal-800 underline underline-offset-4" onClick={() => setLimit(limit + pageSize)}>
              Show more evaluations
            </button>
          )}
        </>
      )}
    </details>
  );
}

export default function CycleReport({ cycleId }: { cycleId: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [metric, setMetric] = useState<"score" | "submissions">("score");

  async function generate() {
    setBusy(true);
    setError("");
    try {
      setReport(await apiFetch<Report>(`/api/admin/results/summary?cycle_id=${encodeURIComponent(cycleId)}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate the report.");
    } finally {
      setBusy(false);
    }
  }

  const { offices, roles, submissions, maximum } = useMemo(() => {
    const roles = new Set<string>();
    let submissions = 0;
    let maximum = 1;
    const offices = [];
    for (const office of report?.offices ?? []) {
      const counts = new Map<string, number>();
      let scoreSum = 0;
      let scored = 0;
      for (const response of office.responses) {
        roles.add(response.role);
        counts.set(response.role, (counts.get(response.role) ?? 0) + 1);
        if (response.mean !== null) {
          scoreSum += response.mean;
          scored++;
        }
      }
      submissions += office.responses.length;
      maximum = Math.max(maximum, office.responses.length);
      offices.push({ ...office, counts, mean: scored ? scoreSum / scored : null });
    }
    return { offices, roles: [...roles].sort(), submissions, maximum };
  }, [report]);

  const visibleOffices = offices.filter(office => officeLabel(office).toLowerCase().includes(query.trim().toLowerCase()));
  const bars = visibleOffices.map(office => ({
    office,
    value: metric === "score" ? office.mean : office.responses.length,
  })).sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  const chartMaximum = bars.reduce((max, bar) => Math.max(max, bar.value ?? 0), 1);
  const visibleSubmissions = visibleOffices.reduce((sum, office) => sum + office.responses.length, 0);
  let sliceStart = 0;
  const slices = [];
  for (const [index, role] of roles.entries()) {
    const count = visibleOffices.reduce((sum, office) => sum + (office.counts.get(role) ?? 0), 0);
    if (!count) continue;
    const percent = (count / visibleSubmissions) * 100;
    const end = sliceStart + percent;
    slices.push({ role, count, percent, start: sliceStart, end, color: colors[index % colors.length] });
    sliceStart = end;
  }
  const pie = slices.map((slice, index) => `${slice.color} ${slice.start}% ${index === slices.length - 1 ? 100 : slice.end}%`).join(", ");

  return (
    <section aria-labelledby="cycle-report-title" className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="cycle-report-title" className="text-xl font-bold text-slate-900">All-office results</h2>
          <p className="mt-1 text-sm text-slate-600">{report?.cycle ?? "View scores, participation, and comments for the selected cycle."}</p>
        </div>
        <button type="button" disabled={busy} onClick={generate} className="rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-60">
          {busy ? "Generating…" : report ? "Refresh summary" : "Generate summary"}
        </button>
      </div>
      {busy && <p role="status" className="text-sm text-slate-600">Loading cycle results…</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {report && (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Offices", value: offices.length },
              { label: "Unique evaluators", value: report.evaluator_count },
              { label: "Submissions", value: submissions },
              { label: "Comments", value: report.comment_count },
            ].map(stat => (
              <div key={stat.label} className="rounded-xl bg-teal-50 p-3 sm:p-4">
                <dt className="text-sm font-medium text-teal-900">{stat.label}</dt>
                <dd className="mt-1 text-2xl font-bold tabular-nums text-teal-950">{stat.value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="block w-full max-w-sm text-sm font-semibold text-slate-700">
              Find an office or campus
              <input type="search" value={query} onChange={event => setQuery(event.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-teal-600 focus:outline-2 focus:outline-teal-600"
              />
            </label>
            <Link href="/super_admin/comments" className="py-2 text-sm font-semibold text-teal-800 underline underline-offset-4">View comments by office</Link>
          </div>

          {visibleOffices.length > 0 && (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <section aria-labelledby="office-chart-title" className="min-w-0 space-y-4 rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id="office-chart-title" className="font-bold text-slate-900">Office comparison</h3>
                  <select
                    aria-label="Office comparison metric"
                    value={metric}
                    onChange={event => setMetric(event.target.value === "score" ? "score" : "submissions")}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="score">Average score</option>
                    <option value="submissions">Submissions</option>
                  </select>
                </div>
                <ol aria-label={metric === "score" ? "Office average scores" : "Office submission counts"}
                  tabIndex={0} className="max-h-96 space-y-3 overflow-y-auto pr-2 text-sm focus-visible:outline-2 focus-visible:outline-teal-600">
                  {bars.map(({ office, value }) => (
                    <li key={office.id} className="space-y-1">
                      <a href={`#office-result-${office.id}`} className="flex items-start justify-between gap-2 rounded-sm hover:underline">
                        <span>{officeLabel(office)}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-teal-900">
                          {value === null ? "No score" : metric === "score" ? value.toFixed(2) : value}
                        </span>
                      </a>
                      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-teal-700" style={{ width: `${100 * Math.max(value ?? 0, 0) / chartMaximum}%` }} />
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              <section aria-labelledby="role-chart-title" className="min-w-0 space-y-4 rounded-xl border border-slate-200 p-4">
                <h3 id="role-chart-title" className="font-bold text-slate-900">Submissions by evaluator role</h3>
                {slices.length ? (
                  <>
                    <div aria-hidden="true" className="mx-auto grid size-40 place-items-center rounded-full" style={{ background: `conic-gradient(${pie})` }}>
                      <div className="grid size-28 place-content-center rounded-full bg-white text-center">
                        <span className="text-xl font-bold tabular-nums text-slate-900">{visibleSubmissions}</span>
                        <span className="text-xs text-slate-600">Submissions</span>
                      </div>
                    </div>
                    <ul className="space-y-2 text-sm">
                      {slices.map(slice => (
                        <li key={slice.role} className="flex justify-between gap-2">
                          <span className="capitalize">
                            <span aria-hidden="true" className="mr-2 inline-block size-2.5 rounded-sm" style={{ background: slice.color }} />
                            {roleLabel(slice.role)}
                          </span>
                          <span className="shrink-0 tabular-nums">{slice.count} ({slice.percent.toFixed(1)}%)</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : <p className="text-sm text-slate-600">No submissions for these offices.</p>}
              </section>
            </div>
          )}

          <section aria-labelledby="office-results-title" className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="office-results-title" className="text-lg font-bold text-slate-900">Office results</h3>
              <p role="status" className="text-sm text-slate-600">{visibleOffices.length} of {offices.length} offices</p>
            </div>
            {!visibleOffices.length && <p className="text-sm text-slate-600">{offices.length ? "No offices match your search." : "This cycle has no offices."}</p>}
            {visibleOffices.map(office => {
              const { counts, mean } = office;
              return (
                <article key={office.id} id={`office-result-${office.id}`} tabIndex={-1} className="scroll-mt-24 space-y-3 target:border-teal-600 rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-semibold text-slate-900">{office.name}</h4>
                      {office.campus && <p className="mt-0.5 text-sm text-slate-600">{office.campus}</p>}
                    </div>
                    <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                      <div><dt className="text-slate-600">Submissions</dt><dd className="font-semibold tabular-nums">{office.responses.length}</dd></div>
                      <div><dt className="text-slate-600">Average score</dt><dd className="font-semibold tabular-nums">{mean?.toFixed(2) ?? "Unavailable"}</dd></div>
                    </dl>
                  </div>
                  {office.responses.length > 0 && (
                    <>
                      <div aria-hidden="true" className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                        {roles.map((role, index) => (
                          <span key={role} style={{ width: `${100 * (counts.get(role) ?? 0) / maximum}%`, background: colors[index % colors.length] }} />
                        ))}
                      </div>
                      <p className="text-sm capitalize text-slate-600">
                        {roles.filter(role => counts.has(role)).map(role => `${roleLabel(role)} (${counts.get(role)})`).join(" · ")}
                      </p>
                      <EvaluatorScores responses={office.responses} />
                    </>
                  )}
                </article>
              );
            })}
          </section>

        </>
      )}
    </section>
  );
}
