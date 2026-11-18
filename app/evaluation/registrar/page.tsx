"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import EvaluationForm from "./client-form";

function EvaluationPageContent() {
  const searchParams = useSearchParams();
  return (
    <EvaluationForm
      cycleId={searchParams.get("cycleId") ?? ""}
      targetId={searchParams.get("targetId") ?? ""}
    />
  );
}

export default function RegistrarEvaluationPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-gray-500">Loading evaluation…</p>}>
      <EvaluationPageContent />
    </Suspense>
  );
}
