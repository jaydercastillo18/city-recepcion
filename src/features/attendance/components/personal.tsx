"use client";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { saveEmployee, inviteEmployee } from "../actions";
import type { Employee } from "../types";
import MutationForm from "./mutation-form";
import AccessDialog, { ACCOUNT_LABEL, EMAIL_LABEL } from "./access-dialog";
import type { AccessResult } from "../invitations";
import { normalizeName } from "../domain";
export function EmployeeEditor({
  employee,
  onSaved,
  label,
}: {
  employee?: Employee;
  onSaved?: () => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [createAccess, setCreateAccess] = useState(!employee);
  const [created, setCreated] = useState<{
    employee: Employee;
    access: AccessResult;
  } | null>(null);
  const [tolerance, setTolerance] = useState(
    employee?.late_tolerance_minutes ?? 5,
  );
  return (
    <>
      {created && (
        <AccessDialog
          employee={created.employee}
          initial={created.access}
          onClose={() => setCreated(null)}
        />
      )}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger className="btn-ghost">
          {label ?? (employee ? "Editar" : "Agregar empleado")}
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 z-50" />
          <Dialog.Content className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-lg max-h-[90dvh] overflow-y-auto card-base p-6">
            <Dialog.Title className="text-xl font-bold mb-2">
              {employee ? "Editar empleado" : "Agregar empleado"}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-slate-400 mb-5">
              El código interno es estable. Los cambios quedan auditados.
            </Dialog.Description>
            <MutationForm
              button={
                !employee && createAccess ? "Guardar y crear acceso" : "Guardar"
              }
              action={async (form) => {
                const saved = await saveEmployee(form);
                if (
                  !saved.error &&
                  !employee &&
                  createAccess &&
                  "data" in saved &&
                  saved.data
                ) {
                  const person = saved.data as unknown as Employee;
                  const access = await inviteEmployee(person.id);
                  setCreated({ employee: person, access });
                }
                return saved;
              }}
              onSuccess={() => {
                setOpen(false);
                onSaved?.();
              }}
            >
              <input type="hidden" name="id" value={employee?.id ?? ""} />
              <label className="block">
                Nombre
                <input
                  name="full_name"
                  defaultValue={employee?.full_name}
                  required
                  minLength={2}
                  maxLength={200}
                  className="import-input"
                />
              </label>
              <label className="block">
                Cargo / función
                <input
                  name="position"
                  defaultValue={employee?.position}
                  maxLength={200}
                  className="import-input"
                />
              </label>
              <label className="block">
                Correo
                <input
                  name="email"
                  type="email"
                  required={!employee && createAccess}
                  defaultValue={employee?.email ?? ""}
                  readOnly={Boolean(employee?.profile_id)}
                  className="import-input"
                />
              </label>
              <label className="block">
                Teléfono
                <input
                  name="phone"
                  type="tel"
                  defaultValue={employee?.phone ?? ""}
                  maxLength={40}
                  className="import-input"
                />
              </label>
              <fieldset className="space-y-2">
                <legend>Tolerancia individual</legend>
                <div className="flex flex-wrap gap-2">
                  {[0, 5, 10, 15].map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={tolerance === v}
                      className="btn-ghost"
                      onClick={() => setTolerance(v)}
                    >
                      {v} min
                    </button>
                  ))}
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() =>
                      document
                        .getElementById(`tolerance-${employee?.id ?? "new"}`)
                        ?.focus()
                    }
                  >
                    Personalizado
                  </button>
                </div>
                <label className="block">
                  Minutos (0–120)
                  <input
                    id={`tolerance-${employee?.id ?? "new"}`}
                    name="late_tolerance_minutes"
                    type="number"
                    min={0}
                    max={120}
                    step={1}
                    required
                    value={tolerance}
                    onChange={(event) =>
                      setTolerance(Number(event.target.value))
                    }
                    className="import-input"
                  />
                </label>
              </fieldset>
              {!employee && (
                <label className="flex gap-3 items-center">
                  <input
                    type="checkbox"
                    checked={createAccess}
                    onChange={(event) => setCreateAccess(event.target.checked)}
                    className="w-5 h-5"
                  />
                  Crear acceso al guardar (requiere correo)
                </label>
              )}
              <label className="flex gap-3 items-center">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={employee?.active ?? true}
                  className="w-5 h-5"
                />{" "}
                Activo
              </label>
              <label className="block">
                Motivo
                <input
                  name="reason"
                  required
                  minLength={3}
                  maxLength={2000}
                  defaultValue={employee ? "" : "Alta de personal"}
                  className="import-input"
                />
              </label>
            </MutationForm>
            <Dialog.Close className="btn-ghost w-full mt-3">
              Cancelar
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
function InviteButton({ employee }: { employee: Employee }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        disabled={
          !employee.active ||
          !employee.email ||
          employee.access_status === "activated"
        }
        className="btn-ghost"
        onClick={() => setOpen(true)}
      >
        {employee.access_status === "activated"
          ? "Cuenta activada"
          : employee.profile_id
            ? "Gestionar acceso"
            : "Crear acceso"}
      </button>
      {open && (
        <AccessDialog employee={employee} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
export default function Personal({ employees }: { employees: Employee[] }) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("active");
  const people = employees.filter(
    (e) =>
      (filter === "all" || e.active === (filter === "active")) &&
      normalizeName(`${e.full_name} ${e.employee_code} ${e.position}`).includes(
        normalizeName(query),
      ),
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-end">
        <label className="flex-1 min-w-48">
          Buscar
          <input
            className="import-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Estado
          <select
            className="import-input"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
            <option value="all">Todos</option>
          </select>
        </label>
        <EmployeeEditor />
      </div>
      <p className="text-sm text-slate-400">
        {people.length} empleados · La contraseña la elige cada empleado.
      </p>
      {people.map((e) => (
        <article
          key={e.id}
          className="card-base p-5 flex flex-col sm:flex-row justify-between gap-4"
        >
          <div>
            <p className="text-xs text-fuchsia-300">
              {e.employee_code} · {e.active ? "Activo" : "Inactivo"}
            </p>
            <h2 className="font-bold text-lg">{e.full_name}</h2>
            <p className="text-sm text-purple-200">
              {
                ACCOUNT_LABEL[
                  e.access_status ?? (e.profile_id ? "pending" : "no_access")
                ]
              }{" "}
              · Correo: {EMAIL_LABEL[e.invitation_email_status ?? "not_sent"]}
            </p>
            <p className="text-purple-200 text-sm">
              Tolerancia: {e.late_tolerance_minutes} minutos
            </p>
            <p className="text-slate-400 text-sm">
              {e.position || "Sin cargo"} · {e.email || "Sin correo"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <EmployeeEditor employee={e} />
            <InviteButton employee={e} />
          </div>
        </article>
      ))}
      {!people.length && (
        <p className="card-base p-8 text-slate-400">
          No hay empleados para este filtro.
        </p>
      )}
    </div>
  );
}
