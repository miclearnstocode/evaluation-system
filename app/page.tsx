"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "./lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch<{ role: "evaluator" | "admin" }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.push(data.role === "admin" ? "/admin/dashboard" : "/evaluation");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1F3A5F] text-sm font-bold text-white">
              AES
            </span>
            <span className="font-semibold tracking-tight text-[#1F3A5F]">
              Anonymous Evaluation System
            </span>
          </Link>
          <Link
            href="/register"
            className="rounded-lg border border-[#0F9D8A] px-4 py-2 text-sm font-semibold text-[#087f70] transition hover:bg-teal-50"
          >
            Create evaluator account
          </Link>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-73px)] max-w-6xl items-center gap-12 px-5 py-12 md:grid-cols-[1.05fr_0.95fr]">
        <div className="max-w-xl">
          <p className="mb-4 inline-flex rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-teal-800">
            CAPSU Evaluation Portal
          </p>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-[#1F3A5F] sm:text-5xl">
            Your feedback helps us improve.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">
            Sign in to view the evaluations available to you. Responses are kept separate from your account.
          </p>
          <div className="mt-8 flex items-start gap-3 rounded-xl border border-teal-100 bg-white p-4 shadow-sm">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800" aria-hidden="true">
              ✓
            </span>
            <p className="text-sm leading-6 text-slate-600">
              Your account determines which evaluations you can access; your answers are not shown alongside your identity.
            </p>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-lg shadow-slate-200/60 sm:p-9">
          <div className="mb-7">
            <h2 className="text-2xl font-bold text-[#1F3A5F]">Welcome back</h2>
            <p className="mt-2 text-sm text-slate-500">Sign in with your CAPSU account.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-slate-700">
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@capsu.edu.ph"
                autoComplete="email"
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#0F9D8A] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0C8575] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            New evaluator?{" "}
            <Link href="/register" className="font-semibold text-teal-800 hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
