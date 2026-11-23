"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import type { TargetType } from "../lib/targets";

type SelectOption = { value: string; label: string };
type MembershipOption = {
  id: string;
  name: string;
  unit_code: string;
  target_type: TargetType;
  campus_code: string | null;
  student_leader_available: boolean;
};
type RegistrationOptions = {
  position_roles: SelectOption[];
  locations: { code: string; name: string }[];
  service_years: SelectOption[];
  memberships: MembershipOption[];
  office_sections: { target_type: TargetType; label: string; offices: MembershipOption[] }[];
};

const fieldClassName =
  "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10 disabled:bg-slate-100 disabled:text-slate-500";

const labelClassName = "block text-sm font-semibold text-slate-700";

const facultyOfficeOrder: Record<TargetType, number> = {
  vice_president: 0,
  campus_administrator: 1,
  satellite_college_director: 2,
  director: 3,
  rde_director: 4,
  rde_center_director: 5,
};

const bacOnlyRoles = new Set(["campus_administrator_satellite_director", "director"]);
const bacOfficeCodes = new Set(["BAC", "DIR_BAC"]);

function officeAvailable(office: MembershipOption, role: string, campus: string) {
  if (bacOnlyRoles.has(role)) {
    return office.target_type === "director" && bacOfficeCodes.has(office.unit_code);
  }

  if (role === "student_leader" && !office.student_leader_available) {
    return false;
  }

  const isCampusOffice =
    office.target_type === "campus_administrator" ||
    office.target_type === "satellite_college_director";
  if (role === "vice_president" && (isCampusOffice || office.target_type === "vice_president")) {
    return false;
  }
  if (isCampusOffice) {
    return campus !== "" && office.campus_code === campus;
  }

  return true;
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function StepCard({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md sm:p-7">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-teal-700 ring-1 ring-teal-600/20">
          {step}
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function RegisterPage() {
  const [options, setOptions] = useState<RegistrationOptions | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [positionRole, setPositionRole] = useState("");
  const [selectedOfficeCodes, setSelectedOfficeCodes] = useState<string[]>([]);
  const [locationCode, setLocationCode] = useState("");
  const [yearsOfService, setYearsOfService] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [showEmailHelp, setShowEmailHelp] = useState(false);
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
        if (active) {
          setOptions(data);
          setOptionsError("");
        }
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

  const officeSections = (options?.office_sections ?? []).map((section) => ({
    ...section,
    offices: section.offices.filter((office) => officeAvailable(office, positionRole, locationCode)),
  })).filter((section) => section.offices.length > 0);
  if (positionRole === "teaching_faculty") {
    officeSections.sort((first, second) =>
      facultyOfficeOrder[first.target_type] - facultyOfficeOrder[second.target_type],
    );
  }
  const officeChoices = officeSections.flatMap((section) => section.offices);
  const isStudentLeader = positionRole === "student_leader";
  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  function retainAvailableOffices(role: string, campus: string) {
    setSelectedOfficeCodes((current) => current.filter((code) =>
      options?.memberships.some((office) =>
        office.unit_code === code && officeAvailable(office, role, campus),
      ),
    ));
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    if (
      selectedOfficeCodes.some(
        (officeCode) => !officeChoices.some((office) => office.unit_code === officeCode),
      )
    ) {
      setError(
        "One of the selected offices/units is no longer available. Reload the page and try again.",
      );
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const result = await apiFetch<{ status?: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          position_role: positionRole,
          office_unit_codes: selectedOfficeCodes,
          location_code: locationCode,
          years_of_service: isStudentLeader ? null : yearsOfService,
        }),
      });
      if (result.status !== "registered") {
        return;
      }
      setRegistered(true);
      setNotice("Your account is active. You can sign in now.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Registration could not be completed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-linear-to-br from-slate-50 via-white to-teal-50/40 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/capsu-logo.png"
              alt="Capiz State University"
              width={44}
              height={44}
              className="h-11 w-11 rounded-lg object-contain"
            />
            <span className="hidden font-semibold tracking-tight text-[#1F3A5F] sm:block">
              CAPSU Evaluation System
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-[#1F3A5F]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Sign in
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.6fr] lg:items-start">
          {/* Left: Intro panel */}
          <aside className="lg:sticky lg:top-24">
            <div className="overflow-hidden rounded-3xl bg-linear-to-br from-[#1F3A5F] via-[#1a4a5f] to-[#0F9D8A] p-7 text-white shadow-xl shadow-teal-900/20 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-200">
                Evaluator registration
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Join the evaluation system
              </h1>
              <p className="mt-3 text-sm leading-6 text-teal-50/90">
                Your role, target assignments, and campus determine which evaluations are available
                to you. Create an account and start evaluating right away.
              </p>

              <div className="mt-8 space-y-4">
                {[
                  {
                    icon: (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    ),
                    title: "Anonymous by design",
                    text: "Your identity stays private on every evaluation you submit.",
                  },
                  {
                    icon: (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ),
                    title: "Instant activation",
                    text: "No email verification or admin approval required.",
                  },
                  {
                    icon: (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    ),
                    title: "Quick setup",
                    text: "Takes only a couple of minutes to complete.",
                  },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-teal-100 ring-1 ring-white/20">
                      {item.icon}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-teal-100/80">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* Right: Form */}
          <div className="min-w-0">
            {registered ? (
              <div className="rounded-3xl border border-teal-200 bg-white p-8 text-center shadow-lg shadow-teal-900/5 sm:p-10">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 text-teal-600 ring-8 ring-teal-50">
                  <CheckIcon />
                </div>
                <h2 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
                  You&apos;re all set!
                </h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">{notice}</p>
                <Link
                  href="/"
                  className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F9D8A] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-600/20 transition hover:bg-[#0C8575] hover:shadow-teal-600/30"
                >
                  Go to sign in
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="space-y-5">
                {/* Status / errors */}
                {optionsError && (
                  <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <div>
                      <p>{optionsError}</p>
                      <button type="button" onClick={() => window.location.reload()} className="mt-1 font-semibold underline">
                        Try again
                      </button>
                    </div>
                  </div>
                )}

                {loadingOptions && (
                  <div role="status" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                    <svg className="h-4 w-4 animate-spin text-teal-600" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading registration choices…
                  </div>
                )}

                {options && (
                  <>
                    {/* Step 1: Personal info */}
                    <StepCard step={1} title="Personal information" description="Tell us who you are.">
                      <div className="grid gap-5 sm:grid-cols-2">
                        <div>
                          <label htmlFor="first-name" className={labelClassName}>
                            First name <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="first-name"
                            type="text"
                            autoComplete="given-name"
                            maxLength={100}
                            value={firstName}
                            onChange={(event) => setFirstName(event.target.value)}
                            required
                            placeholder="Juan"
                            className={fieldClassName}
                          />
                        </div>
                        <div>
                          <label htmlFor="last-name" className={labelClassName}>
                            Last name <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="last-name"
                            type="text"
                            autoComplete="family-name"
                            maxLength={100}
                            value={lastName}
                            onChange={(event) => setLastName(event.target.value)}
                            required
                            placeholder="Dela Cruz"
                            className={fieldClassName}
                          />
                        </div>
                      </div>
                    </StepCard>

                    {/* Step 2: Role & assignment */}
                    <StepCard step={2} title="Role & assignment" description="This helps us match you with the right evaluations.">
                      <div className="space-y-5">
                        <div>
                          <label htmlFor="position-role" className={labelClassName}>
                            Your Position/Role <span className="text-red-500">*</span>
                          </label>
                          <select
                            id="position-role"
                            value={positionRole}
                            onChange={(event) => {
                              setPositionRole(event.target.value);
                              retainAvailableOffices(event.target.value, locationCode);
                              if (event.target.value === "student_leader") {
                                setYearsOfService("");
                              }
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

                        <div>
                          <label htmlFor="campus-location" className={labelClassName}>
                            Your campus or office location <span className="text-red-500">*</span>
                          </label>
                          <select
                            id="campus-location"
                            value={locationCode}
                            onChange={(event) => {
                              setLocationCode(event.target.value);
                              retainAvailableOffices(positionRole, event.target.value);
                            }}
                            required
                            className={fieldClassName}
                          >
                            <option value="">Choose your campus/location</option>
                            {options.locations.map((location) => (
                              <option key={location.code} value={location.code}>{location.name}</option>
                            ))}
                          </select>
                        </div>

                        {!isStudentLeader && (
                          <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                            <label htmlFor="years-of-service" className={labelClassName}>
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
                        )}
                      </div>
                    </StepCard>

                    {/* Step 3: Office membership */}
                    <StepCard step={3} title="Office/Unit membership" description="Optional: select the offices/units you belong to.">
                      <fieldset aria-describedby="office-membership-help">
                        <div className="mb-3 flex items-center justify-between">
                          <p id="office-membership-help" className="text-xs leading-5 text-slate-500">
                            You can evaluate only the offices/units selected here.
                          </p>
                          <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700 ring-1 ring-teal-600/20">
                            {selectedOfficeCodes.length} selected
                          </span>
                        </div>
                        {officeChoices.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                            No offices/units are available right now.
                          </p>
                        ) : (
                          <div className="max-h-72 space-y-4 overflow-y-auto pr-1">
                            {officeSections.map(({ target_type, label, offices }) => (
                              <fieldset key={target_type}>
                                <legend className="mb-2 text-sm font-semibold text-slate-700">{label}</legend>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {offices.map((office) => {
                                    const checked = selectedOfficeCodes.includes(office.unit_code);
                                    return (
                                      <label
                                        key={office.id}
                                        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-sm transition ${
                                          checked
                                            ? "border-teal-500 bg-teal-50/70 ring-1 ring-teal-500/20"
                                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={(event) => {
                                            setSelectedOfficeCodes((current) =>
                                              event.target.checked
                                                ? [...current, office.unit_code]
                                                : current.filter((code) => code !== office.unit_code),
                                            );
                                          }}
                                          className="mt-0.5 h-4 w-4 shrink-0 rounded accent-[#0F9D8A]"
                                        />
                                        <span className="flex-1">
                                          <span className="block font-medium text-slate-800">{office.name}</span>
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </fieldset>
                            ))}
                          </div>
                        )}
                      </fieldset>
                    </StepCard>

                    {/* Step 4: Account credentials */}
                    <StepCard step={4} title="Account credentials" description="Enter your email address and choose a strong password.">
                      <div className="space-y-5">
                        <div onKeyDown={(event) => {
                          if (event.key === "Escape") setShowEmailHelp(false);
                        }}>
                          <div className="relative flex items-center gap-2">
                            <label htmlFor="register-email" className={labelClassName}>
                              Email address <span className="text-red-500">*</span>
                            </label>
                            <button
                              type="button"
                              aria-label="Accepted email addresses"
                              aria-expanded={showEmailHelp}
                              aria-controls="register-email-help"
                              onClick={() => setShowEmailHelp((visible) => !visible)}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-xs font-semibold text-slate-600 hover:border-teal-600 hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                            >
                              ?
                            </button>
                            <div
                              id="register-email-help"
                              hidden={!showEmailHelp}
                              className="absolute bottom-full left-0 z-10 mb-2 w-80 max-w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm leading-5 text-slate-100 shadow-xl"
                            >
                              <p className="font-semibold text-white">Which email should I use?</p>
                              <p className="mt-1 text-slate-200">
                                Use your CAPSU email address. Student Leaders can also use their student CAPSU email address.
                              </p>
                            </div>
                          </div>
                          <input
                            id="register-email"
                            aria-describedby={showEmailHelp ? "register-email-help" : undefined}
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            required
                            className={fieldClassName}
                          />
                        </div>

                        <div className="grid gap-5 sm:grid-cols-2">
                          <div>
                            <label htmlFor="register-password" className={labelClassName}>
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
                            <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-500">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="16" x2="12" y2="12" />
                                <line x1="12" y1="8" x2="12.01" y2="8" />
                              </svg>
                              Use at least 12 characters.
                            </p>
                          </div>
                          <div>
                            <label htmlFor="confirm-password" className={labelClassName}>
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
                                className={`${fieldClassName} mt-0 pr-11 ${
                                  passwordMismatch ? "border-red-400 focus:border-red-500 focus:ring-red-500/10" : ""
                                }`}
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
                            {passwordMismatch && (
                              <p className="mt-1.5 text-xs font-medium text-red-600">
                                Passwords do not match.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </StepCard>

                    {/* Feedback */}
                    {error && (
                      <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <p>{error}</p>
                      </div>
                    )}
                    {notice && (
                      <div role="status" className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
                        {notice}
                      </div>
                    )}

                    {/* Submit */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                      <button
                        type="submit"
                        disabled={loading || loadingOptions || !options.locations.length}
                        className="group flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-[#0F9D8A] to-[#0C8575] px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-600/20 transition hover:shadow-teal-600/30 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {loading ? (
                          <>
                            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Creating account…
                          </>
                        ) : (
                          <>
                            Create evaluator account
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true">
                              <line x1="5" y1="12" x2="19" y2="12" />
                              <polyline points="12 5 19 12 12 19" />
                            </svg>
                          </>
                        )}
                      </button>
                      <p className="mt-3 text-center text-xs leading-5 text-slate-500">
                        By creating an account, you agree to keep evaluations anonymous and confidential.
                      </p>
                    </div>
                  </>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
