"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

type QuestionType = "scale" | "rating" | "single_choice" | "multi_choice" | "yes_no" | "text";
type ChoiceDraft = { id?: number; label: string; points: number };
type QuestionDraft = {
  id: string;
  serverId?: number;
  text: string;
  type: QuestionType;
  required: boolean;
  options: ChoiceDraft[];
  scoreWeight: number;
  scaleMin: number;
  scaleMax: number;
  minLabel: string;
  maxLabel: string;
};
type SectionDraft = { id: string; serverId?: number; title: string; questions: QuestionDraft[] };
type Survey = {
  id: number;
  title: string;
  description: string | null;
  version: number;
  status: "draft" | "published" | "archived";
};
type SurveyDetail = Survey & {
  sections: {
    id: number;
    title: string;
    questions: {
      id: number;
      question_text: string;
      type: QuestionType;
      required: boolean;
      options: { id: number; label: string; points: number | string }[];
      score_weight: number | string;
      scale_min: number | null;
      scale_max: number | null;
      min_label: string | null;
      max_label: string | null;
    }[];
  }[];
};

const fieldClassName =
  "mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10";

function createQuestion(): QuestionDraft {
  return {
    id: crypto.randomUUID(),
    text: "",
    type: "scale",
    required: false,
    options: [{ label: "Option 1", points: 1 }, { label: "Option 2", points: 1 }],
    scoreWeight: 1,
    scaleMin: 1,
    scaleMax: 5,
    minLabel: "",
    maxLabel: "",
  };
}

function createSection(title = "Untitled section"): SectionDraft {
  return { id: crypto.randomUUID(), title, questions: [createQuestion()] };
}

function initialSections(): SectionDraft[] {
  return [{
    id: "section-1",
    title: "Questions",
    questions: [{
      id: "question-1",
      text: "",
      type: "scale",
      required: false,
      options: [{ label: "Option 1", points: 1 }, { label: "Option 2", points: 1 }],
      scoreWeight: 1,
      scaleMin: 1,
      scaleMax: 5,
      minLabel: "",
      maxLabel: "",
    }],
  }];
}

const questionTypes: { value: QuestionType; label: string }[] = [
  { value: "scale", label: "Linear scale" },
  { value: "rating", label: "Rating" },
  { value: "single_choice", label: "Multiple choice" },
  { value: "multi_choice", label: "Checkboxes" },
  { value: "yes_no", label: "Yes / No" },
  { value: "text", label: "Paragraph" },
];

function questionMaximumScore(question: QuestionDraft): number {
  if (question.type === "scale" || question.type === "rating") {
    return question.scaleMax * question.scoreWeight;
  }
  if (question.type === "yes_no") return question.scoreWeight;
  if (question.type === "single_choice") {
    return Math.max(0, ...question.options.map((option) => option.points));
  }
  if (question.type === "multi_choice") {
    return question.options.reduce((total, option) => total + option.points, 0);
  }
  return 0;
}

function displayScore(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/* ---------------- Icons ---------------- */
function PencilIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function CopyIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
function TrashIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
function SendIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

/* ---------------- Preview ---------------- */
function SurveyPreview({
  title,
  description,
  sections,
}: {
  title: string;
  description: string;
  sections: SectionDraft[];
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50">
        <div className="relative overflow-hidden bg-linear-to-br from-[#1F3A5F] via-[#1a4a5f] to-[#0F9D8A] px-6 py-7 text-white sm:px-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-teal-100 ring-1 ring-white/20">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-300" aria-hidden="true" />
              Respondent preview
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight">{title || "Untitled survey"}</h2>
            {description && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-teal-50/90">{description}</p>}
          </div>
        </div>
      </section>
      {sections.map((section, sectionIndex) => (
        <section key={section.id} className="space-y-4">
          {(sections.length > 1 || section.title) && (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-[#1F3A5F] to-[#0F9D8A] text-xs font-bold text-white">
                {sectionIndex + 1}
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Section {sectionIndex + 1}</p>
                <h3 className="text-base font-semibold text-[#1F3A5F]">{section.title || "Untitled section"}</h3>
              </div>
            </div>
          )}
          {section.questions.map((question, questionIndex) => (
            <article key={question.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h4 className="text-[15px] font-semibold text-slate-800">
                {question.text || `Question ${questionIndex + 1}`}
                {question.required && <span className="ml-1 text-red-600" aria-label="required">*</span>}
              </h4>
              {question.type === "single_choice" || question.type === "multi_choice" ? (
                <div className="mt-4 space-y-2.5">
                  {question.options.map((option, optionIndex) => (
                    <label key={`${question.id}-preview-${optionIndex}`} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-700">
                      <input type={question.type === "single_choice" ? "radio" : "checkbox"} disabled className="h-4 w-4 accent-[#0F9D8A]" />
                      {option.label || `Option ${optionIndex + 1}`}
                    </label>
                  ))}
                </div>
              ) : question.type === "yes_no" ? (
                <div className="mt-4 flex gap-3">
                  {["Yes", "No"].map((choice) => (
                    <span key={choice} className="inline-flex min-w-24 justify-center rounded-xl border border-slate-200 px-6 py-2.5 text-sm text-slate-600">{choice}</span>
                  ))}
                </div>
              ) : question.type === "text" ? (
                <textarea disabled rows={3} placeholder="Long-answer text" className={`${fieldClassName} max-w-xl`} />
              ) : (
                <div className="mt-4 max-w-xl">
                  <div className="flex justify-between gap-4 text-xs font-medium text-slate-500">
                    <span>{question.minLabel || question.scaleMin}</span>
                    <span>{question.maxLabel || question.scaleMax}</span>
                  </div>
                  <input type="range" min={question.scaleMin} max={question.scaleMax} disabled aria-label="Scale answer preview" className="mt-2 w-full accent-[#0F9D8A]" />
                </div>
              )}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

export default function SurveyBuilderPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sections, setSections] = useState<SectionDraft[]>(initialSections);
  const [editingSurveyId, setEditingSurveyId] = useState<number | null>(null);
  const [loadingSurveyId, setLoadingSurveyId] = useState<number | null>(null);
  const [busySurveyId, setBusySurveyId] = useState<number | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const totalQuestions = sections.reduce((total, section) => total + section.questions.length, 0);
  const maximumScore = sections.reduce(
    (total, section) => total + section.questions.reduce((subtotal, question) => subtotal + questionMaximumScore(question), 0),
    0,
  );

  async function loadSurveys() {
    const data = await apiFetch<{ items: Survey[] }>("/api/admin/surveys");
    setSurveys(data.items);
  }

  function resetEditor() {
    setEditingSurveyId(null);
    setTitle("");
    setDescription("");
    setSections(initialSections());
    setPreviewMode(false);
  }

  async function editSurvey(survey: Survey) {
    setError("");
    setNotice("");
    setLoadingSurveyId(survey.id);
    try {
      const detail = await apiFetch<SurveyDetail>(`/api/admin/surveys/${survey.id}`);
      setEditingSurveyId(survey.id);
      setTitle(detail.title);
      setDescription(detail.description ?? "");
      setSections(detail.sections.map((section) => ({
        id: crypto.randomUUID(),
        serverId: section.id,
        title: section.title,
        questions: section.questions.map((question) => ({
          id: crypto.randomUUID(),
          serverId: question.id,
          text: question.question_text,
          type: question.type,
          required: question.required,
          options: question.options.map((option) => ({
            id: option.id,
            label: option.label,
            points: Number(option.points),
          })),
          scoreWeight: Number(question.score_weight ?? 1),
          scaleMin: question.scale_min ?? 1,
          scaleMax: question.scale_max ?? 5,
          minLabel: question.min_label ?? "",
          maxLabel: question.max_label ?? "",
        })),
      })));
      setPreviewMode(false);
      document.getElementById("survey-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The survey could not be opened for editing.");
    } finally {
      setLoadingSurveyId(null);
    }
  }

  async function duplicateSurvey(survey: Survey) {
    setError("");
    setNotice("");
    setBusySurveyId(survey.id);
    try {
      await apiFetch(`/api/admin/surveys/${survey.id}/clone`, { method: "POST" });
      await loadSurveys();
      setNotice("Survey duplicated.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The survey could not be duplicated.");
    } finally {
      setBusySurveyId(null);
    }
  }

  async function deleteSurvey(survey: Survey) {
    if (!window.confirm(`Delete "${survey.title}"? This action cannot be undone.`)) return;
    setError("");
    setNotice("");
    setBusySurveyId(survey.id);
    try {
      await apiFetch(`/api/admin/surveys/${survey.id}`, { method: "DELETE" });
      setNotice("Survey deleted.");
      if (editingSurveyId === survey.id) resetEditor();
      try {
        await loadSurveys();
      } catch {
        setError("The survey was deleted, but the survey list could not be refreshed.");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The survey could not be deleted.");
    } finally {
      setBusySurveyId(null);
    }
  }

  useEffect(() => {
    let active = true;
    apiFetch<{ items: Survey[] }>("/api/admin/surveys")
      .then((data) => {
        if (active) setSurveys(data.items);
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

  function updateSection(sectionId: string, patch: Partial<Pick<SectionDraft, "title">>) {
    setSections((current) =>
      current.map((section) => section.id === sectionId ? { ...section, ...patch } : section),
    );
  }

  function updateQuestion(sectionId: string, questionId: string, patch: Partial<QuestionDraft>) {
    setSections((current) =>
      current.map((section) => section.id !== sectionId ? section : {
        ...section,
        questions: section.questions.map((question) =>
          question.id === questionId ? { ...question, ...patch } : question,
        ),
      }),
    );
  }

  function addQuestion(sectionId: string) {
    setSections((current) =>
      current.map((section) => section.id === sectionId
        ? { ...section, questions: [...section.questions, createQuestion()] }
        : section),
    );
  }

  function duplicateQuestion(sectionId: string, questionId: string) {
    setSections((current) =>
      current.map((section) => {
        if (section.id !== sectionId) return section;
        const source = section.questions.find((question) => question.id === questionId);
        if (!source) return section;
        const copy = {
          ...source,
          id: crypto.randomUUID(),
          options: source.options.map((option) => ({ ...option })),
        };
        const index = section.questions.findIndex((question) => question.id === questionId);
        const questions = [...section.questions];
        questions.splice(index + 1, 0, copy);
        return { ...section, questions };
      }),
    );
  }

  function moveQuestion(sectionId: string, questionId: string, offset: -1 | 1) {
    setSections((current) =>
      current.map((section) => {
        if (section.id !== sectionId) return section;
        const index = section.questions.findIndex((question) => question.id === questionId);
        const nextIndex = index + offset;
        if (index < 0 || nextIndex < 0 || nextIndex >= section.questions.length) return section;
        const questions = [...section.questions];
        [questions[index], questions[nextIndex]] = [questions[nextIndex], questions[index]];
        return { ...section, questions };
      }),
    );
  }

  function removeQuestion(sectionId: string, questionId: string) {
    setSections((current) =>
      current.map((section) => section.id === sectionId
        ? { ...section, questions: section.questions.filter((question) => question.id !== questionId) }
        : section),
    );
  }

  function updateOption(sectionId: string, questionId: string, optionIndex: number, patch: Partial<ChoiceDraft>) {
    setSections((current) =>
      current.map((section) => section.id !== sectionId ? section : {
        ...section,
        questions: section.questions.map((question) => {
          if (question.id !== questionId) return question;
          const options = [...question.options];
          options[optionIndex] = { ...options[optionIndex], ...patch };
          return { ...question, options };
        }),
      }),
    );
  }

  function addSection() {
    setSections((current) => [...current, createSection(`Section ${current.length + 1}`)]);
  }

  async function createSurvey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      await apiFetch(editingSurveyId ? `/api/admin/surveys/${editingSurveyId}` : "/api/admin/surveys", {
        method: editingSurveyId ? "PUT" : "POST",
        body: JSON.stringify({
          title,
          description,
          sections: sections.map((section) => ({
            id: section.serverId,
            title: section.title,
            questions: section.questions.map((question) => ({
              id: question.serverId,
              text: question.text,
              type: question.type,
              required: question.required,
              options: ["single_choice", "multi_choice"].includes(question.type)
                ? question.options.map((option) => ({
                    id: option.id,
                    label: option.label.trim(),
                    points: option.points,
                  }))
                : [],
              score_weight: question.scoreWeight,
              scale_min: question.scaleMin,
              scale_max: question.scaleMax,
              min_label: question.minLabel,
              max_label: question.maxLabel,
            })),
          })),
        }),
      });
      setNotice(editingSurveyId ? "Survey updated." : "Draft saved.");
      resetEditor();
      try {
        await loadSurveys();
      } catch {
        setError("The survey was saved, but the survey list could not be refreshed.");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The survey could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function performAction(id: number) {
    setError("");
    setNotice("");
    setBusySurveyId(id);
    try {
      await apiFetch(`/api/admin/surveys/${id}/publish`, { method: "POST" });
      setNotice("Survey published.");
      try {
        await loadSurveys();
      } catch {
        setError("The survey action completed, but the survey list could not be refreshed.");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The survey action failed.");
    } finally {
      setBusySurveyId(null);
    }
  }

  const invalidScale = sections.some((section) =>
    section.questions.some((question) =>
      (question.type === "scale" || question.type === "rating") && question.scaleMin >= question.scaleMax,
    ),
  );

  const actionBtn =
    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="space-y-7">
      {/* Hero */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-teal-800 ring-1 ring-teal-600/15">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden="true" />
            Survey design
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#1F3A5F] sm:text-4xl">Survey Builder</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Create surveys and edit existing surveys in place. Drafts can be published when they are ready.
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p>{error}</p>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <p>{notice}</p>
        </div>
      )}

      {/* Editor header */}
      <section
        id="survey-editor"
        className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/50 sm:p-6"
      >
        <div>
          <h2 className="text-lg font-semibold text-[#1F3A5F]">
            {editingSurveyId ? "Edit survey" : "Create a survey"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {sections.length} sections · {totalQuestions} questions · {displayScore(maximumScore)} maximum points.
            {" "}Section scores sum question scores; mean = total ÷ section count.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editingSurveyId !== null && (
            <button
              type="button"
              onClick={resetEditor}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel editing
            </button>
          )}
          <button
            type="button"
            onClick={() => setPreviewMode((current) => !current)}
            aria-pressed={previewMode}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-[#1F3A5F] transition hover:bg-slate-50"
          >
            {previewMode ? "Back to editor" : "Preview"}
          </button>
        </div>
      </section>

      {previewMode ? (
        <SurveyPreview title={title} description={description} sections={sections} />
      ) : (
        <form onSubmit={createSurvey} className="space-y-6">
          {/* Title / description */}
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="h-1.5 bg-linear-to-r from-[#1F3A5F] to-[#0F9D8A]" />
            <div className="grid gap-4 p-5 sm:p-6">
              <label className="text-sm font-semibold text-slate-700">
                Survey title
                <input
                  required
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Untitled survey"
                  className={fieldClassName}
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Description
                <textarea
                  rows={2}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe the purpose of this survey"
                  className={fieldClassName}
                />
              </label>
            </div>
          </section>

          {sections.map((section, sectionIndex) => (
            <section key={section.id} className="space-y-4 rounded-3xl border border-slate-200 bg-slate-100/70 p-4 sm:p-5">
              {/* Section header */}
              <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-[#1F3A5F] to-[#0F9D8A] text-sm font-bold text-white shadow-sm">
                  {sectionIndex + 1}
                </span>
                <label className="min-w-48 flex-1 text-sm font-semibold text-slate-700">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Section title</span>
                  <input
                    required
                    maxLength={200}
                    value={section.title}
                    onChange={(event) => updateSection(section.id, { title: event.target.value })}
                    className={fieldClassName}
                  />
                </label>
                <span className="mt-6 whitespace-nowrap rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800 ring-1 ring-teal-600/15">
                  Max: {displayScore(section.questions.reduce(
                    (total, question) => total + questionMaximumScore(question),
                    0,
                  ))} pts
                </span>
                {sections.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSections((current) => current.filter((item) => item.id !== section.id))}
                    aria-label={`Remove section ${sectionIndex + 1}`}
                    className={`${actionBtn} mt-6 border-red-200 text-red-700 hover:bg-red-50`}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                    Remove
                  </button>
                )}
              </div>

              {section.questions.map((question, questionIndex) => {
                const isChoice = question.type === "single_choice" || question.type === "multi_choice";
                const invalidScaleQuestion = question.scaleMin >= question.scaleMax;
                return (
                  <article key={question.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_13rem]">
                      <label className="text-sm font-semibold text-slate-700">
                        Question {questionIndex + 1}
                        <input
                          required
                          maxLength={500}
                          value={question.text}
                          onChange={(event) => updateQuestion(section.id, question.id, { text: event.target.value })}
                          placeholder="Write your question"
                          className={fieldClassName}
                        />
                      </label>
                      <label className="text-sm font-semibold text-slate-700">
                        Answer type
                        <select
                          value={question.type}
                          onChange={(event) => updateQuestion(section.id, question.id, { type: event.target.value as QuestionType })}
                          className={fieldClassName}
                        >
                          {questionTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                        </select>
                      </label>
                    </div>

                    {isChoice && (
                      <fieldset className="mt-5 space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                        <legend className="px-1 text-sm font-semibold text-slate-700">
                          Answer choices · selected choices contribute assigned points
                        </legend>
                        {question.options.map((option, optionIndex) => (
                          <div key={`${question.id}-option-${optionIndex}`} className="flex items-center gap-3">
                            <span aria-hidden="true" className={`h-4 w-4 shrink-0 border-2 border-slate-400 ${
                              question.type === "single_choice" ? "rounded-full" : "rounded"
                            }`} />
                            <input
                              required
                              maxLength={200}
                              value={option.label}
                              onChange={(event) => updateOption(section.id, question.id, optionIndex, { label: event.target.value })}
                              aria-label={`Choice ${optionIndex + 1}`}
                              className="min-w-0 flex-1 rounded-lg border-0 border-b border-slate-200 bg-transparent px-1 py-2 text-sm outline-none transition focus:border-teal-600"
                            />
                            <label className="w-24 shrink-0 text-xs font-semibold text-slate-600">
                              Points
                              <input
                                type="number"
                                min={0}
                                max={10000}
                                step={0.01}
                                value={option.points}
                                onChange={(event) => updateOption(
                                  section.id,
                                  question.id,
                                  optionIndex,
                                  { points: Number(event.target.value) },
                                )}
                                aria-label={`Points for choice ${optionIndex + 1}`}
                                className={fieldClassName}
                              />
                            </label>
                            {question.options.length > 1 && (
                              <button
                                type="button"
                                onClick={() => updateQuestion(section.id, question.id, {
                                  options: question.options.filter((_, index) => index !== optionIndex),
                                })}
                                aria-label={`Remove choice ${optionIndex + 1}`}
                                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-700"
                              >
                                <TrashIcon className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => updateQuestion(section.id, question.id, {
                            options: [
                              ...question.options,
                              { label: `Option ${question.options.length + 1}`, points: 1 },
                            ],
                          })}
                          className="ml-7 inline-flex items-center gap-1 text-sm font-semibold text-teal-800 hover:underline"
                        >
                          + Add choice
                        </button>
                      </fieldset>
                    )}

                    {(question.type === "scale" || question.type === "rating") && (
                      <div className="mt-5 space-y-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                        <p className="text-sm font-semibold text-slate-700">
                          {question.type === "scale" ? "Scale range" : "Rating range"}
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="text-xs font-semibold text-slate-600">
                            Starts at
                            <input
                              type="number"
                              value={question.scaleMin}
                              onChange={(event) => updateQuestion(section.id, question.id, { scaleMin: Number(event.target.value) })}
                              className={fieldClassName}
                            />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">
                            Ends at
                            <input
                              type="number"
                              value={question.scaleMax}
                              onChange={(event) => updateQuestion(section.id, question.id, { scaleMax: Number(event.target.value) })}
                              className={fieldClassName}
                            />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">
                            Start label (optional)
                            <input
                              maxLength={60}
                              value={question.minLabel}
                              onChange={(event) => updateQuestion(section.id, question.id, { minLabel: event.target.value })}
                              placeholder="Not satisfied"
                              className={fieldClassName}
                            />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">
                            End label (optional)
                            <input
                              maxLength={60}
                              value={question.maxLabel}
                              onChange={(event) => updateQuestion(section.id, question.id, { maxLabel: event.target.value })}
                              placeholder="Very satisfied"
                              className={fieldClassName}
                            />
                          </label>
                        </div>
                        <label className="block max-w-xs text-xs font-semibold text-slate-600">
                          Score multiplier
                          <input
                            type="number"
                            min={0}
                            max={10000}
                            step={0.01}
                            value={question.scoreWeight}
                            onChange={(event) => updateQuestion(
                              section.id,
                              question.id,
                              { scoreWeight: Number(event.target.value) },
                            )}
                            className={fieldClassName}
                          />
                        </label>
                        <p className="text-xs text-slate-500">Score = selected value × multiplier.</p>
                        {invalidScaleQuestion && (
                          <p role="alert" className="text-sm font-medium text-red-700">The end of the scale must be greater than its start.</p>
                        )}
                      </div>
                    )}

                    {question.type === "text" && (
                      <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                        Long-answer text response
                      </div>
                    )}
                    {question.type === "yes_no" && (
                      <div className="mt-5 space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                        <div className="flex gap-3">
                          {["Yes", "No"].map((choice) => (
                            <span key={choice} className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm text-slate-600">{choice}</span>
                          ))}
                        </div>
                        <label className="block max-w-xs text-xs font-semibold text-slate-600">
                          Yes score multiplier
                          <input
                            type="number"
                            min={0}
                            max={10000}
                            step={0.01}
                            value={question.scoreWeight}
                            onChange={(event) => updateQuestion(
                              section.id,
                              question.id,
                              { scoreWeight: Number(event.target.value) },
                            )}
                            className={fieldClassName}
                          />
                        </label>
                        <p className="text-xs text-slate-500">Yes = multiplier; No = 0.</p>
                      </div>
                    )}

                    {/* Question footer */}
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={question.required}
                          onChange={(event) => updateQuestion(section.id, question.id, { required: event.target.checked })}
                          className="h-4 w-4 rounded accent-[#0F9D8A]"
                        />
                        Required
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => moveQuestion(section.id, question.id, -1)}
                          disabled={questionIndex === 0}
                          className={`${actionBtn} border-slate-200 text-slate-600 hover:bg-slate-50`}
                        >
                          ↑ Up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveQuestion(section.id, question.id, 1)}
                          disabled={questionIndex === section.questions.length - 1}
                          className={`${actionBtn} border-slate-200 text-slate-600 hover:bg-slate-50`}
                        >
                          ↓ Down
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicateQuestion(section.id, question.id)}
                          className={`${actionBtn} border-slate-200 text-teal-800 hover:bg-teal-50`}
                        >
                          <CopyIcon className="h-3.5 w-3.5" />
                          Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() => removeQuestion(section.id, question.id)}
                          disabled={totalQuestions <= 1}
                          className={`${actionBtn} border-red-200 text-red-700 hover:bg-red-50`}
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}

              <button
                type="button"
                onClick={() => addQuestion(section.id)}
                className="w-full rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-teal-800 transition hover:border-teal-500 hover:bg-teal-50/50"
              >
                + Add question
              </button>
            </section>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={addSection}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-[#1F3A5F] transition hover:bg-slate-50"
            >
              + Add section
            </button>
            <button
              type="submit"
              disabled={saving || invalidScale}
              className="rounded-xl bg-linear-to-r from-[#0F9D8A] to-[#0C8575] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-600/20 transition hover:shadow-teal-600/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
            >
              {saving ? "Saving…" : editingSurveyId ? "Update survey" : "Save draft"}
            </button>
          </div>
        </form>
      )}

      {/* Saved surveys (card list) */}
      <section id="saved-surveys" className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-[#1F3A5F]">Saved surveys</h2>
          {!loading && surveys.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
              {surveys.length}
            </span>
          )}
        </div>

        {loading ? (
          <p className="px-5 py-6 text-sm text-slate-500">Loading surveys…</p>
        ) : surveys.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No surveys created.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {surveys.map((survey) => {
              const busy = busySurveyId === survey.id;
              const statusStyle =
                survey.status === "published"
                  ? "bg-teal-50 text-teal-700 ring-teal-600/20"
                  : survey.status === "archived"
                    ? "bg-slate-100 text-slate-600 ring-slate-400/20"
                    : "bg-amber-50 text-amber-800 ring-amber-500/20";
              return (
                <li key={survey.id} className="flex flex-col gap-3 px-5 py-4 transition hover:bg-slate-50/60 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800">{survey.title}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">v{survey.version}</span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold capitalize ring-1 ${statusStyle}`}>
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            survey.status === "published" ? "bg-teal-500" : survey.status === "archived" ? "bg-slate-400" : "bg-amber-500"
                          }`}
                          aria-hidden="true"
                        />
                        {survey.status}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={loadingSurveyId !== null || busy}
                      onClick={() => editSurvey(survey)}
                      className={`${actionBtn} border-[#1F3A5F]/20 text-[#1F3A5F] hover:bg-slate-100`}
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                      {loadingSurveyId === survey.id ? "Opening…" : "Edit"}
                    </button>
                    <button
                      type="button"
                      disabled={busy || loadingSurveyId !== null}
                      onClick={() => duplicateSurvey(survey)}
                      className={`${actionBtn} border-teal-600/20 text-teal-800 hover:bg-teal-50`}
                    >
                      <CopyIcon className="h-3.5 w-3.5" />
                      Duplicate
                    </button>
                    {survey.status === "draft" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => performAction(survey.id)}
                        className={`${actionBtn} border-teal-600/20 text-teal-800 hover:bg-teal-50`}
                      >
                        <SendIcon className="h-3.5 w-3.5" />
                        {busy ? "Working…" : "Publish"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => deleteSurvey(survey)}
                      className={`${actionBtn} border-red-200 text-red-700 hover:bg-red-50`}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}