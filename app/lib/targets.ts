export const TARGET_TYPE_LABELS = {
  vice_president: "Vice President",
  campus_administrator: "Campus Administrator",
  satellite_college_director: "Satellite College Director",
  director: "Director",
  rde_director: "RDE Director",
  rde_center_director: "RDE Center Director",
} as const;

export type TargetType = keyof typeof TARGET_TYPE_LABELS;

export function getTargetLocationLabel(campusName: string | null, isCentral: boolean) {
  return campusName ?? (isCentral ? "Central" : "University-wide");
}
