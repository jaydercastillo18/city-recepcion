"use client";
import { useState } from "react";
import { Users, Mail, UserRoundX, UserRoundCheck } from "lucide-react";
import type { Employee } from "../types";
import { filterEmployees, employeeState } from "../personnel";
import { EmployeeTable } from "./employee-table";
import { EmployeeDrawer } from "./employee-drawer";
import { AttendanceKpiCard, AttendanceToolbar, AttendanceEmpty } from "./ui";
export { EmployeeEditor } from "./employee-drawer";
export default function Personal({
  employees,
  attendedToday = 0,
}: {
  employees: Employee[];
  attendedToday?: number;
}) {
  const [query, setQuery] = useState(""),
    [state, setState] = useState("active"),
    [position, setPosition] = useState("");
  const people = filterEmployees(employees, query, state, position),
    positions = [
      ...new Set(employees.map((e) => e.position).filter(Boolean)),
    ].sort();
  return (
    <div>
      <div className="flex justify-between items-end mb-5 gap-4">
        <div>
          <h2 className="text-xl font-bold">Gestión de personal</h2>
          <p className="text-sm text-slate-400 mt-1">
            Tu equipo, sus horarios y accesos en un solo lugar.
          </p>
        </div>
        <span className="attendance-badge neutral">
          {employees.length} registrados
        </span>
      </div>
      <div className="attendance-kpis">
        <AttendanceKpiCard
          label="Empleados activos"
          value={employees.filter((e) => e.active && !e.archived_at).length}
          subtitle="Personal habilitado"
          icon={Users}
          tone="green"
        />
        <AttendanceKpiCard
          label="Invitaciones pendientes"
          value={employees.filter((e) => employeeState(e) === "pending").length}
          subtitle="Por activar su cuenta"
          icon={Mail}
          tone="amber"
        />
        <AttendanceKpiCard
          label="Suspendidos"
          value={
            employees.filter((e) => employeeState(e) === "suspended").length
          }
          subtitle="Suspensión reversible"
          icon={UserRoundX}
          tone="red"
        />
        <AttendanceKpiCard
          label="Asistencias hoy"
          value={attendedToday}
          subtitle="Entradas del turno día"
          icon={UserRoundCheck}
        />
      </div>
      <AttendanceToolbar>
        <label>
          Buscar empleado
          <input
            className="import-input"
            placeholder="Nombre, correo o código…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Estado
          <select
            className="import-input"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            {[
              ["all", "Todos"],
              ["active", "Activos"],
              ["activated", "Cuenta activada"],
              ["pending", "Invitación pendiente"],
              ["no_access", "Sin acceso"],
              ["suspended", "Suspendidos"],
              ["inactive", "Inactivos"],
              ["archived", "Archivados"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cargo / función
          <select
            className="import-input"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          >
            <option value="">Todos</option>
            {positions.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <EmployeeDrawer label="+ Crear empleado" />
      </AttendanceToolbar>
      <p className="text-xs text-slate-400 mb-4">
        {people.length} resultados · Tolerancia individual · Cambios auditados
      </p>
      {people.length ? (
        <EmployeeTable employees={people} />
      ) : (
        <AttendanceEmpty>
          <Users className="mx-auto text-purple-300 mb-3" size={32} />
          <p className="mb-4">
            {employees.length
              ? "No hay empleados para estos filtros."
              : "No hay empleados registrados."}
          </p>
          {!employees.length && (
            <EmployeeDrawer label="Crear primer empleado" />
          )}
        </AttendanceEmpty>
      )}
    </div>
  );
}
