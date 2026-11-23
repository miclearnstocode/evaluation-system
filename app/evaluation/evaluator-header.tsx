"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "../lib/api";

export default function EvaluatorHeader({ currentPage }: { currentPage: string }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setError("");
    setLoggingOut(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      router.replace("/");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not sign out.");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
        <Link href="/evaluation" className="flex items-center gap-3">
          <Image
            src="/capsu-logo.png"
            alt="Capiz State University"
            width={44}
            height={44}
            className="h-11 w-11 rounded-lg object-contain"
          />
          <span>
            <span className="block font-semibold tracking-tight text-[#1F3A5F]">CAPSU Evaluation Portal</span>
            <span className="block text-xs text-slate-500">Evaluator</span>
          </span>
        </Link>
        <nav aria-label="Evaluator navigation" className="flex items-center gap-3">
          <Link
            href="/evaluation"
            aria-current={currentPage === "evaluations" ? "page" : undefined}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            My Evaluations
          </Link>
          <button
            type="button"
            onClick={signOut}
            disabled={loggingOut}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
          >
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </nav>
      </div>
      {error && (
        <p role="alert" className="mx-auto max-w-6xl px-5 pb-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </header>
  );
}
