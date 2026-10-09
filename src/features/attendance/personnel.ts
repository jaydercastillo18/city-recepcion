import type { Employee } from "./types";
import { normalizeName } from "./domain";
export function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((x) => x[0])
      .join("")
      .toUpperCase() || "CO"
  );
}
export function employeeState(e: Employee) {
  if (e.archived_at) return "archived";
  if (e.suspended_at) return "suspended";
  if (!e.active) return "inactive";
  return e.access_status ?? (e.profile_id ? "pending" : "no_access");
}
export function canEnterAttendance(
  e: Pick<Employee, "active" | "archived_at"> | null | undefined,
) {
  return Boolean(e?.active && !e.archived_at);
}
export function filterEmployees(
  employees: Employee[],
  query: string,
  state: string,
  position: string,
) {
  return employees.filter(
    (e) =>
      (state === "all" ||
        (state === "active"
          ? e.active && !e.archived_at
          : employeeState(e) === state)) &&
      (!position || e.position === position) &&
      normalizeName(
        `${e.full_name} ${e.email ?? ""} ${e.employee_code} ${e.phone ?? ""}`,
      ).includes(normalizeName(query)),
  );
}
