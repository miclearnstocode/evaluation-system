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
  offices: number;
  administrators: number;
  users: number;
  surveys: number;
  cycles: Cycle[];
};

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ items: { id: number }[] }>("/api/admin/campuses"),
      apiFetch<{ items: { id: number }[] }>("/api/admin/offices"),
      apiFetch<{ items: { id: number }[] }>("/api/admin/administrators"),
      apiFetch<{ items: { id: number }[] }>("/api/admin/users"),
      apiFetch<{ items: { id: number }[] }>("/api/admin/surveys"),
      apiFetch<{ items: Cycle[] }>("/api/admin/cycles"),
    ])
      .then(([campuses, offices, administrators, users, surveys, cycles]) => {
        if (!active) return;
        setData({
          campuses: campuses.items.length,
          offices: offices.items.length,
          administrators: administrators.items.length,
          users: users.items.length,
          surveys: surveys.items.length,
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
        { label: "Offices", value: data.offices, href: "/admin/offices" },
        { label: "Administrators", value: data.administrators, href: "/admin/administrators" },
        { label: "User accounts", value: data.users, href: "/admin/users" },
        { label: "Surveys", value: data.surveys, href: "/admin/survey-builder" },
        { label: "Open cycles", value: data.cycles.filter((cycle) => cycle.status === "open").length, href: "/admin/cycles" },
      ]
    : [];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium text-teal-800">Administration</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1F3A5F]">Dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">Manage evaluation setup and monitor current cycles.</p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load dashboard data: {error}
        </div>
      )}

      <section aria-label="System summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300 hover:shadow"
          >
            <p className="text-sm font-medium text-slate-500">{stat.label}</p>
            <p className="mt-3 text-3xl font-bold text-[#1F3A5F]">{stat.value}</p>
            <span className="mt-3 inline-block text-sm font-semibold text-teal-800">Manage {stat.label.toLowerCase()} →</span>
          </Link>
        ))}
        {!data && !error && (
          <p role="status" className="text-sm text-slate-500">Loading system summary…</p>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-semibold text-[#1F3A5F]">Evaluation cycles</h2>
            <p className="mt-1 text-sm text-slate-500">Current and upcoming survey windows.</p>
          </div>
          <Link href="/admin/cycles" className="shrink-0 text-sm font-semibold text-teal-800 hover:underline">
            Manage cycles
          </Link>
        </div>
        {!data?.cycles.length ? (
          <p className="px-5 py-6 text-sm text-slate-500">
            {data ? "No evaluation cycles have been created." : error ? "Cycle information is unavailable." : "Loading cycles…"}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.cycles.slice(0, 5).map((cycle) => (
              <li key={cycle.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-medium text-slate-800">{cycle.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{cycle.survey_title}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                    cycle.status === "open" ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-600"
                  }`}>
                    {cycle.status}
                  </span>
                  <span className="text-xs text-slate-500">
                    Closes {new Date(cycle.closes_at).toLocaleDateString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
