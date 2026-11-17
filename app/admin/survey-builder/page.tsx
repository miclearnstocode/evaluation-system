"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

type QuestionType = "scale" | "rating" | "single_choice" | "multi_choice" | "yes_no" | "text";
type QuestionDraft = {
  id: string;
  text: string;
  type: QuestionType;
  required: boolean;
  options: string[];
  scaleMin: number;
  scaleMax: number;
  minLabel: string;
  maxLabel: string;
};
type SectionDraft = { id: string; title: string; questions: QuestionDraft[] };
type Survey = {
  id: number;
  title: string;
  description: string | null;
  version: number;
  status: "draft" | "published" | "archived";
};

const fieldClassName =
  "mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15";

function createQuestion(): QuestionDraft {
  return {
    id: crypto.randomUUID(),
    text: "",
    type: "scale",
    required: false,
    options: ["Option 1", "Option 2"],
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
      options: ["Option 1", "Option 2"],
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

export default function SurveyBuilderPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sections, setSections] = useState<SectionDraft[]>(initialSections);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const totalQuestions = sections.reduce((total, section) => total + section.questions.length, 0);

  async function loadSurveys() {
    const data = await apiFetch<{ items: Survey[] }>("/api/admin/surveys");
    setSurveys(data.items);
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

  function updateQuestion(
    sectionId: string,
    questionId: string,
    patch: Partial<QuestionDraft>,
  ) {
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
        const copy = { ...source, id: crypto.randomUUID(), options: [...source.options] };
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

  function updateOption(sectionId: string, questionId: string, optionIndex: number, value: string) {
    setSections((current) =>
      current.map((section) => section.id !== sectionId ? section : {
        ...section,
        questions: section.questions.map((question) => {
          if (question.id !== questionId) return question;
          const options = [...question.options];
          options[optionIndex] = value;
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
    setSaving(true);
    try {
      await apiFetch("/api/admin/surveys", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          sections: sections.map((section) => ({
            title: section.title,
            questions: section.questions.map((question) => ({
              text: question.text,
              type: question.type,
              required: question.required,
              options: ["single_choice", "multi_choice"].includes(question.type)
                ? question.options.map((option) => option.trim())
                : [],
              scale_min: question.scaleMin,
              scale_max: question.scaleMax,
              min_label: question.minLabel,
              max_label: question.maxLabel,
            })),
          })),
        }),
      });
      setTitle("");
      setDescription("");
      setSections(initialSections());
      await loadSurveys();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The survey could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function performAction(id: number, action: "publish" | "clone") {
    setError("");
    try {
      await apiFetch(`/api/admin/surveys/${id}/${action}`, { method: "POST" });
      await loadSurveys();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The survey action failed.");
    }
  }

  return (
    <div className="space-y-7">
      <div>
        <p className="text-sm font-medium text-teal-800">Survey design</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1F3A5F]">Survey Builder</h1>
        <p className="mt-2 text-sm text-slate-600">Add as many sections and questions as you need. Choose an answer type for each question.</p>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <form onSubmit={createSurvey} className="space-y-6">
        <section className="rounded-xl border border-slate-200 border-t-4 border-t-[#0F9D8A] bg-white p-5 shadow-sm sm:p-6">
          <div className="grid gap-4">
            <label className="text-sm font-medium text-slate-700">
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
            <label className="text-sm font-medium text-slate-700">
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
          <section key={section.id} className="space-y-4 rounded-xl border border-slate-200 bg-slate-100/70 p-4 sm:p-5">
            <div className="rounded-xl border border-slate-200 border-l-4 border-l-[#1F3A5F] bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Section {sectionIndex + 1}
                </span>
                <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
                  Section title
                  <input
                    required
                    maxLength={200}
                    value={section.title}
                    onChange={(event) => updateSection(section.id, { title: event.target.value })}
                    className={fieldClassName}
                  />
                </label>
                {sections.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSections((current) => current.filter((item) => item.id !== section.id))}
                    aria-label={`Remove section ${sectionIndex + 1}`}
                    className="mt-6 rounded-md px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-50"
                  >
                    Remove section
                  </button>
                )}
              </div>
            </div>

            {section.questions.map((question, questionIndex) => {
              const isChoice = question.type === "single_choice" || question.type === "multi_choice";
              const invalidScale = question.scaleMin >= question.scaleMax;
              return (
                <article key={question.id} className="rounded-xl border border-slate-200 border-l-4 border-l-teal-600 bg-white p-5 shadow-sm sm:p-6">
                  <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_13rem]">
                    <label className="text-sm font-medium text-slate-700">
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
                    <label className="text-sm font-medium text-slate-700">
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
                    <fieldset className="mt-5 space-y-3">
                      <legend className="text-sm font-medium text-slate-700">Answer choices</legend>
                      {question.options.map((option, optionIndex) => (
                        <div key={`${question.id}-option-${optionIndex}`} className="flex items-center gap-3">
                          <span aria-hidden="true" className={`h-4 w-4 shrink-0 border border-slate-400 ${
                            question.type === "single_choice" ? "rounded-full" : "rounded-sm"
                          }`} />
                          <input
                            required
                            maxLength={200}
                            value={option}
                            onChange={(event) => updateOption(section.id, question.id, optionIndex, event.target.value)}
                            aria-label={`Choice ${optionIndex + 1}`}
                            className="min-w-0 flex-1 border-0 border-b border-slate-200 px-1 py-2 text-sm outline-none focus:border-teal-600"
                          />
                          {question.options.length > 1 && (
                            <button
                              type="button"
                              onClick={() => updateQuestion(section.id, question.id, {
                                options: question.options.filter((_, index) => index !== optionIndex),
                              })}
                              aria-label={`Remove choice ${optionIndex + 1}`}
                              className="rounded p-1 text-lg leading-none text-slate-500 hover:bg-slate-100 hover:text-red-700"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => updateQuestion(section.id, question.id, {
                          options: [...question.options, `Option ${question.options.length + 1}`],
                        })}
                        className="ml-7 text-sm font-semibold text-teal-800 hover:underline"
                      >
                        Add choice
                      </button>
                    </fieldset>
                  )}

                  {(question.type === "scale" || question.type === "rating") && (
                    <div className="mt-5 space-y-4 rounded-lg bg-slate-50 p-4">
                      <p className="text-sm font-medium text-slate-700">
                        {question.type === "scale" ? "Scale range" : "Rating range"}
                      </p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="text-xs font-medium text-slate-600">
                          Starts at
                          <input
                            type="number"
                            value={question.scaleMin}
                            onChange={(event) => updateQuestion(section.id, question.id, { scaleMin: Number(event.target.value) })}
                            className={fieldClassName}
                          />
                        </label>
                        <label className="text-xs font-medium text-slate-600">
                          Ends at
                          <input
                            type="number"
                            value={question.scaleMax}
                            onChange={(event) => updateQuestion(section.id, question.id, { scaleMax: Number(event.target.value) })}
                            className={fieldClassName}
                          />
                        </label>
                        <label className="text-xs font-medium text-slate-600">
                          Start label (optional)
                          <input
                            maxLength={60}
                            value={question.minLabel}
                            onChange={(event) => updateQuestion(section.id, question.id, { minLabel: event.target.value })}
                            placeholder="Not satisfied"
                            className={fieldClassName}
                          />
                        </label>
                        <label className="text-xs font-medium text-slate-600">
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
                      {invalidScale && (
                        <p role="alert" className="text-sm text-red-700">The end of the scale must be greater than its start.</p>
                      )}
                    </div>
                  )}

                  {question.type === "text" && (
                    <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      Long-answer text response
                    </div>
                  )}
                  {question.type === "yes_no" && (
                    <div className="mt-5 flex gap-3">
                      {["Yes", "No"].map((choice) => (
                        <span key={choice} className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-600">{choice}</span>
                      ))}
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={question.required}
                        onChange={(event) => updateQuestion(section.id, question.id, { required: event.target.checked })}
                        className="h-4 w-4 accent-[#0F9D8A]"
                      />
                      Required
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => moveQuestion(section.id, question.id, -1)}
                        disabled={questionIndex === 0}
                        className="text-sm font-medium text-slate-600 hover:text-[#1F3A5F] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        onClick={() => moveQuestion(section.id, question.id, 1)}
                        disabled={questionIndex === section.questions.length - 1}
                        className="text-sm font-medium text-slate-600 hover:text-[#1F3A5F] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Move down
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateQuestion(section.id, question.id)}
                        className="text-sm font-semibold text-teal-800 hover:underline"
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        onClick={() => removeQuestion(section.id, question.id)}
                        disabled={totalQuestions <= 1}
                        className="text-sm font-semibold text-red-700 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                      >
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
              className="w-full rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-teal-800 transition hover:border-teal-500 hover:bg-teal-50/50"
            >
              + Add question
            </button>
          </section>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={addSection}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-[#1F3A5F] hover:bg-slate-50"
          >
            + Add section
          </button>
          <button
            type="submit"
            disabled={saving || sections.some((section) => section.questions.some((question) =>
              (question.type === "scale" || question.type === "rating") && question.scaleMin >= question.scaleMax,
            ))}
            className="rounded-lg bg-[#0F9D8A] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0C8575] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save as draft"}
          </button>
        </div>
      </form>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-[#1F3A5F]">Saved surveys</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-50 text-[#1F3A5F]">
              <th className="px-5 py-4 font-semibold">Survey</th>
              <th className="px-5 py-4 font-semibold">Version</th>
              <th className="px-5 py-4 font-semibold">Status</th>
              <th className="px-5 py-4 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className="px-5 py-5 text-slate-500" colSpan={4}>Loading surveys…</td></tr>}
            {!loading && surveys.length === 0 && <tr><td className="px-5 py-5 text-slate-500" colSpan={4}>No surveys created.</td></tr>}
            {surveys.map((survey) => (
              <tr key={survey.id} className="border-t border-slate-100">
                <td className="px-5 py-4 font-medium text-slate-800">{survey.title}</td>
                <td className="px-5 py-4 text-slate-600">v{survey.version}</td>
                <td className="px-5 py-4 capitalize text-slate-600">{survey.status}</td>
                <td className="px-5 py-4 text-right">
                  {survey.status === "draft" && (
                    <button type="button" onClick={() => performAction(survey.id, "publish")} className="mr-3 font-semibold text-teal-800 hover:underline">
                      Publish
                    </button>
                  )}
                  <button type="button" onClick={() => performAction(survey.id, "clone")} className="font-semibold text-[#1F3A5F] hover:underline">
                    Clone
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
