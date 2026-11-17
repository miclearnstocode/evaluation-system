"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

type AuditEntry = {
  id: number;
  admin_email: string;
  action: string;
  entity: string;
  entity_id: string | null;
  created_at: string;
};

export default function AdminAuditLogPage() {
  const [items, setItems] = useState<AuditEntry[]>([]);
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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-teal-800">System activity</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1F3A5F]">Audit log</h1>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-50 text-[#1F3A5F]">
              <th className="px-5 py-4 font-semibold">Date</th>
              <th className="px-5 py-4 font-semibold">Administrator</th>
              <th className="px-5 py-4 font-semibold">Action</th>
              <th className="px-5 py-4 font-semibold">Record</th>
              <th className="px-5 py-4 font-semibold">Record ID</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-5 py-6 text-slate-500">Loading audit history…</td></tr>}
            {!loading && !error && !items.length && <tr><td colSpan={5} className="px-5 py-6 text-slate-500">No audit entries yet.</td></tr>}
            {items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-5 py-4 text-slate-600">{new Date(`${item.created_at}Z`).toLocaleString()}</td>
                <td className="px-5 py-4 text-slate-700">{item.admin_email}</td>
                <td className="px-5 py-4 font-medium capitalize text-slate-800">{item.action.replaceAll("_", " ")}</td>
                <td className="px-5 py-4 capitalize text-slate-600">{item.entity.replaceAll("_", " ")}</td>
                <td className="px-5 py-4 text-slate-600">{item.entity_id ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
