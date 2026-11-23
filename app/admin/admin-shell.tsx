"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

const links = [
  ["Dashboard", "/admin/dashboard"],
  ["Live Office Standing", "/admin/standing"],
  ["Campuses", "/admin/campuses"],
  ["Evaluation Targets", "/admin/targets"],
  ["Users", "/admin/users"],
  ["Survey Builder", "/admin/survey-builder"],
  ["Cycles", "/admin/cycles"],
  ["Participation", "/admin/participation"],
  ["Review Submissions", "/admin/submissions"],
  ["Comments", "/admin/comments"],
  ["Audit Log", "/admin/audit-log"],
];

type AdminSession = { id: number; email: string; role: "admin" | "super_admin" | "evaluator" };

function navigationLinkClass(isActive: boolean) {
  const base =
    "shrink-0 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#1F3A5F]";
  return `${base} ${
    isActive
      ? "bg-[#0F9D8A] font-semibold text-white hover:bg-[#0C8575]"
      : "text-white/75 hover:bg-[#0F9D8A] hover:text-white"
  }`;
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const currentPath = pathname.replace(/\/+$/, "") || "/";
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
          router.replace(session.role === "super_admin" ? "/super_admin/standing" : "/");
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
      setUser(null);
      window.location.replace("/");
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
            <p role="status" className="text-sm text-slate-600">
              {user?.role === "admin" ? "Opening office standing…" : "Checking administrator access…"}
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="hidden w-full shrink-0 bg-[#1F3A5F] text-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:flex-col md:self-start">
          <Link href="/admin/dashboard" className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-sm font-bold">
              AES
            </span>
            <span className="text-sm font-semibold leading-tight">Evaluation System</span>
          </Link>
          <nav aria-label="Admin navigation" className="flex flex-col gap-1 overflow-y-auto p-2 py-3">
            {links.map(([label, href]) => {
              const isActive = currentPath === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={`${navigationLinkClass(isActive)} md:mx-2`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 sm:px-8">
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
          <nav
            aria-label="Admin navigation"
            className="sticky top-16 z-30 flex gap-1 overflow-x-auto border-b border-white/10 bg-[#1F3A5F] p-2 text-white md:hidden"
          >
            {links.map(([label, href]) => {
              const isActive = currentPath === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={navigationLinkClass(isActive)}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
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
