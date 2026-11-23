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
      "Create admin accounts for office-level mean scores only, or super-admin accounts for full evaluator scores and system management. Deactivate evaluator accounts to disable access while preserving their existing records.",
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

export default function CatalogPage({ kind }: { kind: CatalogKind }) {
  const { title, path, description } = config[kind];
  const [items, setItems] = useState<CatalogRow[]>([]);
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
              <div key="role-note" className="sm:col-span-2 lg:col-span-3">
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

  const columns: [string, string][] =
    kind === "campuses"
      ? [
          ["Code", "code"],
          ["Name", "name"],
          ["Type", "is_central"],
        ]
      : kind === "targets"
        ? [
            ["Target", "name"],
            ["Type", "target_type"],
            ["Campus / Scope", "campus_name"],
          ]
        : [
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
    if (key === "target_type") {
      const targetType = item.target_type ?? item.office_type;
      return targetType ? TARGET_TYPE_LABELS[targetType] : "—";
    }
    if (key === "campus_name" && kind === "targets") {
      return item.campus_name ?? (item.is_central ? "Central" : "University-wide");
    }
    if (key === "position_role") {
      return (
        ({
          teaching_faculty: "Teaching / Faculty",
          non_teaching_staff: "Non-Teaching / Administrative Staff",
          student_leader: "Student Leader",
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

  const submitLabel =
    kind === "targets" ? "Add target" : kind === "users" ? "Add user" : `Add ${kind.slice(0, -1)}`;

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F9D8A]/10 text-[#0F9D8A]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-[#1F3A5F]">{title}</h1>
        </div>
        {description && (
          <p className="max-w-3xl text-sm leading-relaxed text-slate-600">{description}</p>
        )}
        {kind === "targets" && (
          <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
            Manage the six target categories evaluated in each cycle. Campus Administrators and Satellite
            College Directors must be linked to a campus.
          </p>
        )}
      </header>

      {/* Form card */}
      <form
        onSubmit={submit}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/[0.02]"
      >
        <h2 className="mb-5 text-sm font-semibold text-[#1F3A5F]">
          {kind === "users"
            ? "Create account"
            : `Add ${kind === "targets" ? "target" : kind.slice(0, -1)}`}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{fields}</div>
        <div className="mt-6 flex justify-end">
          <button
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0F9D8A] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c857a] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                <path fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" className="opacity-75" />
              </svg>
            )}
            {saving ? "Saving…" : submitLabel}
          </button>
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

      {/* Table (desktop) / Cards (mobile) */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/[0.02]">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500">
                {columns.map(([label]) => (
                  <th key={label} className="px-5 py-3.5 font-semibold">{label}</th>
                ))}
                <th className="px-5 py-3.5 text-right font-semibold">Status</th>
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
                      ) : (
                        displayValue(item, key)
                      )}
                    </td>
                  ))}
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => toggleActive(item)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                          item.active
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                            : "bg-slate-100 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-200"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${item.active ? "bg-emerald-500" : "bg-slate-400"}`} />
                        {item.active ? "Active" : "Inactive"}
                      </button>
                      {kind === "users" && item.role === "evaluator" && item.active && (
                        <button
                          type="button"
                          onClick={() => deactivateUser(item)}
                          className="rounded-lg px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
                        >
                          Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="divide-y divide-slate-100 md:hidden">
          {loading && <p className="px-5 py-10 text-center text-sm text-slate-500">Loading…</p>}
          {!loading && items.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No records found.</p>
          )}
          {items.map((item) => (
            <article key={item.id} className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-[#1F3A5F]">
                    {kind === "users" ? displayName(item) : displayValue(item, columns[0][1])}
                  </h3>
                  {kind === "users" && item.email && (
                    <p className="truncate text-xs text-slate-500">{item.email}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggleActive(item)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    item.active
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                  }`}
                >
                  {item.active ? "Active" : "Inactive"}
                </button>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {columns
                  .filter(([, key]) => key !== "display_name")
                  .map(([label, key]) => (
                    <div key={label}>
                      <dt className="font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
                      <dd className="mt-0.5 text-slate-700">{displayValue(item, key)}</dd>
                    </div>
                  ))}
              </dl>
              {kind === "users" && item.role === "evaluator" && item.active && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => deactivateUser(item)}
                    className="text-xs font-semibold text-amber-700 hover:underline"
                  >
                    Deactivate evaluator
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}