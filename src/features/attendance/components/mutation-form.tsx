"use client";
import { useState, useTransition } from "react";
import { toast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
export default function MutationForm({
  action,
  children,
  button = "Guardar",
  onSuccess,
  submitDisabled = false,
}: {
  action: (form: FormData) => Promise<{ error?: string; success?: boolean }>;
  children: React.ReactNode;
  button?: string;
  onSuccess?: () => void;
  submitDisabled?: boolean;
}) {
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(false),
    [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const form = new FormData(event.currentTarget);
        setError("");
        setSuccess(false);
        start(async () => {
          try {
            const result = await action(form);
            if (result.error) setError(result.error);
            else {
              setSuccess(true);
              toast({
                title: "Cambio guardado",
                description: "La operación se completó correctamente.",
              });
              router.refresh();
              onSuccess?.();
            }
          } catch {
            setError("No se pudo guardar. Vuelve a intentar.");
          }
        });
      }}
    >
      <fieldset disabled={pending} className="space-y-4">
        {children}
        <button
          className="btn-primary w-full"
          type="submit"
          disabled={submitDisabled || pending}
        >
          {pending ? "Guardando…" : button}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-emerald-300">
          Guardado correctamente.
        </p>
      )}
    </form>
  );
}
