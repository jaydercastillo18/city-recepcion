"use client";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { saveEmployee, inviteEmployee } from "../actions";
import type { Employee } from "../types";
import MutationForm from "./mutation-form";
import AccessDialog from "./access-dialog";
import type { AccessResult } from "../invitations";

export function EmployeeDrawer({
  employee,
  onSaved,
  label,
  open: controlledOpen,
  onOpenChange,
}: {
  employee?: Employee;
  onSaved?: () => void;
  label?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen,
    setOpen = onOpenChange ?? setLocalOpen;
  const [active, setActive] = useState(employee?.active ?? true);
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
        {controlledOpen === undefined && (
          <Dialog.Trigger className={employee ? "btn-ghost" : "btn-primary"}>
            {label ?? (employee ? "Editar" : "Agregar empleado")}
          </Dialog.Trigger>
        )}
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 z-50" />
          <Dialog.Content className="attendance-dialog attendance-drawer">
            <Dialog.Title className="text-xl font-bold mb-2">
              {employee ? "Editar empleado" : "Agregar empleado"}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-slate-400 mb-5">
              El código se genera automáticamente y permanece estable. Los
              cambios quedan auditados.
            </Dialog.Description>
            <MutationForm
              button={employee ? "Guardar cambios" : "Guardar empleado"}
              action={async (form) => {
                const saved = await saveEmployee(form);
                if (
                  !saved.error &&
                  !employee &&
                  createAccess &&
                  active &&
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
              {employee && (
                <p className="attendance-badge neutral">
                  Código · {employee.employee_code}
                </p>
              )}
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
                  required
                  maxLength={200}
                  className="import-input"
                />
              </label>
              <label className="block">
                Correo
                <input
                  name="email"
                  type="email"
                  required
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
                    disabled={!active}
                    onChange={(event) => setCreateAccess(event.target.checked)}
                    className="w-5 h-5"
                  />
                  Crear acceso al guardar · Se generará un enlace para crear su
                  contraseña.
                </label>
              )}
              {employee && employee.active && (
                <input type="hidden" name="active" value="on" />
              )}
              {!employee ? (
                <>
                  <label className="block">
                    Estado
                    <select
                      className="import-input"
                      value={active ? "active" : "suspended"}
                      onChange={(e) => setActive(e.target.value === "active")}
                    >
                      <option value="active">Activo</option>
                      <option value="suspended">Suspendido</option>
                    </select>
                  </label>
                  {active && <input type="hidden" name="active" value="on" />}
                </>
              ) : (
                <p className="text-xs text-slate-400">
                  Estado:{" "}
                  {employee.active
                    ? "Activo"
                    : employee.archived_at
                      ? "Archivado"
                      : "Suspendido / inactivo"}
                  . Usa el menú de acciones para cambiarlo con motivo.
                </p>
              )}
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

export const EmployeeEditor = EmployeeDrawer;
