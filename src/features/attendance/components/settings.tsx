"use client";
import { useState } from "react";
import { Clock3, Timer, ShieldCheck, Globe2, Settings2 } from "lucide-react";
import type { AttendanceSettings } from "../types";
import MutationForm from "./mutation-form";
import { saveAttendanceSettings } from "../actions";
import type { LucideIcon } from "lucide-react";
import DangerZone from "./danger-zone";
export function AttendanceSettingsCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <article className="attendance-panel p-6">
      <Icon className="text-fuchsia-300 mb-4" size={23} aria-hidden="true" />
      <h3 className="text-sm text-slate-300">{title}</h3>
      <p className="text-2xl font-bold mt-2">{value}</p>
      <p className="text-xs text-slate-400 mt-3">{description}</p>
    </article>
  );
}
export default function Settings({
  settings,
}: {
  settings: AttendanceSettings;
}) {
  const [edit, setEdit] = useState(false);
  return (
    <section>
      <h2 className="text-xl font-bold mb-2">Configuración de asistencia</h2>
      <p className="text-sm text-slate-400 mb-6">
        Reglas del control del turno día. Cada empleado mantiene su tolerancia
        individual.
      </p>
      <div className="attendance-settings-grid">
        <AttendanceSettingsCard
          title="Hora límite de asistencia"
          value={`${settings.absence_cutoff_minutes} minutos`}
          description="Después de la hora de entrada programada."
          icon={Clock3}
        />
        <AttendanceSettingsCard
          title="Tolerancia inicial sugerida"
          value="5 minutos"
          description="Solo para nuevos empleados. Puede sobrescribirse en Personal."
          icon={Timer}
        />
        <AttendanceSettingsCard
          title="Política de suspensión"
          value="Manual"
          description="Solo un administrador, con motivo y auditoría."
          icon={ShieldCheck}
        />
        <AttendanceSettingsCard
          title="Zona horaria"
          value="America/Lima"
          description="Hora de Perú para marcación, fechas y reportes."
          icon={Globe2}
        />
      </div>
      <button
        className="btn-primary mt-6"
        onClick={() => setEdit(!edit)}
        aria-expanded={edit}
      >
        <Settings2 size={17} />
        {edit ? "Cerrar edición" : "Editar configuración"}
      </button>
      {edit && (
        <div className="attendance-panel p-6 max-w-xl mt-5">
          <MutationForm
            action={saveAttendanceSettings}
            onSuccess={() => setEdit(false)}
          >
            <label className="block">
              Hora límite después de la entrada (minutos)
              <input
                className="import-input"
                type="number"
                name="absence_cutoff_minutes"
                min={1}
                max={1440}
                required
                defaultValue={settings.absence_cutoff_minutes}
              />
            </label>
            <label className="block">
              Motivo obligatorio
              <textarea
                className="import-input"
                name="reason"
                minLength={3}
                maxLength={2000}
                required
              />
            </label>
            <p className="text-xs text-slate-400">
              El límite determina cuándo una entrada pendiente aparece como
              falta. No cambia tolerancias ni asistencias anteriores.
            </p>
          </MutationForm>
        </div>
      )}

      <DangerZone />
    </section>
  );
}
