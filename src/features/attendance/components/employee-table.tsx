import type { Employee } from "../types";
import { EmployeeAvatar, EmployeeStatusBadge } from "./ui";
import EmployeeActions from "./employee-actions";
import { EMAIL_LABEL } from "./access-dialog";
export function EmployeeCard({ employee: e }: { employee: Employee }) {
  return (
    <article className="attendance-panel p-5">
      <div className="flex gap-3 items-center mb-4">
        <EmployeeAvatar name={e.full_name} />
        <div className="min-w-0">
          <h3 className="font-semibold">{e.full_name}</h3>
          <p className="text-xs text-fuchsia-300">{e.employee_code}</p>
        </div>
      </div>
      <p className="text-sm text-slate-300">
        {e.position || "Sin cargo"} · {e.late_tolerance_minutes} min
      </p>
      <p className="text-xs text-slate-400 break-all my-3">
        {e.email || "Sin correo"}
        <br />
        {e.phone || "Sin teléfono"}
      </p>
      <EmployeeStatusBadge employee={e} />
      <p className="text-xs text-slate-400 my-3">
        Correo: {EMAIL_LABEL[e.invitation_email_status ?? "not_sent"]}
      </p>
      <EmployeeActions employee={e} />
    </article>
  );
}
export function EmployeeTable({ employees }: { employees: Employee[] }) {
  return (
    <>
      <div className="attendance-table-wrap attendance-desktop">
        <table className="attendance-table employee-table">
          <caption className="sr-only">Personal de City Ofertas</caption>
          <thead>
            <tr>
              {[
                "Código",
                "Empleado",
                "Cargo / función",
                "Contacto",
                "Tolerancia",
                "Estado",
                "Acciones",
              ].map((x) => (
                <th scope="col" key={x}>
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td className="font-mono text-[11px] text-fuchsia-300">
                  {e.employee_code}
                </td>
                <td>
                  <div className="flex items-center gap-3">
                    <EmployeeAvatar name={e.full_name} />
                    <span className="font-semibold text-sm">{e.full_name}</span>
                  </div>
                </td>
                <td className="text-slate-300">{e.position || "Sin cargo"}</td>
                <td className="contact text-slate-300">
                  <p>{e.email || "Sin correo"}</p>
                  <p className="text-slate-500 mt-1">
                    {e.phone || "Sin teléfono"}
                  </p>
                </td>
                <td>
                  <span className="attendance-badge neutral">
                    {e.late_tolerance_minutes} min
                  </span>
                </td>
                <td>
                  <EmployeeStatusBadge employee={e} />
                  <p className="text-[10px] text-slate-400 mt-2">
                    Correo:{" "}
                    {EMAIL_LABEL[e.invitation_email_status ?? "not_sent"]}
                  </p>
                </td>
                <td>
                  <EmployeeActions employee={e} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="attendance-mobile">
        {employees.map((e) => (
          <EmployeeCard key={e.id} employee={e} />
        ))}
      </div>
    </>
  );
}
