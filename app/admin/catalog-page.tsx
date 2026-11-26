"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { TARGET_TYPE_LABELS, type TargetType } from "../lib/targets";

type CatalogKind = "campuses" | "targets" | "users";

type CatalogRow = {
  id: number;
  code?: string;
  name?: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string;
  campus_id?: number;
  campus_name?: string | null;
  office_type?: TargetType;
  target_type?: TargetType;
  role?: string;
  position_role?: string | null;
  office_unit_code?: string | null;
  office_unit_name?: string | null;
  years_of_service?: string | null;
  is_central?: boolean | number;
  is_central_staff?: boolean | number;
  active: boolean | number;
};

type NamedOption = { id: number; name: string };

const config: Record<CatalogKind, { title: string; path: string; description?: string }> = {
  campuses: { title: "Campuses", path: "/api/admin/campuses" },
  targets: { title: "Evaluation Targets", path: "/api/admin/offices" },
  users: {
    title: "Users",
    path: "/api/admin/users",
    description:
      "Create admin accounts and manage access for existing users. Deactivating an evaluator preserves their submitted evaluations.",
  },
};

/** Join first + last into a display name, falling back to email. */
function displayName(row: CatalogRow): string {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return name || row.email || "—";
}

function normalizeCatalogItems(kind: CatalogKind, rows: CatalogRow[]) {
  return kind === "targets"
    ? rows.map((item) => ({ ...item, target_type: item.target_type ?? item.office_type }))
    : rows;
}

function CatalogHeader({
  title,
  description,
  counts,
}: {
  title: string;
  description: string;
  counts: { label: string; total: number; active: number } | null;
}) {
  return (
    <header className="relative isolate overflow-hidden rounded-3xl bg-linear-to-br from-[#162B46] via-[#1F3A5F] to-[#126B64] px-6 py-7 text-white shadow-lg shadow-slate-900/10 sm:px-9 sm:py-9">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-full bg-[linear-gradient(to_right,#ffffff14_1px,transparent_1px),linear-gradient(to_bottom,#ffffff14_1px,transparent_1px)] bg-size-[28px_28px] mask-[linear-gradient(to_left,black,transparent_85%)] sm:w-2/3"
      />
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-100">{description}</p>
        </div>
        {counts && (
          <dl className="grid w-full grid-cols-2 divide-x divide-white/20 rounded-2xl border border-white/25 bg-white/10 sm:w-auto">
            <div className="px-5 py-4">
              <dt className="text-xs font-semibold text-teal-100">Total {counts.label}</dt>
              <dd className="mt-1 text-3xl font-bold tabular-nums">{counts.total}</dd>
            </div>
            <div className="px-5 py-4">
              <dt className="text-xs font-semibold text-teal-100">Active</dt>
              <dd className="mt-1 text-3xl font-bold tabular-nums">{counts.active}</dd>
            </div>
          </dl>
        )}
      </div>
    </header>
  );
}

export default function CatalogPage({ kind }: { kind: CatalogKind }) {
  const { title, path, description } = config[kind];
  const [items, setItems] = useState<CatalogRow[]>([]);
  const [targetSearch, setTargetSearch] = useState("");
  const [options, setOptions] = useState<NamedOption[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const optionPath =
      kind === "targets" || kind === "users" ? "/api/admin/campuses" : null;
    const optionRequest = optionPath
      ? apiFetch<{ items: NamedOption[] }>(optionPath)
      : Promise.resolve({ items: [] });

    Promise.all([apiFetch<{ items: CatalogRow[] }>(path), optionRequest])
      .then(([list, optionList]) => {
        if (!active) return;
        setItems(normalizeCatalogItems(kind, list.items));
        setOptions(optionList.items);
      })
      .catch((requestError: Error) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [kind, path]);

  async function refresh() {
    const result = await apiFetch<{ items: CatalogRow[] }>(path);
    setItems(normalizeCatalogItems(kind, result.items));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    let body: Record<string, string | number | boolean | null>;
    if (kind === "campuses") {
      body = {
        code: form.code ?? "",
        name: form.name ?? "",
        is_central: form.is_central === "true",
      };
    } else if (kind === "targets") {
      body = {
        target_type: form.target_type ?? "",
        code: form.code?.trim() ?? "",
        name: form.name ?? "",
        campus_id: form.campus_id ? Number(form.campus_id) : null,
        ...(form.is_central ? { is_central: form.is_central === "true" } : {}),
      };
    } else {
      body = {
        first_name: form.first_name?.trim() ?? "",
        last_name: form.last_name?.trim() ?? "",
        email: form.email ?? "",
        password: form.password ?? "",
        role: "admin",
      };
    }

    try {
      await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
      setForm({});
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The item could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: CatalogRow) {
    try {
      await apiFetch(`${path}/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !item.active }),
      });
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The status could not be updated.");
    }
  }

  async function deactivateUser(item: CatalogRow) {
    if (
      !window.confirm(
        `Deactivate ${displayName(item)}? They will no longer be able to log in or submit evaluations, but their existing records will be kept.`,
      )
    )
      return;
    setError("");
    try {
      await apiFetch(`${path}/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: false }),
      });
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The account could not be deactivated.");
    }
  }

  function input(name: string, label: string, required = true, type = "text") {
    return (
      <label key={name} className="block">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <input
          required={required}
          type={type}
          value={form[name] ?? ""}
          onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#0F9D8A] focus:ring-2 focus:ring-[#0F9D8A]/20"
        />
      </label>
    );
  }

  function select(
    name: string,
    label: string,
    choices: { value: string; label: string }[],
    required = true,
  ) {
    return (
      <label key={name} className="block">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <select
          required={required}
          value={form[name] ?? ""}
          onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition focus:border-[#0F9D8A] focus:ring-2 focus:ring-[#0F9D8A]/20"
        >
          <option value="" disabled>Select…</option>
          {choices.map((choice) => (
            <option key={choice.value} value={choice.value}>{choice.label}</option>
          ))}
        </select>
      </label>
    );
  }

  const campusChoices = options.map((item) => ({ value: String(item.id), label: item.name }));
  const requiredCampusTarget = ["campus_administrator", "satellite_college_director"].includes(
    form.target_type ?? "",
  );

  const fields =
    kind === "campuses"
      ? [
          input("code", "Campus code"),
          input("name", "Campus name"),
          select("is_central", "Campus type", [
            { value: "false", label: "Campus" },
            { value: "true", label: "Central" },
          ]),
        ]
      : kind === "targets"
        ? [
            select(
              "target_type",
              "Target type",
              Object.entries(TARGET_TYPE_LABELS).map(([value, label]) => ({ value, label })),
            ),
            input("name", "Target name"),
            input("code", "Target code (leave blank to generate)", false),
            select(
              "campus_id",
              requiredCampusTarget ? "Campus (required)" : "Campus (optional)",
              campusChoices,
              requiredCampusTarget,
            ),
            select(
              "is_central",
              "Scope (optional)",
              [
                { value: "true", label: "Central" },
                { value: "false", label: "Not central" },
              ],
              false,
            ),
          ]
        : [
            (
              <div key="role-note" className="col-span-full">
                <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0 text-[#0F9D8A]">
                    <path
                      fillRule="evenodd"
                      d="M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0Zm-7-4a1 1 0 1 0-2 0 1 1 0 0 0 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>
                    New accounts are created with the <strong className="font-semibold text-slate-700">Admin</strong> role.
                    The super admin account is unique and cannot be created here.
                  </span>
                </div>
              </div>
            ),
            input("first_name", "First name"),
            input("last_name", "Last name"),
            input("email", "Email", true, "email"),
            input("password", "Initial password (at least 12 characters)", true, "password"),
          ];

  const counts = !loading && (!error || items.length > 0)
    ? { label: kind, total: items.length, active: items.filter((item) => item.active).length }
    : null;

  if (kind !== "users") {
    const isCampusCatalog = kind === "campuses";
    const directoryTitle = isCampusCatalog ? "Campus directory" : "Target directory";
    const addLabel = isCampusCatalog ? "Add campus" : "Add target";
    const recordsLabel = isCampusCatalog ? "campuses" : "targets";
    const search = isCampusCatalog ? "" : targetSearch.trim().toLowerCase();
    const searchTerms = search ? search.split(/\s+/) : [];
    const visibleItems = searchTerms.length ? items.filter(item => {
      const location = item.campus_name ?? (item.is_central ? "Central" : "University-wide");
      const category = item.target_type ? TARGET_TYPE_LABELS[item.target_type] : "";
      const text = [item.name, item.code, category, location].join(" ").toLowerCase();
      return searchTerms.every(term => text.includes(term));
    }) : items;

    return (
      <div className="mx-auto max-w-7xl space-y-7">
        <CatalogHeader
          title={title}
          description={isCampusCatalog
            ? "Manage which campuses are available for evaluator registration and office assignments."
            : "Manage the six target categories evaluated in each cycle. Campus Administrators and Satellite College Directors must be linked to a campus."}
          counts={counts}
        />

        {error && (
          <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <section aria-labelledby="catalog-directory-title" className="min-w-0">
            <h2 id="catalog-directory-title" className="text-xl font-bold tracking-tight text-[#1F3A5F]">
              {directoryTitle}
            </h2>
            {!isCampusCatalog && (
              <div className="mt-3">
                <input
                  aria-label="Search evaluation targets"
                  type="search"
                  value={targetSearch}
                  onChange={(event) => setTargetSearch(event.target.value)}
                  placeholder="Search by office, code, category, or campus"
                  className="w-full max-w-md rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-teal-700"
                />
                {search && !loading && items.length > 0 && (
                  <p role="status" className="mt-2 text-sm text-slate-600">
                    {visibleItems.length} of {items.length} targets
                  </p>
                )}
              </div>
            )}
            {loading ? (
              <p role="status" className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                Loading {recordsLabel}…
              </p>
            ) : items.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
                {error ? "Records are unavailable." : `No ${recordsLabel} have been added.`}
              </p>
            ) : visibleItems.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
                No offices match your search.
              </p>
            ) : (
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {visibleItems.map((item) => (
                  <li key={item.id} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {item.code && (
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold break-all text-slate-700">
                          {item.code}
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                        item.active ? "bg-teal-50 text-teal-800 ring-teal-200" : "bg-slate-100 text-slate-700 ring-slate-200"
                      }`}>
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                        {item.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold wrap-break-word text-[#1F3A5F]">{item.name}</h3>
                    <div className="mt-1 mb-4 space-y-1 text-sm text-slate-600">
                      {isCampusCatalog ? (
                        <p>{item.is_central ? "Central" : "Campus"}</p>
                      ) : (
                        <>
                          {item.target_type && <p>{TARGET_TYPE_LABELS[item.target_type]}</p>}
                          <p>{item.campus_name ?? (item.is_central ? "Central" : "University-wide")}</p>
                        </>
                      )}
                    </div>
                    <div className="mt-auto flex border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        aria-label={`${item.active ? "Deactivate" : "Activate"} ${item.name}`}
                        onClick={() => toggleActive(item)}
                        className="rounded-lg px-3 py-2 text-sm font-semibold text-teal-800 transition hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                      >
                        {item.active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <form onSubmit={submit} aria-labelledby="add-catalog-title" className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
              <h2 id="add-catalog-title" className="text-lg font-semibold text-[#1F3A5F]">{addLabel}</h2>
            </div>
            <div className="space-y-4 p-5">
              {fields}
              <button
                type="submit"
                disabled={saving}
                className="mt-2 w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? "Saving…" : addLabel}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const columns: [string, string][] = [
    ["Name", "display_name"],
    ["Account role", "role"],
    ["Position/Role", "position_role"],
    ["Assigned targets", "office_unit_name"],
    ["Campus", "campus_name"],
    ["Years of Service / Stay", "years_of_service"],
  ];

  function displayValue(item: CatalogRow, key: string) {
    if (key === "is_central") return item.is_central ? "Central" : "Campus";
    if (key === "is_central_staff") return item.is_central_staff ? "Yes" : "No";
    if (key === "role") {
      return item.role === "super_admin"
        ? "Super admin"
        : item.role === "admin"
          ? "Admin"
          : "Evaluator";
    }
    if (key === "position_role") {
      return (
        ({
          teaching_faculty: "Teaching / Faculty",
          non_teaching_staff: "Non-Teaching / Administrative Staff",
          student_leader: "Student Leader",
          campus_administrator_satellite_director: "Campus Administrator / Satellite College Director",
          director: "Director",
          vice_president: "Vice President",
        } as Record<string, string>)[item.position_role ?? ""] ?? "—"
      );
    }
    if (key === "years_of_service") {
      return (
        ({
          lt_1: "Less than 1 year",
          "1_5": "1–5 years",
          "6_10": "6–10 years",
          "11_plus": "11+ years",
        } as Record<string, string>)[item.years_of_service ?? ""] ?? "—"
      );
    }
    return String(item[key as keyof CatalogRow] ?? "—");
  }

  function roleBadge(item: CatalogRow) {
    const privileged = item.role === "admin" || item.role === "super_admin";
    return (
      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        privileged ? "bg-indigo-50 text-indigo-800" : "bg-slate-100 text-slate-700"
      }`}>
        {displayValue(item, "role")}
      </span>
    );
  }

  function userStatus(item: CatalogRow) {
    const action = item.active ? "Deactivate" : "Activate";
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
          item.active ? "bg-teal-50 text-teal-800 ring-teal-200" : "bg-slate-100 text-slate-700 ring-slate-200"
        }`}>
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
          {item.active ? "Active" : "Inactive"}
        </span>
        <button
          type="button"
          aria-label={`${action} ${displayName(item)}`}
          onClick={() => item.role === "evaluator" && item.active ? deactivateUser(item) : toggleActive(item)}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          {action}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <CatalogHeader title={title} description={description ?? ""} counts={counts} />

      <form
        onSubmit={submit}
        aria-labelledby="create-account-title"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          <h2 id="create-account-title" className="text-lg font-semibold text-[#1F3A5F]">Create admin account</h2>
        </div>
        <div className="p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{fields}</div>
          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
            >
              {saving ? "Saving…" : "Create account"}
            </button>
          </div>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm-1-5a1 1 0 1 1 2 0 1 1 0 0 1-2 0Zm.25-8a.75.75 0 0 1 1.5 0v5a.75.75 0 0 1-1.5 0V5Z"
              clipRule="evenodd"
            />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <section aria-labelledby="user-directory-title" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <h2 id="user-directory-title" className="text-xl font-bold tracking-tight text-[#1F3A5F]">User directory</h2>
        </div>
        <div className="hidden overflow-x-auto xl:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500">
                {columns.map(([label]) => (
                  <th key={label} scope="col" className="px-5 py-3.5 font-semibold">{label}</th>
                ))}
                <th scope="col" className="px-5 py-3.5 text-right font-semibold">Status &amp; access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td className="px-5 py-10 text-center text-slate-500" colSpan={columns.length + 1}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td className="px-5 py-10 text-center text-slate-500" colSpan={columns.length + 1}>
                    No records found.
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id} className="transition hover:bg-slate-50/60">
                  {columns.map(([label, key]) => (
                    <td key={label} className="px-5 py-4 text-slate-700">
                      {key === "display_name" ? (
                        <div className="flex flex-col">
                          <span className="font-medium text-[#1F3A5F]">{displayName(item)}</span>
                          {item.email && (
                            <span className="text-xs text-slate-500">{item.email}</span>
                          )}
                        </div>
                      ) : key === "role" ? roleBadge(item) : (
                        displayValue(item, key)
                      )}
                    </td>
                  ))}
                  <td className="px-5 py-4 text-right">
                    {userStatus(item)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 bg-slate-50 p-3 sm:grid-cols-2 xl:hidden">
          {loading && <p className="px-5 py-10 text-center text-sm text-slate-500">Loading…</p>}
          {!loading && items.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No records found.</p>
          )}
          {items.map((item) => (
            <article key={item.id} className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="wrap-break-word text-base font-semibold text-[#1F3A5F]">
                    {displayName(item)}
                  </h3>
                  {item.email && (
                    <p className="wrap-break-word text-xs text-slate-600">{item.email}</p>
                  )}
                </div>
                {roleBadge(item)}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {columns
                  .filter(([, key]) => key !== "display_name" && key !== "role")
                  .map(([label, key]) => (
                    <div key={label}>
                      <dt className="font-semibold text-slate-600">{label}</dt>
                      <dd className="mt-0.5 text-slate-700">{displayValue(item, key)}</dd>
                    </div>
                  ))}
              </dl>
              <div className="border-t border-slate-100 pt-3">{userStatus(item)}</div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
