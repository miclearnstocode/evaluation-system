"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { TARGET_TYPE_LABELS, type TargetType } from "../../lib/targets";

type Survey = { id: number; title: string; status: string };
type Cycle = { id: number; name: string; survey_title: string; target_type: TargetType | "all"; opens_at: string; closes_at: string; status: string; target_ids: number[] };

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
    setError("");
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
    }
  }

  async function changeStatus(cycle: Cycle, action: "open" | "close") {
    setError("");
    try {
      await apiFetch(`/api/admin/cycles/${cycle.id}/${action}`, { method: "POST" });
      await loadCycles();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The cycle status could not be updated.");
    }
  }

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1F3A5F]">Evaluation Cycles</h1>
          <p className="mt-1 text-sm text-gray-500">
            Each survey cycle includes all active evaluation targets. Evaluators only see targets they are eligible to evaluate.
          </p>
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <form onSubmit={createCycle} className="grid gap-4 rounded-xl border border-gray-200 bg-white p-6 md:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">Cycle name
            <input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-gray-700">Published survey
            <select required value={surveyId} onChange={(event) => setSurveyId(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5">
              <option value="">Select a survey…</option>
              {surveys.map((survey) => <option key={survey.id} value={survey.id}>{survey.title}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">Opens
            <input required type="datetime-local" value={opensAt} onChange={(event) => setOpensAt(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-gray-700">Closes
            <input required type="datetime-local" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5" />
          </label>
          <label className="flex items-center gap-2 self-end pb-3 text-sm text-gray-700">
            <input type="checkbox" checked={sameCampus} onChange={(event) => setSameCampus(event.target.checked)} className="accent-[#0F9D8A]" />
            Allow campus evaluators to evaluate their own campus
          </label>
          <div className="flex justify-end md:col-span-2">
            <button className="rounded-lg bg-[#0F9D8A] px-5 py-2.5 text-sm font-semibold text-white">Save cycle</button>
          </div>
        </form>

        <section className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead><tr className="bg-gray-100 text-[#1F3A5F]"><th className="px-5 py-4">Cycle</th><th className="px-5 py-4">Survey</th><th className="px-5 py-4">Evaluates</th><th className="px-5 py-4">Window</th><th className="px-5 py-4">Targets</th><th className="px-5 py-4">Status</th><th className="px-5 py-4 text-right">Action</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="px-5 py-5 text-gray-500">Loading cycles…</td></tr>}
              {!loading && cycles.length === 0 && <tr><td colSpan={7} className="px-5 py-5 text-gray-500">No cycles created.</td></tr>}
              {cycles.map((cycle) => (
                <tr key={cycle.id} className="border-t border-gray-100">
                  <td className="px-5 py-4 font-medium">{cycle.name}</td>
                  <td className="px-5 py-4">{cycle.survey_title}</td>
                  <td className="px-5 py-4 capitalize">
                    {cycle.target_type === "all" ? "All target categories" : TARGET_TYPE_LABELS[cycle.target_type]}
                  </td>
                  <td className="px-5 py-4">{new Date(cycle.opens_at).toLocaleString()} – {new Date(cycle.closes_at).toLocaleString()}</td>
                  <td className="px-5 py-4">{cycle.target_ids.length}</td>
                  <td className="px-5 py-4 capitalize">{cycle.status}</td>
                  <td className="px-5 py-4 text-right">
                    {cycle.status === "draft" && <button onClick={() => changeStatus(cycle, "open")} className="font-semibold text-[#0F9D8A]">Open</button>}
                    {cycle.status === "open" && <button onClick={() => changeStatus(cycle, "close")} className="font-semibold text-red-600">Close</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
    </div>
  );
}
