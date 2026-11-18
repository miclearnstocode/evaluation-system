"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { TARGET_TYPE_LABELS, type TargetType } from "../lib/targets";

type SelectOption = { value: string; label: string };
type MembershipOption = { id: number; name: string; unit_code: string; target_type: TargetType };
type RegistrationOptions = {
  position_roles: SelectOption[];
  locations: { code: string; name: string }[];
  service_years: SelectOption[];
  memberships: MembershipOption[];
};

const fieldClassName =
  "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10 disabled:bg-slate-100";

// Eye icon (visible) and eye-off icon (hidden) — inline SVGs so no extra dependency is needed.
function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

export default function RegisterPage() {
  const [options, setOptions] = useState<RegistrationOptions | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [positionRole, setPositionRole] = useState("");
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [locationCode, setLocationCode] = useState("");
  const [yearsOfService, setYearsOfService] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch<RegistrationOptions>("/api/auth/registration-options")
      .then((data) => {
        if (active) setOptions(data);
      })
      .catch((requestError: Error) => {
        if (active) setOptionsError(requestError.message);
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const targetChoices = options?.memberships ?? [];

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    if (positionRole === "non_teaching_staff" && selectedTargetIds.length === 0) {
      setError("Select at least one evaluation target you belong to.");
      return;
    }
    if (selectedTargetIds.some((targetId) =>
      !options?.memberships.some((target) => target.unit_code === targetId),
    )) {
      setError("One of the selected targets is no longer available. Reload the page and try again.");
      return;
    }
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          position_role: positionRole,
          office_unit_codes: selectedTargetIds,
          location_code: locationCode,
          years_of_service: yearsOfService,
        }),
      });
      setRegistered(true);
      setNotice("Your account is active. You can sign in now.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Registration could not be completed.");
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
          <Link href="/" className="text-sm font-semibold text-slate-600 hover:text-[#1F3A5F]">
            Back to sign in
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-800">
            Evaluator registration
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#1F3A5F]">
            Create your account
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Your role, target assignments, and campus determine which evaluations are available to you.
            Create an account and sign in immediately. Email verification and administrator approval are not required.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 sm:p-8">
          {registered ? (
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-5">
              <h2 className="font-semibold text-teal-950">Account created</h2>
              <p className="mt-2 text-sm leading-6 text-teal-900">
                {notice}
              </p>
              <Link
                href="/"
                className="mt-5 inline-flex rounded-lg bg-[#0F9D8A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0C8575]"
              >
                Return to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="space-y-5">
              {loadingOptions && <p role="status" className="text-sm text-slate-500">Loading registration choices…</p>}
              {optionsError && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <p>{optionsError}</p>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="mt-2 font-semibold underline"
                  >
                    Try again
                  </button>
                </div>
              )}
              {options && (
                <>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="position-role" className="block text-sm font-medium text-slate-700">
                        Your Position/Role <span className="text-red-500">*</span>
                      </label>
                      <select
                        id="position-role"
                        value={positionRole}
                        onChange={(event) => {
                          setPositionRole(event.target.value);
                          setSelectedTargetIds([]);
                        }}
                        required
                        className={fieldClassName}
                      >
                        <option value="">Choose your role</option>
                        {options.position_roles.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <fieldset aria-describedby="target-assignment-help" className="rounded-xl border border-slate-200 p-4">
                    <legend className="px-1 text-sm font-medium text-slate-700">
                      Which evaluation targets are you assigned to?
                      {positionRole === "non_teaching_staff" && <span className="text-red-500"> *</span>}
                    </legend>
                    <p id="target-assignment-help" className="mb-3 text-xs leading-5 text-slate-500">
                      Select up to three targets. Your position/role is recorded separately.
                      {positionRole === "non_teaching_staff" && " At least one target is required for non-teaching staff."}
                      {` ${selectedTargetIds.length} selected.`}
                    </p>
                    {!positionRole ? (
                      <p className="text-sm text-slate-500">Choose your position/role first.</p>
                    ) : targetChoices.length === 0 ? (
                      <p className="text-sm text-slate-500">No active evaluation targets are available.</p>
                    ) : (
                      <div className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
                        {targetChoices.map((target) => {
                          const checked = selectedTargetIds.includes(target.unit_code);
                          return (
                            <label
                              key={target.id}
                              className="flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!checked && selectedTargetIds.length >= 3}
                                onChange={(event) => {
                                  setSelectedTargetIds((current) => event.target.checked
                                    ? [...current, target.unit_code]
                                    : current.filter((id) => id !== target.unit_code));
                                }}
                                className="mt-0.5 h-4 w-4 shrink-0 accent-[#0F9D8A]"
                              />
                              <span className="flex-1">
                                {target.name}
                                <span className="mt-0.5 block text-xs text-slate-500">
                                  {TARGET_TYPE_LABELS[target.target_type]}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </fieldset>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="campus-location" className="block text-sm font-medium text-slate-700">
                        Your campus or office location <span className="text-red-500">*</span>
                      </label>
                      <select
                        id="campus-location"
                        value={locationCode}
                        onChange={(event) => setLocationCode(event.target.value)}
                        required
                        className={fieldClassName}
                      >
                        <option value="">Choose your campus/location</option>
                        {options.locations.map((location) => (
                          <option key={location.code} value={location.code}>{location.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="years-of-service" className="block text-sm font-medium text-slate-700">
                        Years of Service / Stay in CAPSU <span className="text-red-500">*</span>
                      </label>
                      <select
                        id="years-of-service"
                        value={yearsOfService}
                        onChange={(event) => setYearsOfService(event.target.value)}
                        required
                        className={fieldClassName}
                      >
                        <option value="">Choose a range</option>
                        {options.service_years.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="register-email" className="block text-sm font-medium text-slate-700">
                      CAPSU email address <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="register-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@capsu.edu.ph"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      className={fieldClassName}
                    />
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="register-password" className="block text-sm font-medium text-slate-700">
                        Password <span className="text-red-500">*</span>
                      </label>
                      <div className="relative mt-1.5">
                        <input
                          id="register-password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          minLength={12}
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          required
                          className={`${fieldClassName} mt-0 pr-11`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          aria-pressed={showPassword}
                          className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 transition hover:text-slate-600 focus:outline-none focus-visible:text-teal-700"
                        >
                          <EyeIcon open={showPassword} />
                        </button>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-500">Use at least 12 characters.</p>
                    </div>
                    <div>
                      <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700">
                        Confirm password <span className="text-red-500">*</span>
                      </label>
                      <div className="relative mt-1.5">
                        <input
                          id="confirm-password"
                          type={showConfirmPassword ? "text" : "password"}
                          autoComplete="new-password"
                          minLength={12}
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          required
                          className={`${fieldClassName} mt-0 pr-11`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((v) => !v)}
                          aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                          aria-pressed={showConfirmPassword}
                          className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 transition hover:text-slate-600 focus:outline-none focus-visible:text-teal-700"
                        >
                          <EyeIcon open={showConfirmPassword} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
                  {notice && <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{notice}</p>}
                  <button
                    type="submit"
                    disabled={loading || loadingOptions || !options.locations.length}
                    className="w-full rounded-lg bg-[#0F9D8A] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0C8575] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? "Creating account…" : "Create evaluator account"}
                  </button>
                  <p className="text-center text-xs leading-5 text-slate-500">
                    Your account is active as soon as registration is complete.
                  </p>
                </>
              )}
            </form>
          )}
        </div>
      </section>
    </main>
  );
}