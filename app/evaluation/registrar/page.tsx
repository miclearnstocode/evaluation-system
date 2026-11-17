import { Suspense } from "react";
import EvaluationForm from "./client-form";

type RegistrarPageProps = {
  searchParams: Promise<{
    cycleId?: string;
    targetId?: string;
  }>;
};

async function EvaluationPageContent({
  searchParams,
}: RegistrarPageProps) {
  const { cycleId, targetId } = await searchParams;
  return <EvaluationForm cycleId={cycleId ?? ""} targetId={targetId ?? ""} />;
}

export default function RegistrarEvaluationPage(props: RegistrarPageProps) {
  return (
    <Suspense fallback={<p className="p-8 text-center text-gray-500">Loading evaluation…</p>}>
      <EvaluationPageContent searchParams={props.searchParams} />
    </Suspense>
  );
}
