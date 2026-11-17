"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

const links = [
  ["Dashboard", "/admin/dashboard"],
  ["Campuses", "/admin/campuses"],
  ["Offices", "/admin/offices"],
  ["Administrators", "/admin/administrators"],
  ["Users", "/admin/users"],
  ["Survey Builder", "/admin/survey-builder"],
  ["Cycles", "/admin/cycles"],
  ["Participation", "/admin/participation"],
  ["Results", "/admin/results"],
  ["Comments", "/admin/comments"],
  ["Audit Log", "/admin/audit-log"],
];

type AdminSession = { id: number; email: string; role: "admin" | "evaluator" };

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AdminSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<AdminSession>("/api/auth/me")
      .then((session) => {
        if (!active) return;
        if (session.role !== "admin") {
          router.replace("/");
          return;
        }
        setUser(session);
      })
      .catch((error: Error) => {
        if (!active) return;
        if (error.message.includes("Sign in is required")) {
          router.replace("/");
          return;
        }
        setSessionError(error.message);
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  async function logout() {
    setSessionError("");
    setLoggingOut(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      router.replace("/");
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Could not sign out.");
    } finally {
      setLoggingOut(false);
    }
  }

  if (checkingSession || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          {sessionError ? (
            <>
              <p role="alert" className="text-sm text-red-700">{sessionError}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-4 rounded-lg bg-[#1F3A5F] px-4 py-2 text-sm font-semibold text-white"
              >
                Try again
              </button>
            </>
          ) : (
            <p role="status" className="text-sm text-slate-600">Checking administrator access…</p>
          )}
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="w-full shrink-0 bg-[#1F3A5F] text-white md:w-60">
          <Link href="/admin/dashboard" className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-sm font-bold">
              AES
            </span>
            <span className="text-sm font-semibold leading-tight">Evaluation System</span>
          </Link>
          <nav aria-label="Admin navigation" className="flex gap-1 overflow-x-auto p-2 md:flex-col md:overflow-visible md:py-3">
            {links.map(([label, href]) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={`shrink-0 rounded-lg px-3 py-2.5 text-sm transition-colors md:mx-2 ${
                    isActive
                      ? "bg-[#0F9D8A] font-semibold text-white"
                      : "text-white/75 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">CAPSU Evaluation Portal</p>
              <p className="font-semibold text-[#1F3A5F]">Admin Console</p>
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <span className="hidden max-w-56 truncate text-sm text-slate-600 sm:inline" title={user.email}>
                {user.email}
              </span>
              <button
                type="button"
                onClick={logout}
                disabled={loggingOut}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {loggingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </header>
          {sessionError && (
            <p role="alert" className="mx-5 mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-8">
              {sessionError}
            </p>
          )}
          <main className="px-5 py-6 sm:px-8 sm:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
