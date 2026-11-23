"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { TARGET_TYPE_LABELS, type TargetType } from "../../lib/targets";

type Survey = { id: number; title: string; status: string };
type Cycle = { id: number; name: string; survey_title: string; target_type: TargetType | "all"; opens_at: string; closes_at: string; status: string; target_ids: number[] };

const cycleStatuses = [
  { value: "open", label: "Open", badge: "bg-teal-50 text-teal-800 ring-teal-200" },
  { value: "draft", label: "Draft", badge: "bg-amber-50 text-amber-800 ring-amber-200" },
  { value: "closed", label: "Closed", badge: "bg-slate-100 text-slate-700 ring-slate-200" },
] as const;

const fieldClassName =
  "mt-1.5 block w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10";

export default function AdminCyclesPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [name, setName] = useState("");
  const [surveyId, setSurveyId] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [sameCampus, setSameCampus] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingCycleId, setChangingCycleId] = useState<number | null>(null);
  const busy = saving || changingCycleId !== null;

  async function loadCycles() {
    const data = await apiFetch<{ items: Cycle[] }>("/api/admin/cycles");
    setCycles(data.items);
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ items: Survey[] }>("/api/admin/surveys"),
      apiFetch<{ items: Cycle[] }>("/api/admin/cycles"),
    ])
      .then(([surveyData, cycleData]) => {
        if (!active) return;
        setSurveys(surveyData.items.filter((survey) => survey.status === "published"));
        setCycles(cycleData.items);
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

  async function createCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setSaving(true);
    try {
      await apiFetch("/api/admin/cycles", {
        method: "POST",
        body: JSON.stringify({
          name,
          survey_id: Number(surveyId),
          opens_at: new Date(opensAt).toISOString(),
          closes_at: new Date(closesAt).toISOString(),
          allow_same_campus: sameCampus,
        }),
      });
      setName("");
      setSurveyId("");
      setOpensAt("");
      setClosesAt("");
      await loadCycles();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The cycle could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(cycle: Cycle, action: "open" | "close") {
    if (busy) return;
    setError("");
    setChangingCycleId(cycle.id);
    try {
      await apiFetch(`/api/admin/cycles/${cycle.id}/${action}`, { method: "POST" });
      await loadCycles();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The cycle status could not be updated.");
    } finally {
      setChangingCycleId(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="relative isolate overflow-hidden rounded-3xl bg-linear-to-br from-[#162B46] via-[#1F3A5F] to-[#126B64] px-6 py-7 text-white shadow-lg shadow-slate-900/10 sm:px-9 sm:py-9">
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-2/3 bg-[linear-gradient(to_right,#ffffff14_1px,transparent_1px),linear-gradient(to_bottom,#ffffff14_1px,transparent_1px)] bg-size-[28px_28px] mask-[linear-gradient(to_left,black,transparent_85%)]" />
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Evaluation Cycles</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-100">
              Schedule survey windows and manage when evaluations can be submitted.
            </p>
          </div>
          {(!loading && (!error || cycles.length > 0)) && (
            <dl className="grid w-full grid-cols-3 divide-x divide-white/20 rounded-2xl border border-white/25 bg-white/10 sm:w-auto">
              {cycleStatuses.map((status) => (
                <div key={status.value} className="px-4 py-3 sm:px-5">
                  <dt className="text-xs font-semibold text-teal-100">{status.label}</dt>
                  <dd className="mt-1 text-3xl font-bold tabular-nums">{cycles.filter((cycle) => cycle.status === status.value).length}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{error}</p>}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="cycle-directory-title" className="min-w-0">
          <h2 id="cycle-directory-title" className="text-xl font-bold tracking-tight text-[#1F3A5F]">Cycle directory</h2>
          {loading ? (
            <p role="status" className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading cycles…</p>
          ) : cycles.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
              {error ? "Cycle records are unavailable." : "No evaluation cycles have been created."}
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {cycles.map((cycle) => {
                const status = cycleStatuses.find((option) => option.value === cycle.status);
                const action = cycle.status === "draft" ? "open" : cycle.status === "open" ? "close" : null;
                return (
                  <li key={cycle.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold wrap-break-word text-[#1F3A5F]">{cycle.name}</h3>
                        <p className="mt-1 text-sm text-slate-600">{cycle.survey_title}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${status?.badge ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}>
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                        {status?.label ?? cycle.status}
                      </span>
                    </div>
                    <dl className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-semibold text-slate-600">Opens</dt>
                        <dd className="mt-1 text-sm text-slate-900"><time dateTime={cycle.opens_at}>{new Date(cycle.opens_at).toLocaleString()}</time></dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold text-slate-600">Closes</dt>
                        <dd className="mt-1 text-sm text-slate-900"><time dateTime={cycle.closes_at}>{new Date(cycle.closes_at).toLocaleString()}</time></dd>
                      </div>
                    </dl>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-slate-600">
                        {cycle.target_ids.length} {cycle.target_ids.length === 1 ? "target" : "targets"}
                        {" · "}
                        {cycle.target_type === "all" ? "All target categories" : TARGET_TYPE_LABELS[cycle.target_type]}
                      </p>
                      {action && (
                        <button
                          type="button"
                          aria-label={`${action === "open" ? "Open" : "Close"} cycle ${cycle.name}`}
                          disabled={busy}
                          onClick={() => changeStatus(cycle, action)}
                          className={`rounded-xl border px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                            action === "open"
                              ? "border-teal-200 bg-teal-50 text-teal-900 hover:bg-teal-100 focus-visible:outline-teal-700"
                              : "border-red-200 bg-white text-red-700 hover:bg-red-50 focus-visible:outline-red-700"
                          }`}
                        >
                          {changingCycleId === cycle.id ? "Updating…" : action === "open" ? "Open cycle" : "Close cycle"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <form onSubmit={createCycle} aria-labelledby="create-cycle-title" className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <h2 id="create-cycle-title" className="text-lg font-semibold text-[#1F3A5F]">Create a cycle</h2>
            <p className="mt-1 text-sm text-slate-600">New cycles include all active evaluation targets.</p>
          </div>
          <div className="space-y-4 p-5">
            <label className="block text-sm font-semibold text-slate-700">
              Cycle name
              <input required value={name} onChange={(event) => setName(event.target.value)} className={fieldClassName} />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Published survey
              <select required value={surveyId} onChange={(event) => setSurveyId(event.target.value)} className={fieldClassName}>
                <option value="">Select a survey…</option>
                {surveys.map((survey) => <option key={survey.id} value={survey.id}>{survey.title}</option>)}
              </select>
            </label>
            {!loading && !error && surveys.length === 0 && (
              <p className="text-sm text-slate-600">Publish a survey to create a cycle.</p>
            )}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <label className="min-w-0 text-sm font-semibold text-slate-700">
                Opens
                <input required type="datetime-local" value={opensAt} onChange={(event) => setOpensAt(event.target.value)} className={fieldClassName} />
              </label>
              <label className="min-w-0 text-sm font-semibold text-slate-700">
                Closes
                <input required type="datetime-local" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} className={fieldClassName} />
              </label>
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-5 text-slate-700">
              <input type="checkbox" checked={sameCampus} onChange={(event) => setSameCampus(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-teal-700" />
              Allow campus evaluators to evaluate their own campus
            </label>
            <button
              type="submit"
              disabled={busy || surveys.length === 0}
              className="w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save cycle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
