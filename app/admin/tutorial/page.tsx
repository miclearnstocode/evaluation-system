import ReviewPageHeader from "../../components/review-page-header";
import { StartWalkthroughButton } from "../../components/walkthrough";

export default function AdminTutorialPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <ReviewPageHeader
        title="Tutorial"
        description="Follow the focus box through the Admin screens. Select Next step when you’re ready to continue."
      >
        <StartWalkthroughButton />
      </ReviewPageHeader>
      <section aria-labelledby="admin-tutorial-topics" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 id="admin-tutorial-topics" className="text-lg font-bold text-slate-900">What you’ll cover</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700 marker:text-teal-700">
          <li>Check cycle information and set up campuses, evaluation targets, and accounts.</li>
          <li>Monitor participation and review submissions by office.</li>
          <li>Look up recorded actions in the Audit Log.</li>
        </ul>
        <p className="mt-4 text-sm text-slate-600">Super Admin creates survey forms and manages evaluation cycles.</p>
      </section>
    </div>
  );
}
