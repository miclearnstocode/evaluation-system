"use client";

import { useEffect, useState } from "react";
import ReviewPageHeader from "../../components/review-page-header";
import { apiFetch } from "../../lib/api";

type Comment = { question: string; body: string };
type Options = {
  cycles: { id: number; name: string; target_ids: number[] }[];
  targets: { id: number; name: string; office_head_name: string | null }[];
};

const selectClass = "mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm";

function OfficeComments({ cycleId, office }: { cycleId: number; office: Options["targets"][number] }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState("");
  const [limit, setLimit] = useState(25);

  useEffect(() => {
    let active = true;
    apiFetch<{ items: Comment[] }>(`/api/admin/super-admin/comments?cycle_id=${cycleId}&target_id=${office.id}`)
      .then(data => { if (active) setComments(data.items); })
      .catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [cycleId, office.id]);

  return (
    <section aria-labelledby="office-comments-title" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div>
        <h2 id="office-comments-title" className="text-lg font-bold text-slate-900">{office.name}</h2>
        {office.office_head_name?.trim() && (
          <p className="mt-1 text-sm text-slate-700">{office.office_head_name.trim()}</p>
        )}
        {comments && <p className="mt-1 text-sm text-slate-600">{comments.length} {comments.length === 1 ? "comment" : "comments"}</p>}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!error && comments === null && <p role="status" className="text-sm text-slate-600">Loading comments…</p>}
      {comments?.length === 0 && <p className="text-sm text-slate-600">No comments for this office in the selected cycle.</p>}
      {!!comments?.length && (
        <ul className="space-y-3">
          {comments.slice(0, limit).map((comment, index) => (
            <li key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-700">{comment.question}</h3>
              <p className="mt-2 whitespace-pre-wrap wrap-anywhere text-sm text-slate-900">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}
      {comments && limit < comments.length && (
        <button type="button" onClick={() => setLimit(limit + 25)} className="text-sm font-semibold text-teal-800 underline underline-offset-4">
          Show more comments
        </button>
      )}
    </section>
  );
}

export default function SuperAdminCommentsPage() {
  const [options, setOptions] = useState<Options | null>(null);
  const [cycleId, setCycleId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch<Options>("/api/admin/results/options")
      .then(data => { if (active) setOptions(data); })
      .catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, []);

  const cycle = options?.cycles.find(item => String(item.id) === cycleId) ?? options?.cycles[0];
  const offices = options?.targets.filter(item => cycle?.target_ids.includes(item.id)) ?? [];
  const office = offices.find(item => String(item.id) === targetId) ?? offices[0];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <ReviewPageHeader title="Comments" description="Browse written feedback by evaluation cycle and office." />
      {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {!error && !options && <p role="status" className="text-sm text-slate-600">Loading evaluation cycles…</p>}
      {options && !cycle && <p className="text-sm text-slate-600">No evaluation cycles are available.</p>}
      {cycle && (
        <section aria-label="Comment filters" className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
          <label className="min-w-0 text-sm font-semibold text-slate-700">
            Evaluation cycle
            <select value={cycle.id} onChange={event => { setCycleId(event.target.value); setTargetId(""); }} className={selectClass}>
              {options?.cycles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-sm font-semibold text-slate-700">
            Office
            <select value={office?.id ?? ""} onChange={event => setTargetId(event.target.value)} disabled={!offices.length} className={selectClass}>
              {!offices.length && <option value="">No offices available</option>}
              {offices.map(item => (
                <option key={item.id} value={item.id}>
                  {[item.name, item.office_head_name?.trim()].filter(Boolean).join(" - ")}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}
      {cycle && office && <OfficeComments key={`${cycle.id}:${office.id}`} cycleId={cycle.id} office={office} />}
    </div>
  );
}
