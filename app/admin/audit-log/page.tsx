"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";

type AuditEntry = {
  id: number;
  admin_email: string;
  action: string;
  entity: string;
  entity_id: string | null;
  created_at: string;
};

const manilaDateFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

function actionBadgeClass(action: string) {
  switch (action) {
    case "create":
    case "approved":
      return "bg-teal-50 text-teal-800 ring-teal-200";
    case "delete":
    case "rejected":
      return "bg-rose-50 text-rose-800 ring-rose-200";
    case "view_suppressed":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

export default function AdminAuditLogPage() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [query, setQuery] = useState("");
  const tableRegion = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch<{ items: AuditEntry[] }>("/api/admin/audit-log")
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
  }, []);

  const searchTerms = query.toLowerCase().replaceAll("_", " ").trim().split(/\s+/).filter(Boolean);
  const visibleItems = searchTerms.length === 0 ? items : items.filter(item => {
    const record = item.entity_id === null ? item.entity : `${item.entity} ID ${item.entity_id}`;
    const text = [item.admin_email, item.action, record].join(" ").toLowerCase().replaceAll("_", " ");
    return searchTerms.every(term => text.includes(term));
  });

  return (
    <div className="mx-auto flex h-[calc(100dvh-7.5rem)] min-h-[24rem] max-w-7xl flex-col gap-7 sm:h-[calc(100dvh-8.5rem)]">
      <header className="relative isolate shrink-0 overflow-hidden rounded-3xl bg-linear-to-br from-[#162B46] via-[#1F3A5F] to-[#126B64] px-6 py-7 text-white shadow-lg shadow-slate-900/10 sm:px-9 sm:py-9">
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-2/3 bg-[linear-gradient(to_right,#ffffff14_1px,transparent_1px),linear-gradient(to_bottom,#ffffff14_1px,transparent_1px)] bg-size-[28px_28px] mask-[linear-gradient(to_left,black,transparent_85%)]" />
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Audit log</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-100">
              Review recorded administrator activity and the records it affected.
            </p>
          </div>
          {!loading && !error && (
            <dl className="w-full rounded-2xl border border-white/25 bg-white/10 px-5 py-4 sm:w-auto sm:min-w-40">
              <dt className="text-sm font-semibold text-teal-100">Entries shown</dt>
              <dd aria-live="polite" className="mt-1 text-3xl font-bold tabular-nums">{visibleItems.length.toLocaleString()}</dd>
            </dl>
          )}
        </div>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{error}</p>}

      <section aria-labelledby="audit-history-title" className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="audit-history-title" className="text-xl font-bold tracking-tight text-[#1F3A5F]">Recent activity</h2>
            <p className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Manila time</p>
          </div>
          <input
            aria-label="Search audit log"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (tableRegion.current) tableRegion.current.scrollTop = 0;
            }}
            placeholder="Search admin, action, or record"
            className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-teal-700 sm:w-72"
          />
        </div>
        {loading ? (
          <p role="status" className="px-5 py-8 text-sm text-slate-600 sm:px-6">Loading audit history…</p>
        ) : error ? (
          <p className="px-5 py-8 text-sm text-slate-600 sm:px-6">Audit history is unavailable.</p>
        ) : items.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-600 sm:px-6">No audit entries yet.</p>
        ) : visibleItems.length === 0 ? (
          <p role="status" className="px-5 py-8 text-sm text-slate-600 sm:px-6">No audit entries match your search.</p>
        ) : (
          <div ref={tableRegion} tabIndex={0} className="min-h-0 overflow-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-700" role="region" aria-labelledby="audit-history-title">
            <table aria-labelledby="audit-history-title" className="w-full min-w-[38rem] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-700">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold sm:px-6">Date (Manila time)</th>
                  <th scope="col" className="px-5 py-3 font-semibold sm:px-6">Administrator</th>
                  <th scope="col" className="px-5 py-3 font-semibold sm:px-6">Action</th>
                  <th scope="col" className="px-5 py-3 font-semibold sm:px-6">Record</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleItems.map((item) => (
                  <tr key={item.id} className="transition hover:bg-slate-50/70">
                    <td className="px-5 py-4 whitespace-nowrap text-slate-700 tabular-nums sm:px-6">
                      <time dateTime={item.created_at}>{manilaDateFormatter.format(new Date(item.created_at))}</time>
                    </td>
                    <td className="px-5 py-4 font-medium break-all text-slate-900 sm:px-6">{item.admin_email}</td>
                    <td className="px-5 py-4 sm:px-6">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${actionBadgeClass(item.action)}`}>
                        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                        {item.action.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="px-5 py-4 sm:px-6">
                      <span className="block font-medium capitalize text-slate-800">{item.entity.replaceAll("_", " ")}</span>
                      {item.entity_id !== null && (
                        <span className="mt-1 block font-mono text-xs break-all text-slate-600">ID {item.entity_id}</span>
                      )}
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
