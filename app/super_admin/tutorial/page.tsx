import Link from "next/link";
import ReviewPageHeader from "../../components/review-page-header";
import { StartWalkthroughButton } from "../super-admin-walkthrough";

const workflow = [
  {
    title: "Build and publish the survey",
    page: "Survey Builder",
    href: "/super_admin/survey-builder",
    steps: [
      "Enter a survey title and add sections and questions. Set the required questions, scale labels, and point values where applicable.",
      "Select Preview to check how the form reads, then return to the editor and select Save draft.",
      "Find the draft in Saved surveys and select Publish. The published survey can now be selected when creating a cycle.",
    ],
  },
  {
    title: "Schedule and open the evaluation",
    page: "Cycles",
    href: "/super_admin/cycles",
    steps: [
      "Enter a cycle name, select a published survey, and set the opening and closing times.",
      "Choose whether evaluators can assess offices on their own campus, then select Save cycle. The system adds all active evaluation targets.",
      "Select Edit dates and Save changes to reschedule the cycle. Find the draft in the Cycle directory and select Open cycle when it’s ready.",
    ],
  },
  {
    title: "Check who has submitted",
    page: "Submissions",
    href: "/super_admin/submissions",
    steps: [
      "Select the evaluation cycle and choose an office from Evaluation targets.",
      "Use the circle diagram or roster to check submitted and pending evaluations. Select a marker to jump to its numbered evaluator row.",
    ],
  },
  {
    title: "Monitor office scores",
    page: "Live Office Standing",
    href: "/super_admin/standing",
    steps: [
      "Select the cycle to see office averages as responses come in.",
      "Select an office to see its section averages and numbered evaluator mean scores.",
    ],
  },
  {
    title: "Compare and review results",
    page: "Results",
    href: "/super_admin/results",
    steps: [
      "Select a cycle. In Cycle summary, select Generate summary to compare offices by average score or submissions.",
      "Use the evaluator-role chart to see submission counts and percentages. Search by office or campus to narrow the comparison.",
      "Switch to Office details and select a target for question averages and response distributions.",
    ],
  },
  {
    title: "Read feedback and close the cycle",
    page: "Comments",
    href: "/super_admin/comments",
    steps: [
      "Select a cycle and office to read the combined feedback. The office selector includes the office head when a name is recorded.",
      "After the scheduled closing time, return to Cycles and select Close cycle. You can continue reviewing results and comments for the closed cycle.",
    ],
  },
] as const;

const troubleshooting = [
  {
    question: "Why is my survey missing from the cycle form?",
    answer: "Only published surveys appear in the Published survey list. Open Survey Builder, find the draft under Saved surveys, and select Publish.",
  },
  {
    question: "Why can’t I open or close a cycle?",
    answer: "Opening requires a draft cycle with a published survey, at least one target, and a closing time that has yet to pass. Closing is available for open cycles after their scheduled closing time.",
  },
  {
    question: "Why is an office missing or showing no results?",
    answer: "Check that you selected the right cycle and that the office is assigned to it. Ask an Admin to check the office in Evaluation Targets if its setup needs attention. Office details appear after the first submission.",
  },
] as const;

export default function SuperAdminTutorialPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <ReviewPageHeader
        title="Tutorial"
        description="Follow the walkthrough in the Super Admin screens and advance when you’re ready."
      >
        <StartWalkthroughButton />
      </ReviewPageHeader>

      <section aria-labelledby="workflow-title" className="space-y-4">
        <h2 id="workflow-title" className="text-xl font-bold tracking-tight text-[#1F3A5F]">Evaluation workflow</h2>
        <ol className="grid gap-4 md:grid-cols-2">
          {workflow.map(({ title, page, href, steps }, index) => (
            <li key={href} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-teal-50 text-sm font-bold text-teal-800">
                  {index + 1}
                </span>
                <h3 className="font-bold text-[#1F3A5F]">{title}</h3>
              </div>
              <ul className="mt-4 flex-1 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700 marker:text-teal-700">
                {steps.map(step => <li key={step}>{step}</li>)}
              </ul>
              <Link
                href={href}
                className="mt-4 self-start rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                Go to {page}
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="troubleshooting-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 id="troubleshooting-title" className="text-xl font-bold tracking-tight text-[#1F3A5F]">Troubleshooting</h2>
        <div className="mt-3 divide-y divide-slate-200">
          {troubleshooting.map(({ question, answer }) => (
            <details key={question} className="py-3">
              <summary className="cursor-pointer rounded-sm font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
                {question}
              </summary>
              <p className="mt-2 max-w-prose text-sm leading-6 text-slate-700">{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
