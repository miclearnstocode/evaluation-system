import type { ReactNode } from "react";
import AdminShell from "../admin/admin-shell";

export default function SuperAdminShell({ children }: { children: ReactNode }) {
  return <AdminShell audience="super_admin">{children}</AdminShell>;
}
