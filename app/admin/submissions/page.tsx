"use client";

import { useEffect, useState, Fragment } from "react";
import { apiFetch } from "../../lib/api";
import { getTargetLocationLabel, TARGET_TYPE_LABELS, type TargetType } from "../../lib/targets";

type Cycle = { id: number; name: string; status: string; target_ids: number[] };
type Target = {
  id: number;
  name: string;
  target_type: TargetType;
  campus_name: string | null;
  is_central: boolean | number;
};
type EvaluatorData = {
  user_id: number;
  first_name: string | null;
  last_name: string | null;
  evaluator_email: string;
  submission_token: string | null;
  submitted_at: string | null;
  mean_score: number | string | null;
};

function formatScore(score: number | string | null | undefined): string {
  if (score === null || score === undefined) return "—";
  const num = Number(score);
  if (Number.isNaN(num)) return "—";
  return num.toFixed(2);
}

function getAvatarColor(name: string) {
  const colors = ["bg-blue-100 text-blue-600", "bg-teal-100 text-teal-600", "bg-indigo-100 text-indigo-600", "bg-purple-100 text-purple-600"];
  const charCode = name.charCodeAt(0) || 0;
  return colors[charCode % colors.length];
}

export default function SubmissionsPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [targetId, setTargetId] = useState("");
  
  const [evaluators, setEvaluators] = useState<EvaluatorData[]>([]);
  const [officeMean, setOfficeMean] = useState<number | null>(null);
  
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [deletingToken, setDeletingToken] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ items: Cycle[] }>("/api/admin/cycles"),
      apiFetch<{ items: Target[] }>("/api/admin/targets"),
    ])
      .then(([cycleData, targetData]) => {
        if (!active) return;
        const availableCycles = cycleData.items.filter(
          (cycle) => cycle.status === "open" || cycle.status === "closed",
        );
        setCycles(availableCycles);
        setTargets(targetData.items);
        if (availableCycles.length) {
          setCycleId(String(availableCycles[0].id));
          const firstTarget = targetData.items.find((target) =>
            availableCycles[0].target_ids.includes(target.id),
          );
          if (firstTarget) setTargetId(String(firstTarget.id));
        }
      })
      .catch((requestError: Error) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoadingOptions(false); });
    return () => { active = false; };
  }, []);

  const selectedCycle = cycles.find((cycle) => String(cycle.id) === cycleId);
  const availableTargets = targets.filter((target) => selectedCycle?.target_ids.includes(target.id));

  useEffect(() => {
    if (!cycleId || !targetId) return;
    let active = true;
    setLoadingSubmissions(true);
    apiFetch<{ items: EvaluatorData[], office_mean: number | null }>(
      `/api/admin/submissions?cycle_id=${encodeURIComponent(cycleId)}&target_id=${encodeURIComponent(targetId)}`,
    )
      .then((data) => {
        if (active) {
          const sorted = [...data.items].sort((a, b) => (b.submission_token ? 1 : 0) - (a.submission_token ? 1 : 0));
          setEvaluators(sorted);
          setOfficeMean(data.office_mean);
        }
      })
      .catch((requestError: Error) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoadingSubmissions(false); });
    return () => { active = false; };
  }, [cycleId, targetId]);

  async function removeSubmission(evaluator: EvaluatorData) {
    if (!evaluator.submission_token) return;
    
    const displayName = evaluator.first_name || evaluator.last_name 
      ? `${evaluator.first_name ?? ''} ${evaluator.last_name ?? ''}`.trim() 
      : evaluator.evaluator_email;
      
    if (!window.confirm(`Remove the evaluation submitted by ${displayName}?`)) return;

    setError("");
    setDeletingToken(evaluator.submission_token);
    try {
      await apiFetch("/api/admin/submissions", {
        method: "DELETE",
        body: JSON.stringify({ submission_token: evaluator.submission_token }),
      });
      
      const nextEvaluators = evaluators.map(ev => 
        ev.user_id === evaluator.user_id ? { ...ev, submission_token: null, mean_score: null, submitted_at: null } : ev
      );
      setEvaluators(nextEvaluators);
      
      const validScores = nextEvaluators
        .map(s => s.mean_score !== null ? Number(s.mean_score) : null)
        .filter((s): s is number => s !== null && !Number.isNaN(s));

      if (validScores.length > 0) {
        const newMean = validScores.reduce((a, b) => a + b, 0) / validScores.length;
        setOfficeMean(Number(newMean.toFixed(2)));
      } else {
        setOfficeMean(null);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The evaluation could not be removed.");
    } finally {
      setDeletingToken("");
    }
  }

  // --- Radial Layout Calculation ---
  const centerX = 500;
  const centerY = 350;
  const radiusX = 380; 
  const radiusY = 250; 

  const positionedEvaluators = evaluators.map((evaluator, index) => {
    const angle = (index / Math.max(evaluators.length, 1)) * 2 * Math.PI - Math.PI / 2;
    const x = centerX + radiusX * Math.cos(angle);
    const y = centerY + radiusY * Math.sin(angle);
    return { ...evaluator, x, y };
  });

  const currentTarget = availableTargets.find((t) => String(t.id) === targetId);

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-900">
      
      {/* Top Bar */}
      <div className="border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="mx-auto flex max-w-[1400px] flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1F3A5F]">Evaluation Overview</h1>
            <p className="mt-1 text-sm text-slate-500">Review the evaluators and their scores for each office.</p>
          </div>
          
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-[#1F3A5F]">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <select
              value={cycleId}
              onChange={(e) => {
                setCycleId(e.target.value);
                const nextCycle = cycles.find(c => String(c.id) === e.target.value);
                const nextTargets = targets.filter(t => nextCycle?.target_ids.includes(t.id));
                setTargetId(nextTargets.length ? String(nextTargets[0].id) : "");
              }}
              className="bg-transparent text-sm font-semibold text-[#1F3A5F] outline-none cursor-pointer"
            >
              {cycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>{cycle.name} ({cycle.status})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && <p className="mx-auto max-w-[1400px] mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {/* Main Content Area */}
      <div className="mx-auto flex max-w-[1400px] flex-col md:flex-row gap-6 p-4 sm:p-8">
        
        {/* Left Sidebar: Scrollable Office List */}
        <aside className="w-full md:w-80 shrink-0 flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden h-[calc(100vh-140px)]">
          <div className="border-b border-slate-100 p-4 bg-slate-50/50">
            <h2 className="font-semibold text-[#1F3A5F]">Offices / Targets</h2>
            <p className="text-xs text-slate-500 mt-1">{availableTargets.length} items in this cycle</p>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {availableTargets.map((target) => {
              const isSelected = String(target.id) === targetId;
              return (
                <button
                  key={target.id}
                  onClick={() => setTargetId(String(target.id))}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors flex flex-col gap-1 ${
                    isSelected 
                      ? "bg-teal-50 border-l-4 border-l-teal-500" 
                      : "border-l-4 border-l-transparent hover:bg-slate-50"
                  }`}
                >
                  <span className={`font-semibold ${isSelected ? 'text-teal-900' : 'text-slate-800'}`}>
                    {target.name}
                  </span>
                  <span className="text-xs text-slate-500 truncate">
                    {TARGET_TYPE_LABELS[target.target_type]} · {getTargetLocationLabel(target.campus_name, Boolean(target.is_central))}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right Side: Radial Diagram */}
        <main className="flex-1 min-w-0">
          {loadingSubmissions ? (
            <div className="flex h-[600px] items-center justify-center rounded-3xl border border-slate-200 bg-white">
               <svg className="mr-3 h-8 w-8 animate-spin text-teal-600" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : currentTarget ? (
            <div className="relative w-full overflow-x-auto rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              
              <div className="relative mx-auto h-[700px] min-w-[1000px]">
                
                {/* Connector Lines */}
                <svg className="absolute inset-0 h-full w-full pointer-events-none">
                  {positionedEvaluators.map((e) => (
                    <line
                      key={`line-${e.user_id}`}
                      x1={centerX}
                      y1={centerY}
                      x2={e.x}
                      y2={e.y}
                      stroke="#CBD5E1"
                      strokeWidth="2"
                      strokeDasharray="6 6"
                    />
                  ))}
                </svg>

                {/* Center Office Hub */}
                <div 
                  className="absolute flex h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-[10px] border-white bg-gradient-to-b from-blue-50 to-white shadow-xl shadow-blue-900/10"
                  style={{ left: centerX, top: centerY }}
                >
                  <div className="absolute inset-0 rounded-full border-[8px] border-transparent [background:linear-gradient(135deg,#0EA5E9,#10B981)_border-box] [-webkit-mask:linear-gradient(#fff_0_0)_padding-box,linear-gradient(#fff_0_0)] [-webkit-mask-composite:xor] [mask-composite:exclude] pointer-events-none opacity-80" />
                  
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-2 h-12 w-12">
                    <path d="M3 21h18" />
                    <path d="M9 8h1" /><path d="M9 12h1" /><path d="M9 16h1" />
                    <path d="M14 8h1" /><path d="M14 12h1" /><path d="M14 16h1" />
                    <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
                  </svg>
                  
                  <h3 className="w-40 text-center text-lg font-bold leading-tight text-[#1F3A5F]">
                    {currentTarget.name}
                  </h3>
                  
                  <div className="mt-2 flex flex-col items-center rounded-full bg-white px-6 py-2 shadow-sm border border-slate-100">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Mean Score</span>
                    <span className="text-2xl font-black text-[#1F3A5F]">{officeMean !== null ? officeMean.toFixed(2) : "—"}</span>
                  </div>
                </div>

                {positionedEvaluators.map((e) => {
                  const fullName = `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() || e.evaluator_email;
                  const isSubmitted = !!e.submission_token;
                  const avatarColor = getAvatarColor(fullName);
                  
                  return (
                    <Fragment key={e.user_id}>
                      <div
                        className="absolute flex w-[280px] -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-lg shadow-slate-200/50 transition hover:scale-105"
                        style={{ left: e.x, top: e.y }}
                      >
                        <div className="relative">
                          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold ${avatarColor}`}>
                            {e.first_name?.[0]}{e.last_name?.[0]}
                          </div>
                          <div className={`absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white ${isSubmitted ? 'bg-green-500 text-white' : 'bg-amber-400 text-white'}`}>
                            {isSubmitted ? (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><polyline points="20 6 9 17 4 12" /></svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-bold text-slate-800">{fullName}</p>
                          <p className={`text-xs font-semibold ${isSubmitted ? 'text-blue-600' : 'text-slate-400'}`}>
                            Score: {isSubmitted ? formatScore(e.mean_score) : "—"}
                          </p>
                          {isSubmitted ? (
                            <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-green-600">
                              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-green-100">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5"><polyline points="20 6 9 17 4 12" /></svg>
                              </div>
                              Evaluated
                            </div>
                          ) : (
                            <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-600">
                              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-100">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                              </div>
                              Pending
                            </div>
                          )}
                        </div>

                        {isSubmitted && (
                          <button
                            onClick={() => removeSubmission(e)}
                            disabled={deletingToken === e.submission_token}
                            className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-600 shadow-sm transition hover:bg-red-200 hover:text-red-700 disabled:opacity-50"
                            title="Remove Evaluation"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                              <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </Fragment>
                  );
                })}
              </div>
              
              <div className="mt-4 flex items-center justify-center gap-8 border-t border-slate-100 pt-6">
                 <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                   <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-white">
                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><polyline points="20 6 9 17 4 12" /></svg>
                   </div>
                   Evaluated
                 </div>
                 <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                   <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-white">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                   </div>
                   Pending
                 </div>
              </div>
            </div>
          ) : (
             <div className="flex h-150 items-center justify-center rounded-3xl border border-slate-200 bg-white text-slate-500">
               Select an office from the list to view the evaluations.
             </div>
          )}
        </main>
      </div>
    </div>
  );
}