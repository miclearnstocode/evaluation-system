"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { getTargetLocationLabel, TARGET_TYPE_LABELS, type TargetType } from "../../lib/targets";

type Cycle = { id: number; name: string; status: string; target_ids: number[] };
type Target = { id: number; name: string; target_type: TargetType; campus_name: string | null; is_central: boolean | number };
type ModerationStatus = "pending" | "approved" | "hidden";
type Comment = { id: string; question_id: number; question: string; body: string; status: ModerationStatus };

const statuses: ModerationStatus[] = ["pending", "approved", "hidden"];

export default function AdminCommentsPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [status, setStatus] = useState<ModerationStatus>("pending");
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingComments, setLoadingComments] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ items: Cycle[] }>("/api/admin/cycles"),
      apiFetch<{ items: Target[] }>("/api/admin/targets"),
    ])
      .then(([cycleData, targetData]) => {
        if (!active) return;
        const availableCycles = cycleData.items.filter((cycle) => cycle.status === "open" || cycle.status === "closed");
        setCycles(availableCycles);
        setTargets(targetData.items);
        if (availableCycles.length) setCycleId(String(availableCycles[0].id));
      })
      .catch((requestError: Error) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedCycle = cycles.find((cycle) => String(cycle.id) === cycleId);
  const availableTargets = useMemo(
    () => targets.filter((target) => selectedCycle?.target_ids.includes(target.id)),
    [targets, selectedCycle],
  );

  useEffect(() => {
    setTargetId(availableTargets.length ? String(availableTargets[0].id) : "");
  }, [cycleId, availableTargets]);

  useEffect(() => {
    if (!cycleId || !targetId) {
      setComments([]);
      return;
    }
    let active = true;
    setLoadingComments(true);
    setError("");
    apiFetch<{ items: Comment[] }>(
      `/api/admin/comments?cycle_id=${encodeURIComponent(cycleId)}&target_id=${encodeURIComponent(targetId)}&status=${status}`,
    )
      .then((data) => {
        if (!active) return;
        setComments(data.items);
      })
      .catch((requestError: Error) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoadingComments(false);
      });
    return () => {
      active = false;
    };
  }, [cycleId, targetId, status]);

  async function moderate(commentId: string, nextStatus: "approved" | "hidden") {
    setSavingId(commentId);
    setError("");
    try {
      await apiFetch(`/api/admin/comments/${encodeURIComponent(commentId)}/moderate`, {
        method: "POST",
        body: JSON.stringify({ status: nextStatus }),
      });
      setComments((current) => current.filter((comment) => comment.id !== commentId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The comment could not be updated.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-teal-800">Content review</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1F3A5F]">Comment moderation</h1>
        <p className="mt-2 text-sm text-slate-600">Comments appear as evaluators submit them, including while a cycle is open. Evaluator identities are not shown.</p>
      </div>

      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Evaluation cycle
          <select
            value={cycleId}
            onChange={(event) => setCycleId(event.target.value)}
            disabled={loadingOptions}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
          >
            <option value="">Select a cycle</option>
            {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Evaluation target
          <select
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
            disabled={!availableTargets.length}
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"
          >
            <option value="">Select a target</option>
            {availableTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {TARGET_TYPE_LABELS[target.target_type]}: {target.name} — {getTargetLocationLabel(target.campus_name, Boolean(target.is_central))}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" aria-label="Comment status">
          {statuses.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setStatus(item)}
              aria-pressed={status === item}
              className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize ${
                status === item ? "bg-[#1F3A5F] text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {loadingComments && <p role="status" className="text-sm text-slate-500">Loading comments…</p>}
      {!loadingOptions && !cycles.length && !error && (
        <p className="rounded-lg border border-slate-200 bg-white px-5 py-6 text-sm text-slate-600">
          No open or closed evaluation cycles are available for comment review.
        </p>
      )}
      {!loadingComments && cycleId && targetId && !comments.length && !error && (
        <p className="rounded-lg border border-slate-200 bg-white px-5 py-6 text-sm text-slate-600">
          No {status} comments are available for this target.
        </p>
      )}

      <div className="space-y-4">
        {comments.map((comment) => (
          <article key={comment.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-[#1F3A5F]">{comment.question}</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{comment.body}</p>
            {status === "pending" && (
              <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={Boolean(savingId)}
                  onClick={() => moderate(comment.id, "hidden")}
                  className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  Hide
                </button>
                <button
                  type="button"
                  disabled={Boolean(savingId)}
                  onClick={() => moderate(comment.id, "approved")}
                  className="rounded-lg bg-[#0F9D8A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0C8575] disabled:opacity-60"
                >
                  {savingId === comment.id ? "Saving…" : "Approve"}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
