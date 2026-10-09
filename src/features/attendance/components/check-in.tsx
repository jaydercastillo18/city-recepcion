"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
export default function CheckIn({
  disabled,
  explanation,
  scheduleId,
}: {
  disabled: boolean;
  explanation?: string;
  scheduleId?: string;
}) {
  const [photo, setPhoto] = useState<Blob | null>(null),
    [preview, setPreview] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    lock = useRef(false),
    router = useRouter();
  async function choose(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy(true);
    setPhoto(null);
    try {
      if (file.size > 20_000_000)
        throw new Error("La foto es demasiado grande. Toma otra foto.");
      const bitmap = await createImageBitmap(file),
        scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) {
        bitmap.close();
        throw new Error("No se pudo preparar la imagen.");
      }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.8),
      );
      if (!blob || blob.size > 2_097_152)
        throw new Error("Toma una foto más pequeña.");
      if (preview) URL.revokeObjectURL(preview);
      setPhoto(blob);
      setPreview(URL.createObjectURL(blob));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "No se pudo preparar la foto.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!photo || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      if (scheduleId) form.set("schedule_id", scheduleId);
      form.set("photo", photo, "entrada.jpg");
      const response = await fetch("/api/asistencia/check-in", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo registrar.");
      URL.revokeObjectURL(preview);
      setPreview("");
      setPhoto(null);
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No se pudo registrar la entrada.",
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <div className="space-y-4">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="user"
        className="sr-only"
        aria-label="Tomar o subir foto de entrada"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void choose(file);
        }}
        disabled={disabled || busy}
      />
      <button
        className="btn-primary w-full min-h-16"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
      >
        {busy ? "Procesando…" : "📷 Tomar foto y marcar entrada"}
      </button>
      {explanation && <p className="text-sm text-slate-400">{explanation}</p>}
      {photo && preview && (
        <div className="card-base p-4 space-y-3">
          <Image
            unoptimized
            width={1280}
            height={960}
            src={preview}
            alt="Vista previa de tu foto de entrada"
            className="w-full max-h-80 object-contain rounded-lg"
          />
          <p className="text-sm text-slate-400">
            La hora se registrará al confirmar, usando el reloj del servidor.
          </p>
          <button
            onClick={() => void confirm()}
            disabled={busy || disabled}
            className="btn-primary w-full"
          >
            Confirmar entrada
          </button>
          <button
            className="btn-ghost w-full"
            disabled={busy}
            onClick={() => {
              URL.revokeObjectURL(preview);
              setPreview("");
              setPhoto(null);
            }}
          >
            Descartar foto
          </button>
        </div>
      )}
      {error && (
        <p className="text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
