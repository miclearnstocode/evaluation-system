import type { ReactNode } from "react";
import AdminShell from "../admin/admin-shell";
import SuperAdminWalkthrough from "./super-admin-walkthrough";

export default function SuperAdminShell({ children }: { children: ReactNode }) {
  return (
    <AdminShell audience="super_admin">
      <SuperAdminWalkthrough>{children}</SuperAdminWalkthrough>
    </AdminShell>
  );
}
