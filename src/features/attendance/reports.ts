import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  attendanceRows,
  attendanceSummary,
  limaTime,
  STATUS,
  ROW_STATUS,
  shiftLabel,
} from "./domain";
import type { AttendanceData, AttendanceRow } from "./types";
import { cityLogo } from "@/lib/reports/city-logo";
function detail(row: AttendanceRow) {
  return {
    Código: row.employee.employee_code,
    Nombre: row.employee.full_name,
    Cargo: row.employee.position,
    Fecha: row.schedule.work_date,
    Turno: shiftLabel(row.schedule.shift),
    "Tolerancia aplicada":
      row.record?.tolerance_minutes_applied ?? "Sin registro",
    Horario: row.schedule.is_day_off
      ? "DESCANSO"
      : (row.schedule.scheduled_time?.slice(0, 5) ?? ""),
    Entrada: limaTime(row.record?.check_in_at ?? null),
    Estado: ROW_STATUS[row.status].label,
    "Minutos tarde": row.minutesLate,
    Observación: row.record?.notes ?? "",
    Cierre: row.record
      ? "Registrado"
      : row.status === "absent"
        ? "Hora límite superada"
        : row.schedule.is_day_off
          ? "Descanso programado"
          : "Pendiente",
  };
}
export function attendanceExcel(data: AttendanceData, responsible: string) {
  const rows = attendanceRows(data).filter((r) => r.schedule.shift === "day"),
    summary = attendanceSummary(rows),
    wb = XLSX.utils.book_new();
  const overview = [
    ["CITY OFERTAS CHIMBOTE · CONTROL DE ASISTENCIA"],
    ["Período", data.from, data.to],
    ["Responsable", responsible],
    [
      "Emitido (Perú)",
      new Intl.DateTimeFormat("es-PE", {
        timeZone: "America/Lima",
        dateStyle: "short",
        timeStyle: "medium",
      }).format(new Date(data.serverNow)),
    ],
    ["Días programados", summary.scheduled],
    ["Asistencias", summary.attended],
    ...Object.entries(STATUS).map(([key, value]) => [
      value.label,
      summary[key as keyof typeof STATUS],
    ]),
    [],
    [
      "Código",
      "Nombre",
      "Programados",
      "Asistencias",
      "Puntuales",
      "Tardanzas",
      "Faltas",
      "Descansos",
      "Justificados",
    ],
  ];
  for (const employee of data.employees) {
    const s = attendanceSummary(
      rows.filter((r) => r.employee.id === employee.id),
    );
    overview.push([
      employee.employee_code,
      employee.full_name,
      s.scheduled,
      s.attended,
      s.on_time,
      s.late,
      s.absent,
      s.day_off,
      s.justified,
    ]);
  }
  const sheet = XLSX.utils.aoa_to_sheet(overview);
  sheet["!cols"] = [
    { wch: 28 },
    { wch: 36 },
    ...Array.from({ length: 7 }, () => ({ wch: 16 })),
  ];
  XLSX.utils.book_append_sheet(wb, sheet, "Resumen");
  for (const [name, filtered] of [
    ["Detalle", rows],
    ["Tardanzas", rows.filter((r) => r.status === "late")],
    ["Faltas", rows.filter((r) => r.status === "absent")],
    ["Descansos", rows.filter((r) => r.status === "day_off")],
    ["Justificaciones", rows.filter((r) => r.status === "justified")],
  ] as [string, AttendanceRow[]][]) {
    const sheet = XLSX.utils.json_to_sheet(filtered.map(detail), {
      header: [
        "Código",
        "Nombre",
        "Cargo",
        "Fecha",
        "Turno",
        "Tolerancia aplicada",
        "Horario",
        "Entrada",
        "Estado",
        "Minutos tarde",
        "Observación",
        "Cierre",
      ],
    });
    sheet["!cols"] = [
      { wch: 12 },
      { wch: 30 },
      { wch: 25 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 16 },
      { wch: 14 },
      { wch: 50 },
      { wch: 28 },
    ];
    if (filtered.length) sheet["!autofilter"] = { ref: sheet["!ref"]! };
    XLSX.utils.book_append_sheet(wb, sheet, name);
  }
  const nightRows = attendanceRows(data).filter(
    (r) => r.schedule.shift === "night",
  );
  if (nightRows.length) {
    const info = XLSX.utils.json_to_sheet(
      nightRows.map((r) => ({
        Código: r.employee.employee_code,
        Nombre: r.employee.full_name,
        Fecha: r.schedule.work_date,
        Turno: "Turno noche",
        Horario: r.schedule.is_day_off
          ? "DESCANSO"
          : r.schedule.scheduled_time?.slice(0, 5),
        Información: "Sin control de asistencia",
      })),
    );
    info["!cols"] = [
      { wch: 14 },
      { wch: 32 },
      { wch: 14 },
      { wch: 18 },
      { wch: 14 },
      { wch: 32 },
    ];
    XLSX.utils.book_append_sheet(wb, info, "Horario noche");
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
export function attendancePdf(data: AttendanceData, responsible: string) {
  const doc = new jsPDF({ orientation: "landscape" }),
    rows = attendanceRows(data).filter((r) => r.schedule.shift === "day"),
    summary = attendanceSummary(rows);
  doc.addImage(cityLogo, "PNG", 14, 10, 38, 21);
  doc.setFontSize(17);
  doc.setTextColor(91, 33, 182);
  doc.text("ASISTENCIA CITY OFERTAS CHIMBOTE", 60, 18);
  doc.setFontSize(10);
  doc.setTextColor(50);
  doc.text(`${data.from} — ${data.to}`, 60, 26);
  if (data.employees.length === 1) {
    doc.setFontSize(9);
    doc.text(`Empleado: ${data.employees[0].full_name}`, 60, 32);
  }
  autoTable(doc, {
    startY: 37,
    head: [
      [
        "Programados",
        "Asistencias",
        "Puntuales",
        "Tardanzas",
        "Faltas",
        "Descansos",
        "Justificados",
        "Pendientes",
      ],
    ],
    body: [
      [
        summary.scheduled,
        summary.attended,
        summary.on_time,
        summary.late,
        summary.absent,
        summary.day_off,
        summary.justified,
        summary.pending,
      ],
    ],
    theme: "grid",
    styles: { fontSize: 9 },
    headStyles: { fillColor: [91, 33, 182] },
  });
  const y =
    (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 9;
  autoTable(doc, {
    startY: y,
    head: [
      [
        "Nombre / Código",
        "Cargo",
        "Fecha",
        "Horario",
        "Entrada",
        "Estado",
        "Min. tarde",
        "Observación",
      ],
    ],
    body: rows.map((r) => [
      `${r.employee.full_name}\n${r.employee.employee_code}`,
      r.employee.position,
      `${r.schedule.work_date}\n${shiftLabel(r.schedule.shift)}`,
      r.schedule.is_day_off
        ? "DESCANSO"
        : (r.schedule.scheduled_time?.slice(0, 5) ?? ""),
      limaTime(r.record?.check_in_at ?? null),
      ROW_STATUS[r.status].label,
      `${r.minutesLate}\nTol.: ${r.record?.tolerance_minutes_applied ?? "—"}`,
      `${r.record?.notes ?? ""}${r.status === "absent" && !r.record ? " (hora límite superada)" : ""}`,
    ]),
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [91, 33, 182] },
    alternateRowStyles: { fillColor: [250, 245, 255] },
    rowPageBreak: "avoid",
    margin: { bottom: 20 },
    columnStyles: {
      0: { cellWidth: 43 },
      1: { cellWidth: 34 },
      2: { cellWidth: 23 },
      3: { cellWidth: 20 },
      4: { cellWidth: 20 },
      5: { cellWidth: 25 },
      6: { cellWidth: 17 },
      7: { cellWidth: "auto" },
    },
  });
  const nightRows = attendanceRows(data).filter(
    (r) => r.schedule.shift === "night",
  );
  if (nightRows.length)
    autoTable(doc, {
      startY:
        (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
          .finalY + 10,
      head: [
        [
          "Turno noche · Horarios informativos",
          "Fecha",
          "Horario",
          "Información",
        ],
      ],
      body: nightRows.map((r) => [
        `${r.employee.full_name} · ${r.employee.employee_code}`,
        r.schedule.work_date,
        r.schedule.is_day_off
          ? "DESCANSO"
          : (r.schedule.scheduled_time?.slice(0, 5) ?? ""),
        "Sin control de asistencia",
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [91, 33, 182] },
      margin: { bottom: 20 },
      rowPageBreak: "avoid",
    });
  const generated = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(data.serverNow));
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text(
      doc.splitTextToSize(
        `Responsable: ${responsible} · Emitido: ${generated} (Perú)`,
        230,
      ),
      14,
      doc.internal.pageSize.getHeight() - 12,
    );
    doc.text(
      `${page}/${doc.getNumberOfPages()}`,
      doc.internal.pageSize.getWidth() - 22,
      doc.internal.pageSize.getHeight() - 12,
    );
  }
  return doc.output("arraybuffer");
}
