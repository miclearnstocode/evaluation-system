"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type CatalogKind = "campuses" | "offices" | "administrators" | "users";

type CatalogRow = {
  id: number;
  code?: string;
  name?: string;
  email?: string;
  campus_id?: number;
  campus_name?: string;
  office_id?: number;
  office_name?: string;
  office_type?: string;
  position?: string | null;
  role?: string;
  evaluator_group?: string | null;
  position_role?: string | null;
  office_unit_code?: string | null;
  office_unit_name?: string | null;
  years_of_service?: string | null;
  is_central?: boolean | number;
  is_central_staff?: boolean | number;
  active: boolean | number;
};

type NamedOption = {
  id: number;
  name: string;
};

const config: Record<CatalogKind, { title: string; path: string }> = {
  campuses: { title: "Campuses", path: "/api/admin/campuses" },
  offices: { title: "Offices", path: "/api/admin/offices" },
  administrators: { title: "Administrators", path: "/api/admin/administrators" },
  users: { title: "Users", path: "/api/admin/users" },
};

export default function CatalogPage({ kind }: { kind: CatalogKind }) {
  const { title, path } = config[kind];
  const [items, setItems] = useState<CatalogRow[]>([]);
  const [options, setOptions] = useState<NamedOption[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const optionPath =
      kind === "offices" || kind === "users"
        ? "/api/admin/campuses"
        : kind === "administrators"
          ? "/api/admin/offices"
          : null;
    const optionRequest = optionPath
      ? apiFetch<{ items: NamedOption[] }>(optionPath)
      : Promise.resolve({ items: [] });

    Promise.all([apiFetch<{ items: CatalogRow[] }>(path), optionRequest])
      .then(([list, optionList]) => {
        if (!active) return;
        setItems(list.items);
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
    setItems(result.items);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    let body: Record<string, string | number | boolean>;
    if (kind === "campuses") {
      body = {
        code: form.code ?? "",
        name: form.name ?? "",
        is_central: form.is_central === "true",
      };
    } else if (kind === "offices") {
      body = {
        campus_id: Number(form.campus_id),
        name: form.name ?? "",
        office_type: form.office_type ?? "campus_office",
      };
    } else if (kind === "administrators") {
      body = {
        office_id: Number(form.office_id),
        name: form.name ?? "",
        position: form.position ?? "",
      };
    } else {
      body = {
        email: form.email ?? "",
        password: form.password ?? "",
        role: "super_admin",
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

  async function deleteEvaluator(item: CatalogRow) {
    if (!window.confirm(
      `Delete ${item.email}? Their account, participation records, answer contributions, and comments will be removed. This cannot be undone.`,
    )) return;
    setError("");
    try {
      await apiFetch(`${path}/${item.id}`, { method: "DELETE" });
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The evaluator account could not be deleted.");
    }
  }

  function input(name: string, label: string, required = true, type = "text") {
    return (
      <label key={name} className="block text-xs font-semibold text-gray-600">
        {label}
        <input
          required={required}
          type={type}
          value={form[name] ?? ""}
          onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
          className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-normal text-gray-800"
        />
      </label>
    );
  }

  function select(name: string, label: string, choices: { value: string; label: string }[]) {
    return (
      <label key={name} className="block text-xs font-semibold text-gray-600">
        {label}
        <select
          required
          value={form[name] ?? ""}
          onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
          className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-normal text-gray-800"
        >
          <option value="" disabled>Select…</option>
          {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
        </select>
      </label>
    );
  }

  const fields =
    kind === "campuses"
      ? [input("code", "Campus code"), input("name", "Campus name"), select("is_central", "Campus type", [{ value: "false", label: "Campus" }, { value: "true", label: "Central" }])]
      : kind === "offices"
        ? [select("campus_id", "Campus", options.map((item) => ({ value: String(item.id), label: item.name }))), input("name", "Office name"), select("office_type", "Office type", [{ value: "campus_office", label: "Campus office" }, { value: "central_admin", label: "Central admin" }])]
        : kind === "administrators"
          ? [select("office_id", "Office", options.map((item) => ({ value: String(item.id), label: item.name }))), input("name", "Administrator name"), input("position", "Position", false)]
          : [input("email", "Super admin email", true, "email"), input("password", "Initial password (at least 12 characters)", true, "password")];

  const columns =
    kind === "campuses"
      ? [["Code", "code"], ["Name", "name"], ["Type", "is_central"]]
      : kind === "offices"
        ? [["Office", "name"], ["Campus", "campus_name"], ["Type", "office_type"]]
        : kind === "administrators"
          ? [["Name", "name"], ["Position", "position"], ["Office", "office_name"], ["Campus", "campus_name"]]
          : [["Email", "email"], ["Position/Role", "position_role"], ["Office/Unit", "office_unit_name"], ["Campus", "campus_name"], ["Years of Service / Stay", "years_of_service"]];

  function displayValue(item: CatalogRow, key: string) {
    if (key === "is_central") return item.is_central ? "Central" : "Campus";
    if (key === "is_central_staff") return item.is_central_staff ? "Yes" : "No";
    if (key === "office_type") return item.office_type === "central_admin" ? "Central admin" : "Campus office";
    if (key === "position_role") {
      return ({
        teaching_faculty: "Teaching / Faculty",
        non_teaching_staff: "Non-Teaching / Administrative Staff",
        student_leader: "Student Leader",
      } as Record<string, string>)[item.position_role ?? ""] ?? "—";
    }
    if (key === "years_of_service") {
      return ({
        lt_1: "Less than 1 year",
        "1_5": "1–5 years",
        "6_10": "6–10 years",
        "11_plus": "11+ years",
      } as Record<string, string>)[item.years_of_service ?? ""] ?? "—";
    }
    return String(item[key as keyof CatalogRow] ?? "—");
  }

  return (
    <div className="space-y-6">
              <h1 className="text-2xl font-bold text-[#1F3A5F]">{title}</h1>
              {kind === "users" && (
                <p className="text-sm text-gray-600">
                  Evaluator accounts are active immediately after registration. Delete accounts that are no longer affiliated with CAPSU; deletion also retracts their submissions and comments.
                </p>
              )}
              <form onSubmit={submit} className="grid gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
                {fields}
                <button disabled={saving} className="self-end rounded-lg bg-[#0F9D8A] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-70">
                  {saving ? "Saving…" : `Add ${kind === "administrators" ? "administrator" : kind.slice(0, -1)}`}
                </button>
              </form>
              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead><tr className="bg-gray-100 text-[#1F3A5F]">{columns.map(([label]) => <th key={label} className="px-5 py-4 font-semibold">{label}</th>)}<th className="px-5 py-4 text-right font-semibold">Status</th></tr></thead>
                  <tbody>
                    {loading && <tr><td className="px-5 py-5 text-gray-500" colSpan={columns.length + 1}>Loading…</td></tr>}
                    {!loading && items.length === 0 && <tr><td className="px-5 py-5 text-gray-500" colSpan={columns.length + 1}>No records found.</td></tr>}
                    {items.map((item) => (
                      <tr key={item.id} className="border-t border-gray-100">
                        {columns.map(([label, key]) => <td key={label} className="px-5 py-4 text-gray-700">{displayValue(item, key)}</td>)}
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => toggleActive(item)}
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${item.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                            >
                              {item.active ? "Active" : "Inactive"}
                            </button>
                            {kind === "users" && item.role === "evaluator" && (
                              <button
                                type="button"
                                onClick={() => deleteEvaluator(item)}
                                className="rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
    </div>
  );
}
