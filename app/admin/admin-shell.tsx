"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";

const navigationGroups = [
  { label: "Overview", links: [["Dashboard", "/admin/dashboard"]] },
  {
    label: "Setup",
    links: [
      ["Campuses", "/admin/campuses"],
      ["Evaluation Targets", "/admin/targets"],
      ["Users", "/admin/users"],
    ],
  },
  {
    label: "Evaluations",
    links: [
      ["Participation", "/admin/participation"],
      ["Review Submissions", "/admin/submissions"],
    ],
  },
  { label: "System", links: [["Audit Log", "/admin/audit-log"]] },
] as const;

const superAdminNavigationGroups = [
  {
    label: "Setup",
    links: [
      ["Survey Builder", "/super_admin/survey-builder"],
      ["Cycles", "/super_admin/cycles"],
    ],
  },
  {
    label: "Evaluation review",
    links: [
      ["Live Office Standing", "/super_admin/standing"],
      ["Results", "/super_admin/results"],
      ["Submissions", "/super_admin/submissions"],
      ["Comments", "/super_admin/comments"],
    ],
  },
  { label: "Help", links: [["Tutorial", "/super_admin/tutorial"]] },
] as const;

type AdminSession = { id: number; email: string; role: "admin" | "super_admin" | "evaluator" };
type AdminAudience = "admin" | "super_admin";

function AdminNavigation({ currentPath, audience, onNavigate }: {
  currentPath: string;
  audience: AdminAudience;
  onNavigate?: () => void;
}) {
  const groups = audience === "super_admin" ? superAdminNavigationGroups : navigationGroups;
  return (
    <nav aria-label={audience === "super_admin" ? "Super Admin navigation" : "Admin navigation"} className="space-y-5 p-3">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-3 text-[11px] font-semibold tracking-[0.12em] text-slate-400 uppercase">{group.label}</p>
          <ul className="mt-1 space-y-0.5">
            {group.links.map(([label, href]) => {
              const isActive = currentPath === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={onNavigate}
                    className={`relative block rounded-xl border px-3 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-200 ${
                      isActive
                        ? "border-teal-300/20 bg-teal-300/15 pl-4 font-semibold text-teal-50 before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:rounded-full before:bg-teal-300"
                        : "border-transparent text-slate-200 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default function AdminShell({ children, audience = "admin" }: { children: ReactNode; audience?: AdminAudience }) {
  const pathname = usePathname();
  const currentPath = pathname.replace(/\/+$/, "") || "/";
  const router = useRouter();
  const [user, setUser] = useState<AdminSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileMenuPath, setMobileMenuPath] = useState<string | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const mobileMenuOpen = mobileMenuPath === currentPath;
  const consoleTitle = audience === "super_admin" ? "Super Admin Console" : "Admin Console";
  const homeHref = audience === "super_admin" ? "/super_admin/standing" : "/admin/dashboard";

  useEffect(() => {
    let active = true;
    apiFetch<AdminSession>("/api/auth/me")
      .then((session) => {
        if (!active) return;
        if (session.role !== audience) {
          router.replace(session.role === "super_admin" ? "/super_admin/standing" : session.role === "admin" ? "/admin/dashboard" : "/");
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
  }, [audience, router]);

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

  if (checkingSession || user?.role !== audience) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-100 via-white to-teal-50 px-5">
        <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg shadow-slate-900/5">
          <Image
            src="/capsu-logo.png"
            alt="Capiz State University"
            width={56}
            height={56}
            className="mx-auto mb-4 h-14 w-14 object-contain"
          />
          {sessionError ? (
            <>
              <p role="alert" className="text-sm text-red-700">{sessionError}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-4 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                Try again
              </button>
            </>
          ) : (
            <p role="status" className="text-sm text-slate-600">
              {audience === "super_admin" ? "Checking Super Admin access…" : "Checking administrator access…"}
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <a href="#admin-content" className="sr-only z-50 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-teal-900 shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="hidden shrink-0 bg-linear-to-b from-[#162B46] to-[#1F3A5F] text-white md:sticky md:top-0 md:flex md:h-dvh md:w-56 md:flex-col md:self-start lg:w-60">
          <Link href={homeHref} className="flex items-center gap-3 border-b border-white/10 px-4 py-5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-200">
            <Image
              src="/capsu-logo.png"
              alt=""
              aria-hidden="true"
              width={44}
              height={44}
              className="h-11 w-11 shrink-0 rounded-lg object-contain"
            />
            <span className="text-sm font-semibold leading-tight">CAPSU Evaluation Portal</span>
          </Link>
          <div className="min-h-0 flex-1 overflow-y-auto py-2">
            <AdminNavigation currentPath={currentPath} audience={audience} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header
            className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-md"
            onKeyDown={(event) => {
              if (event.key === "Escape" && mobileMenuOpen) {
                setMobileMenuPath(null);
                menuButton.current?.focus();
              }
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setMobileMenuPath(null);
            }}
          >
            <div className="flex min-h-17 items-center justify-between gap-3 px-4 py-3 sm:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  ref={menuButton}
                  type="button"
                  aria-label={mobileMenuOpen ? "Close admin navigation" : "Open admin navigation"}
                  aria-expanded={mobileMenuOpen}
                  aria-controls="mobile-admin-navigation"
                  onClick={() => setMobileMenuPath(mobileMenuOpen ? null : currentPath)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-[#1F3A5F] hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 md:hidden"
                >
                  <span aria-hidden="true" className="grid gap-1">
                    <span className="h-0.5 w-4 rounded-full bg-current" />
                    <span className="h-0.5 w-4 rounded-full bg-current" />
                    <span className="h-0.5 w-4 rounded-full bg-current" />
                  </span>
                </button>
                <div
                  id="mobile-admin-navigation"
                  hidden={!mobileMenuOpen}
                  className="absolute inset-x-3 top-full mt-2 max-h-[calc(100dvh_-_5.5rem)] overflow-y-auto rounded-2xl border border-slate-700 bg-[#162B46] text-white shadow-xl shadow-slate-900/25 md:hidden"
                >
                  <AdminNavigation currentPath={currentPath} audience={audience} onNavigate={() => setMobileMenuPath(null)} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-500 md:hidden">CAPSU Evaluation Portal</p>
                  <p className="truncate text-sm font-bold text-[#1F3A5F] sm:text-base">{consoleTitle}</p>
                </div>
              </div>
              <div className="flex min-w-0 shrink-0 items-center gap-3">
                <div className="hidden min-w-0 items-center gap-2 rounded-full bg-slate-100 py-1 pr-3 pl-1 sm:flex">
                  <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-100 text-sm font-bold text-teal-900 uppercase">
                    {user.email[0]}
                  </span>
                  <span className="max-w-48 truncate text-xs font-semibold text-slate-700" title={user.email}>
                    {user.email}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  disabled={loggingOut}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60 sm:text-sm"
                >
                  {loggingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </div>
          </header>
          {sessionError && (
            <p role="alert" className="mx-5 mt-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800 sm:mx-8">
              {sessionError}
            </p>
          )}
          <main id="admin-content" tabIndex={-1} className="min-w-0 scroll-mt-24 px-4 py-6 sm:px-8 sm:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
