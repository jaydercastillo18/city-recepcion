"use client";
// ============================================================
// CITY RECEPCIÓN - LogoutMenuItem
// Componente cliente que llama a logoutAction directamente
// desde startTransition, evitando el bug de Radix DropdownMenu
// donde el <form> dentro de Menu.Content se desmonta antes de
// que el submit nativo del formulario termine:
//   "Form submission canceled because the form is not connected"
// ============================================================
import { useTransition } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/features/auth/actions";

export default function LogoutMenuItem() {
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      await logoutAction();
    });
  }

  return (
    <Menu.Item
      id="btn-logout"
      disabled={isPending}
      onSelect={(event) => {
        // Evitar que Radix cierre el menú y desmonte el DOM
        // antes de que la Server Action termine.
        event.preventDefault();
        handleLogout();
      }}
      className="flex gap-2 w-full p-3 rounded-lg text-sm text-rose-300 outline-none cursor-pointer data-[highlighted]:bg-purple-500/20 data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed"
    >
      <LogOut size={16} aria-hidden="true" />
      {isPending ? "Cerrando sesión…" : "Cerrar sesión"}
    </Menu.Item>
  );
}
