"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

type Cycle = {
  id: number;
  name: string;
  status: "draft" | "open" | "closed";
  closes_at: string;
  survey_title: string;
  target_count?: number;
};

type DashboardData = {
  campuses: number;
  targets: number;
  users: number;
  cycles: Cycle[];
};

const cycleStatusStyle: Record<Cycle["status"], string> = {
  open: "bg-teal-50 text-teal-800 ring-teal-200",
  draft: "bg-amber-50 text-amber-800 ring-amber-200",
  closed: "bg-slate-100 text-slate-700 ring-slate-200",
};

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ items: { id: number }[] }>("/api/admin/campuses"),
      apiFetch<{ items: { id: number }[] }>("/api/admin/offices"),
      apiFetch<{ items: { id: number }[] }>("/api/admin/users"),
      apiFetch<{ items: Cycle[] }>("/api/admin/cycles"),
    ])
      .then(([campuses, targets, users, cycles]) => {
        if (!active) return;
        setData({
          campuses: campuses.items.length,
          targets: targets.items.length,
          users: users.items.length,
          cycles: cycles.items,
        });
      })
      .catch((requestError: Error) => {
        if (active) setError(requestError.message);
      });
    return () => {
      active = false;
    };
  }, []);

  const stats = data
    ? [
        { label: "Campuses", value: data.campuses, href: "/admin/campuses" },
        { label: "Evaluation targets", value: data.targets, href: "/admin/targets" },
        { label: "User accounts", value: data.users, href: "/admin/users" },
      ]
    : [];
  const openCycles = data?.cycles.filter((cycle) => cycle.status === "open").length;
  const recentCycles = data?.cycles.slice(0, 5) ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="relative isolate overflow-hidden rounded-3xl bg-linear-to-br from-[#162B46] via-[#1F3A5F] to-[#126B64] px-6 py-7 text-white shadow-lg shadow-slate-900/10 sm:px-9 sm:py-9">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-full bg-[linear-gradient(to_right,#ffffff14_1px,transparent_1px),linear-gradient(to_bottom,#ffffff14_1px,transparent_1px)] bg-size-[28px_28px] mask-[linear-gradient(to_left,black,transparent_85%)] sm:w-2/3"
        />
        <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-teal-200 uppercase">Administrator</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">Dashboard</h1>
            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-100">
              Manage evaluation setup and monitor current cycles.
            </p>
          </div>
          <a
            href="#evaluation-cycles"
            className="w-full rounded-2xl border border-white/25 bg-white/10 px-5 py-4 transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-200 sm:min-w-44"
          >
            <span className="flex items-center justify-between gap-5 text-sm font-semibold text-teal-50">
              Open cycles
              <span aria-hidden="true" className="text-teal-200">↘</span>
            </span>
            <span className="mt-2 block text-4xl font-bold tracking-tight tabular-nums">{openCycles ?? "—"}</span>
          </a>
        </div>
      </header>

      {error && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
          Could not load dashboard data: {error}
        </div>
      )}

      {!error && (
        <section aria-labelledby="system-overview">
          <h2 id="system-overview" className="text-xl font-bold tracking-tight text-[#1F3A5F]">System overview</h2>
          {data ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {stats.map((stat) => (
                <Link
                  key={stat.label}
                  href={stat.href}
                  className="group flex min-h-32 flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-700">
                    {stat.label}
                    <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-base text-teal-800 transition group-hover:bg-teal-100">
                      ↗
                    </span>
                  </span>
                  <span className="text-4xl font-bold tracking-tight text-[#1F3A5F] tabular-nums">{stat.value}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div role="status" className="mt-4 rounded-2xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-600">
              Loading system overview…
            </div>
          )}
        </section>
      )}

      <section id="evaluation-cycles" aria-labelledby="cycle-heading" className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
          <div>
            <h2 id="cycle-heading" className="text-xl font-bold tracking-tight text-[#1F3A5F]">Evaluation cycles</h2>
            {data && recentCycles.length > 0 && (
              <p className="mt-1 text-sm text-slate-600">Showing {recentCycles.length} of {data.cycles.length} cycles</p>
            )}
          </div>
        </div>
        {recentCycles.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-600 sm:px-6">
            {data ? "No evaluation cycles have been created." : error ? "Cycle information is unavailable." : "Loading cycles…"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-labelledby="cycle-heading" className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold sm:px-6">Cycle / Survey</th>
                  <th scope="col" className="px-3 py-3 font-semibold sm:px-6">Status</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold whitespace-nowrap sm:px-6">Closes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentCycles.map((cycle) => (
                  <tr key={cycle.id} className="transition hover:bg-slate-50/70">
                    <th scope="row" className="px-5 py-4 font-semibold text-slate-900 sm:px-6">
                      {cycle.name}
                      <span className="mt-1 block font-normal text-slate-600">{cycle.survey_title}</span>
                    </th>
                    <td className="px-3 py-4 sm:px-6">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${cycleStatusStyle[cycle.status]}`}>
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                        {cycle.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right whitespace-nowrap tabular-nums text-slate-700 sm:px-6">
                      <time dateTime={cycle.closes_at}>{new Date(cycle.closes_at).toLocaleDateString()}</time>
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
