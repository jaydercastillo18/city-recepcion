"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { Archive, ShieldAlert, ShieldCheck } from "lucide-react";
import type { Employee } from "../types";
import { employeeLifecycle } from "../actions";
import MutationForm from "./mutation-form";
export function EmployeeLifecycleDialog({
  employee,
  action,
  onClose,
}: {
  employee: Employee;
  action: "suspend" | "reactivate" | "archive";
  onClose: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const archive = action === "archive",
    title = archive
      ? "Eliminar / archivar empleado"
      : action === "suspend"
        ? "Suspender empleado"
        : "Reactivar empleado",
    Icon = archive ? Archive : action === "suspend" ? ShieldAlert : ShieldCheck;
  return (
    <Dialog.Root
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/75 z-50" />
        <Dialog.Content className="attendance-dialog attendance-dialog-center">
          <Icon
            size={28}
            className="text-fuchsia-300 mb-4"
            aria-hidden="true"
          />
          <Dialog.Title className="text-xl font-bold">{title}</Dialog.Title>
          <Dialog.Description className="text-sm text-slate-300 my-4">
            {employee.full_name} · {employee.employee_code}.{" "}
            {archive
              ? "Se archivará de forma segura. El historial laboral, horarios y fotografías se conservan. No podrá entrar al sistema ni marcar."
              : action === "suspend"
                ? "No podrá iniciar sesión en el sistema ni registrar asistencia. Su historial y horarios se conservan. Puedes reactivarlo después."
                : "Se restaurará el acceso al sistema y la marcación. Conserva su cuenta y su tolerancia individual."}
          </Dialog.Description>
          <MutationForm
            submitDisabled={archive && confirmation !== employee.employee_code}
            button={archive ? "Archivar empleado" : title}
            onSuccess={onClose}
            action={employeeLifecycle}
          >
            <input type="hidden" name="id" value={employee.id} />
            <input type="hidden" name="action" value={action} />
            <label className="block">
              Motivo obligatorio
              <textarea
                name="reason"
                required
                minLength={3}
                maxLength={2000}
                className="import-input"
              />
            </label>
            {archive && (
              <label className="block">
                Para continuar escribe exactamente {employee.employee_code}
                <input
                  name="confirmation"
                  autoComplete="off"
                  required
                  pattern={employee.employee_code}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  className="import-input"
                />
              </label>
            )}
            {archive && confirmation !== employee.employee_code && (
              <p className="text-xs text-amber-200">
                La confirmación debe coincidir con el código completo.
              </p>
            )}
          </MutationForm>
          <Dialog.Close className="btn-ghost w-full mt-3">
            Cancelar
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export const SuspendEmployeeDialog = EmployeeLifecycleDialog;
export const ReactivateEmployeeDialog = EmployeeLifecycleDialog;
export const ArchiveEmployeeDialog = EmployeeLifecycleDialog;
