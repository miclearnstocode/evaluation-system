import Link from "next/link";
import EvaluatorHeader from "../evaluator-header";

export default function ThankYouPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <EvaluatorHeader currentPage="thank-you" />
      <main className="mx-auto flex max-w-3xl justify-center px-5 py-12 sm:py-20">
        <section className="w-full rounded-xl border border-slate-200 bg-white p-7 text-center shadow-sm sm:p-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-2xl font-bold text-teal-800" aria-hidden="true">
            ✓
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-[#1F3A5F]">
            Evaluation submitted
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
            Thank you for your feedback. Your answers are recorded separately from your account.
          </p>
          <Link
            href="/evaluation"
            className="mt-7 inline-flex rounded-lg bg-[#0F9D8A] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0C8575]"
          >
            Back to My Evaluations
          </Link>
        </section>
      </main>
    </div>
  );
}
