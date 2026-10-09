"use client";
import { useState } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import {
  MoreHorizontal,
  Pencil,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Archive,
} from "lucide-react";
import type { Employee } from "../types";
import { EmployeeDrawer } from "./employee-drawer";
import AccessDialog from "./access-dialog";
import { EmployeeLifecycleDialog } from "./employee-lifecycle-dialog";
export default function EmployeeActions({ employee }: { employee: Employee }) {
  const [dialog, setDialog] = useState<
    "edit" | "access" | "suspend" | "reactivate" | "archive" | null
  >(null);
  const access =
    employee.active && !employee.archived_at && Boolean(employee.email);
  return (
    <>
      <div className="flex gap-2 items-center">
        <button
          type="button"
          className="btn-ghost text-xs"
          disabled={!access}
          onClick={() => setDialog("access")}
        >
          {employee.profile_id ? "Gestionar acceso" : "Crear acceso"}
        </button>
        <Menu.Root>
          <Menu.Trigger asChild>
            <button
              className="btn-ghost !px-2"
              aria-label={`Acciones de ${employee.full_name}`}
            >
              <MoreHorizontal size={20} />
            </button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content
              className="attendance-menu"
              align="end"
              sideOffset={6}
            >
              <Menu.Item
                disabled={Boolean(employee.archived_at)}
                onSelect={() => setDialog("edit")}
              >
                <Pencil size={16} />
                Editar empleado
              </Menu.Item>
              {access && (
                <Menu.Item onSelect={() => setDialog("access")}>
                  <KeyRound size={16} />
                  {employee.profile_id ? "Gestionar acceso" : "Crear acceso"}
                </Menu.Item>
              )}
              {!employee.archived_at &&
                (employee.active ? (
                  <Menu.Item onSelect={() => setDialog("suspend")}>
                    <ShieldAlert size={16} />
                    Suspender empleado
                  </Menu.Item>
                ) : (
                  <Menu.Item onSelect={() => setDialog("reactivate")}>
                    <ShieldCheck size={16} />
                    Reactivar empleado
                  </Menu.Item>
                ))}
              {!employee.archived_at && (
                <Menu.Item onSelect={() => setDialog("archive")}>
                  <Archive size={16} />
                  Eliminar / archivar
                </Menu.Item>
              )}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      </div>
      <EmployeeDrawer
        employee={employee}
        open={dialog === "edit"}
        onOpenChange={(v) => {
          if (!v) setDialog(null);
        }}
      />
      {dialog === "access" && (
        <AccessDialog employee={employee} onClose={() => setDialog(null)} />
      )}{" "}
      {(dialog === "suspend" ||
        dialog === "reactivate" ||
        dialog === "archive") && (
        <EmployeeLifecycleDialog
          employee={employee}
          action={dialog}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
