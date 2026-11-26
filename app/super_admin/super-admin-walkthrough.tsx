import type { ReactNode } from "react";
import Walkthrough from "../components/walkthrough";

const steps = [
  {
    href: "/super_admin/survey-builder",
    target: "#survey-editor",
    title: "Build a survey",
    instruction: "Use the survey editor to add a title, a section, and at least one question. Use Preview to check the form, then select Save draft at the bottom of the editor.",
  },
  {
    href: "/super_admin/survey-builder",
    target: "#saved-surveys",
    title: "Publish the survey",
    instruction: "In Saved surveys, find your draft and select Publish. A published survey is available when you create a cycle.",
  },
  {
    href: "/super_admin/cycles",
    target: '[aria-labelledby="create-cycle-title"]',
    title: "Set up a cycle",
    instruction: "Enter a name, choose a published survey, and set the opening and closing times. Review the same-campus option and select Save cycle.",
  },
  {
    href: "/super_admin/cycles",
    target: '[aria-labelledby="cycle-directory-title"]',
    title: "Adjust dates and open the cycle",
    instruction: "Find your cycle in the directory. To reschedule it, choose Edit dates and then Save changes. Select Open cycle when the draft is ready.",
  },
  {
    href: "/super_admin/submissions",
    target: '[aria-labelledby="review-targets-title"]',
    title: "Check submissions",
    instruction: "Use the cycle selector above, then choose an office in the highlighted list. Review its submitted and pending counts. Select a diagram marker to find that evaluator’s row.",
  },
  {
    href: "/super_admin/standing",
    target: "#standing-cycle-filter",
    title: "Review live office scores",
    instruction: "Choose a cycle in the highlighted selector. Select an office in the table below to see section averages and numbered evaluator scores.",
  },
  {
    href: "/super_admin/results",
    target: '[aria-label="Result filters"]',
    title: "Choose a cycle to review",
    instruction: "Select an evaluation cycle. Use Cycle summary to compare offices or Office details to review one office.",
  },
  {
    href: "/super_admin/results",
    target: "#generate-cycle-summary",
    title: "Generate the cycle summary",
    instruction: "In Cycle summary, select Generate summary. Use the charts to compare office scores, submission counts, and evaluator roles.",
  },
  {
    href: "/super_admin/comments",
    target: '[aria-label="Comment filters"]',
    title: "Read comments by office",
    instruction: "Use the highlighted filters to choose a cycle and office. The combined feedback appears below.",
  },
  {
    href: "/super_admin/cycles",
    target: '[aria-labelledby="cycle-directory-title"]',
    title: "Close the cycle",
    instruction: "After the scheduled closing time, find the cycle in the directory and select Close cycle. If the cycle is still running, leave it open and finish the walkthrough.",
  },
] as const;

export default function SuperAdminWalkthrough({ children }: { children: ReactNode }) {
  return <Walkthrough steps={steps} tutorialHref="/super_admin/tutorial">{children}</Walkthrough>;
}
