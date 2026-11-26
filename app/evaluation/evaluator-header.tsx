"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "../lib/api";

export default function EvaluatorHeader({ currentPage }: { currentPage: string }) {
  const router = useRouter();
  const isDashboard = currentPage === "evaluations";
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
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:py-4">
        <Link href="/evaluation" className="flex min-w-0 items-center gap-3">
          <Image
            src="/capsu-logo.png"
            alt="Capiz State University"
            width={44}
            height={44}
            className="size-10 shrink-0 rounded-lg object-contain sm:size-11"
          />
          <span>
            <span className="block font-semibold tracking-tight text-[#1F3A5F]">CAPSU Evaluation Portal</span>
            <span className="block text-xs text-slate-500">Evaluator</span>
          </span>
        </Link>
        <nav
          aria-label="Evaluator navigation"
          className={isDashboard ? "flex justify-end" : "grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3"}
        >
          {!isDashboard && (
            <Link
              href="/evaluation"
              className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 py-2 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              My Evaluations
            </Link>
          )}
          <button
            type="button"
            onClick={signOut}
            disabled={loggingOut}
            className="group inline-flex min-h-11 items-center justify-self-end rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-wait disabled:opacity-60"
          >
            <span className="rounded-md bg-red-700 px-3 py-1.5 text-center text-xs font-semibold text-white transition group-hover:bg-red-800">
              {loggingOut ? "Signing out…" : "Sign out"}
            </span>
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
