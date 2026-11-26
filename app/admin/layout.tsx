import type { ReactNode } from "react";
import Walkthrough from "../components/walkthrough";
import AdminShell from "./admin-shell";

const steps = [
  {
    href: "/admin/dashboard",
    target: "#evaluation-cycles",
    title: "Review evaluation cycles",
    instruction: "Check recent cycles for their status, survey, and schedule. Super Admin manages the survey forms and cycle dates.",
  },
  {
    href: "/admin/campuses",
    target: '[aria-labelledby="add-catalog-title"]',
    title: "Set up a campus",
    instruction: "Use Add campus to enter the campus code and name. Review the campus list before adding a new entry.",
  },
  {
    href: "/admin/targets",
    target: '[aria-labelledby="add-catalog-title"]',
    title: "Set up an evaluation target",
    instruction: "Use Add target to register an office or unit for evaluation. Select its category and assign a campus where required.",
  },
  {
    href: "/admin/users",
    target: '[aria-labelledby="user-directory-title"]',
    title: "Review accounts and assignments",
    instruction: "Use the User directory to check account roles, campus assignments, and assigned evaluation targets. Use Create admin account above the directory when a new Admin needs access.",
  },
  {
    href: "/admin/participation",
    target: '[aria-labelledby="participation-report-title"]',
    title: "Track participation",
    instruction: "Choose a cycle in the selector above, then use Participation by target to check completion counts for each office.",
  },
  {
    href: "/admin/submissions",
    target: '[aria-labelledby="review-targets-title"]',
    title: "Review submissions by office",
    instruction: "Choose a cycle, then select an office in the highlighted list. Read its submitted and pending counts, or select a marker in the circle diagram to find the matching evaluator row.",
  },
  {
    href: "/admin/audit-log",
    target: 'section[aria-labelledby="audit-history-title"]',
    title: "Check recent activity",
    instruction: "Use the Audit Log to see recorded actions, when they happened, and which records they affected.",
  },
] as const;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminShell>
      <Walkthrough steps={steps} tutorialHref="/admin/tutorial">{children}</Walkthrough>
    </AdminShell>
  );
}
