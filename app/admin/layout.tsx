import { ReactNode } from "react";
import AdminShell from "./admin-shell";

export const instant = false;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
