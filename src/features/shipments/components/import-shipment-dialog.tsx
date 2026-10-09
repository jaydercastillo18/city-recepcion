'use client';

import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import Link from 'next/link';
import { CheckCircle2, FileSpreadsheet, Loader2, Plus, Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { suggestShipmentNumber, validShipmentDate } from '../import/format';
import { IMPORT_DESTINATION } from '../import/config';
import type { ImportPreview, ImportResult } from '../import/types';

export default function ImportShipmentDialog() {
  const [open, setOpen] = useState(false);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger id="btn-new-shipment" className="btn-primary text-sm px-4"><Plus className="w-4 h-4" />Nuevo envío</Dialog.Trigger>
    {open && <ImportSession onClose={() => setOpen(false)} />}
  </Dialog.Root>;
}

function newRequestId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function ImportSession({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const destination = IMPORT_DESTINATION;
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [page, setPage] = useState(0);
  const requestId = useRef('');
  const locked = useRef(false);
  const shipmentNumber = suggestShipmentNumber(destination, date);
  const canConfirm = preview && !preview.errors.length && preview.productCount > 0
    && validShipmentDate(date) && shipmentNumber && !busy;

  async function readPreview(selected: File, sheetName?: string) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setPreview(null); setPage(0);
    if (!sheetName) { setDate(''); requestId.current = newRequestId(); }
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(selected.name) || selected.size > 5 * 1024 * 1024) throw new Error('Selecciona .xlsx, .xls o .csv de hasta 5 MB. PDF no está disponible.');
      const form = new FormData(); form.set('file', selected); if (sheetName) form.set('sheetName', sheetName);
      const response = await fetch('/api/shipments/import/preview', { method: 'POST', body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudo generar la vista previa.');
      const parsed: ImportPreview = body.preview;
      setPreview(parsed);
      if (parsed.detectedDate) setDate(parsed.detectedDate);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo leer el archivo.'); }
    finally { locked.current = false; setBusy(false); }
  }

  async function confirm() {
    if (!canConfirm || !file || !preview || locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const form = new FormData();
      form.set('file', file); form.set('sheetName', preview.sheetName); form.set('fingerprint', preview.fingerprint);
      form.set('destination', destination.trim()); form.set('shipmentDate', date); form.set('shipmentNumber', shipmentNumber);
      form.set('requestId', requestId.current); form.set('confirmed', 'true');
      const response = await fetch('/api/shipments/import/confirm', { method: 'POST', body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudo importar.');
      setResult(body.result); router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo confirmar el resultado. Puedes reintentar con esta misma vista previa sin duplicar el envío.');
    } finally { locked.current = false; setBusy(false); }
  }

  return <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/75" />
    <Dialog.Content onEscapeKeyDown={event => { if (locked.current) event.preventDefault(); }}
      onPointerDownOutside={event => { if (locked.current) event.preventDefault(); }}
      className="fixed inset-x-2 sm:inset-x-4 top-[3dvh] z-50 mx-auto max-w-5xl max-h-[94dvh] flex flex-col card-base shadow-2xl">
      <div className="p-4 sm:p-5 border-b border-purple-900 flex items-start justify-between gap-4">
        <div><Dialog.Title className="text-lg sm:text-xl font-bold flex items-center gap-2"><FileSpreadsheet className="w-6 h-6 text-fuchsia-300" />Subir Excel de envío</Dialog.Title>
          <Dialog.Description className="text-sm text-slate-300 mt-1">Cada archivo crea un envío independiente. Revisa los productos antes de confirmar.</Dialog.Description></div>
        <Dialog.Close disabled={busy} aria-label="Cerrar importación" className="btn-ghost p-2"><X className="w-5 h-5" /></Dialog.Close>
      </div>
      <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
        {result ? <div className="text-center py-8 space-y-4">
          <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
          <h2 className="text-xl font-bold">Envío creado</h2><p className="font-mono text-fuchsia-200 break-all">{result.shipment_number}</p>
          <p className="text-slate-300">{result.item_count} productos · {result.total_boxes} cajas enviadas · Recibidas: 0</p>
          <Link className="btn-primary" href={`/recepcion/${result.shipment_id}`} onClick={onClose}>Empezar recepción</Link>
        </div> : <>
          <label className="block rounded-xl border border-dashed border-fuchsia-700 bg-purple-950/30 p-4 space-y-2">
            <span className="font-semibold flex items-center gap-2"><Upload className="w-5 h-5 text-fuchsia-300" />Archivo Excel o CSV</span>
            <input aria-label="Archivo Excel o CSV" type="file" accept=".xlsx,.xls,.csv" disabled={busy}
              className="w-full text-sm text-slate-300 file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:px-3 file:bg-purple-700 file:text-white"
              onChange={event => { const selected = event.target.files?.[0] ?? null; setFile(selected); setPreview(null); setError(''); if (selected) void readPreview(selected); }} />
            <p className="text-xs text-slate-400">.xlsx, .xls, .csv · Hasta 5 MB · Se usa CAJAS ENVIADAS · No se acepta PDF</p>
          </label>
          {busy && <p role="status" className="flex items-center gap-2 text-fuchsia-200"><Loader2 className="w-5 h-5 animate-spin" />{preview ? 'Importando envío…' : 'Leyendo archivo…'}</p>}
          {preview && <>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="space-y-1 text-sm text-slate-300">Hoja a importar<select className="import-input" value={preview.sheetName} disabled={busy} onChange={event => { if (file) void readPreview(file, event.target.value); }}>
                {preview.sheets.map(sheet => <option key={sheet.name} value={sheet.name} disabled={!sheet.importable}>{sheet.name}{!sheet.importable ? ' (sin columnas requeridas)' : ''}</option>)}
              </select></label>
              <label className="space-y-1 text-sm text-slate-300">Destino<input className="import-input" value={destination} readOnly /></label>
              <label className="space-y-1 text-sm text-slate-300">Fecha de envío<input className="import-input" type="date" min="1900-01-01" max="2100-12-31" value={date} disabled={busy} onChange={event => setDate(event.target.value)} /></label>
              <label className="space-y-1 text-sm text-slate-300">Número del envío<input className="import-input" value={shipmentNumber} readOnly placeholder="Selecciona la fecha de envío" /></label>
            </div>
            <p className="text-sm text-slate-300 break-words">Nuevo envío: <strong className="text-fuchsia-200">{shipmentNumber || 'Completa la fecha'}</strong>. Si el número existe, se añade un sufijo sin reemplazarlo.</p>
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-purple-950/40 border border-purple-800 p-3 text-center">
              <div><p className="text-xl font-bold">{preview.rowsDetected}</p><p className="text-xs text-slate-300">Filas detectadas</p></div>
              <div><p className="text-xl font-bold">{preview.productCount}</p><p className="text-xs text-slate-300">Productos a importar</p></div>
              <div><p className="text-xl font-bold text-fuchsia-200">{preview.totalBoxes}</p><p className="text-xs text-slate-300">Cajas enviadas</p></div>
            </div>
            <details className="text-sm text-slate-300"><summary className="cursor-pointer min-h-11">Columnas detectadas · Encabezado en fila {preview.headerRow}</summary>
              <p>{preview.columns.map(column => column.header).join(' · ')}</p>
            </details>
            {preview.warnings.length > 0 && <div className="rounded-xl border border-amber-800 bg-amber-950/25 p-3"><h3 className="text-amber-200 font-semibold mb-2">Advertencias</h3>
              <ul className="text-sm text-amber-100 space-y-2">{preview.warnings.map(warning => <li key={warning.code}>{warning.message} {warning.count > 1 && `(${warning.count})`} {warning.rows.length > 0 && <span className="text-amber-200/80">Filas: {warning.rows.join(', ')}</span>}</li>)}</ul>
            </div>}
            {preview.errors.length > 0 && <div role="alert" className="rounded-xl border border-red-800 bg-red-950/30 p-3"><h3 className="text-red-200 font-semibold">Corrige el archivo antes de importar</h3><ul className="text-sm text-red-200 space-y-1 mt-2">{preview.errors.map((message, index) => <li key={index}>{message}</li>)}</ul></div>}
            <div className="overflow-x-auto rounded-xl border border-purple-900">
              <table className="w-full min-w-[650px] text-sm text-left"><caption className="sr-only">Vista previa de productos del envío</caption>
                <thead className="bg-purple-950 text-purple-100"><tr>{['Fila(s)', 'Proveedor', 'Código', 'Producto', 'Cajas enviadas', 'Validación'].map(label => <th key={label} className="p-3" scope="col">{label}</th>)}</tr></thead>
                <tbody>{preview.rows.slice(page * 50, (page + 1) * 50).map((row, index) => <tr key={`${page}-${index}`} className="border-t border-purple-950">
                  <td className="p-3 text-slate-400">{row.sourceRows.join(', ')}</td><td className="p-3">{row.supplier || '—'}</td><td className="p-3 font-mono whitespace-pre-wrap">{row.code_original || '(vacío)'}</td><td className="p-3 min-w-40">{row.product_name || '(sin nombre)'}</td><td className="p-3 font-bold tabular-nums">{row.expected_boxes}</td>
                  <td className={`p-3 ${row.validation === 'error' ? 'text-red-300' : row.validation === 'ready' ? 'text-emerald-300' : 'text-amber-200'}`}>{row.messages.join(' · ') || 'Listo para importar'}</td>
                </tr>)}</tbody>
              </table>
            </div>
            {preview.rows.length > 50 && <div className="flex justify-between items-center gap-2 text-sm"><button className="btn-ghost px-3" disabled={page === 0 || busy} onClick={() => setPage(page - 1)}>Anterior</button><span>{page + 1} / {Math.ceil(preview.rows.length / 50)}</span><button className="btn-ghost px-3" disabled={(page + 1) * 50 >= preview.rows.length || busy} onClick={() => setPage(page + 1)}>Siguiente</button></div>}
          </>}
        </>}
        {error && <p role="alert" className="p-3 rounded-xl border border-red-800 bg-red-950/30 text-red-200 text-sm">{error}</p>}
      </div>
      <div className="p-4 border-t border-purple-900 flex flex-col sm:flex-row justify-end gap-2">
        <Dialog.Close disabled={busy} className="btn-ghost">{result ? 'Cerrar' : 'Cancelar'}</Dialog.Close>
        {!result && <button className="btn-primary" disabled={!canConfirm} onClick={() => void confirm()}>{busy && preview ? 'Importando…' : 'Confirmar importación'}</button>}
      </div>
    </Dialog.Content>
  </Dialog.Portal>;
}
