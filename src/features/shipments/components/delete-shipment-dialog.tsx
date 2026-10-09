'use client';
import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/utils';
import { deleteShipmentAction, getShipmentDeleteSummary, type DeleteShipmentSummary } from '../admin-actions';

export default function DeleteShipmentDialog({ shipmentId }: { shipmentId: string }) {
  const [open, setOpen] = useState(false);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger className="btn-ghost p-2 text-slate-400 hover:text-red-300" title="Eliminar envío" aria-label="Eliminar envío"><Trash2 className="w-4 h-4" /></Dialog.Trigger>
    {open && <DeleteContent shipmentId={shipmentId} onClose={() => setOpen(false)} />}
  </Dialog.Root>;
}
function DeleteContent({ shipmentId, onClose }: { shipmentId: string; onClose: () => void }) {
  const router = useRouter();
  const [summary, setSummary] = useState<DeleteShipmentSummary | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const locked = useRef(false);
  useEffect(() => {
    let active = true;
    getShipmentDeleteSummary(shipmentId).then(result => {
      if (!active) return;
      if (result.error) setError(result.error);
      else if (result.summary) setSummary(result.summary);
    }).catch(() => { if (active) setError('No se pudo cargar el envío.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [shipmentId]);
  const canDelete = Boolean(summary && confirmation === summary.shipment.shipment_number && !busy);
  async function remove() {
    if (!canDelete || locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const result = await deleteShipmentAction(shipmentId, confirmation);
      if (!result.success) { setError(result.error || 'No se pudo eliminar.'); return; }
      router.refresh(); onClose();
    } catch { setError('No se pudo confirmar la eliminación. Actualiza el listado antes de reintentar.'); }
    finally { locked.current = false; setBusy(false); }
  }
  return <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80" />
    <Dialog.Content className="fixed inset-x-2 sm:inset-x-4 top-[3dvh] z-50 mx-auto max-w-lg max-h-[94dvh] overflow-y-auto card-base p-5 space-y-4 shadow-2xl"
      onEscapeKeyDown={event => { if (locked.current) event.preventDefault(); }}
      onPointerDownOutside={event => { if (locked.current) event.preventDefault(); }}>
      <div className="flex items-start justify-between gap-3"><Dialog.Title className="text-xl font-bold text-red-200 flex gap-2 items-center"><AlertTriangle className="w-6 h-6" />ELIMINAR ENVÍO</Dialog.Title>
        <Dialog.Close disabled={busy} className="btn-ghost p-2" aria-label="Cerrar modal"><X className="w-5 h-5" /></Dialog.Close></div>
      <Dialog.Description className="text-sm text-slate-300">Esta acción eliminará definitivamente este envío y toda su información.</Dialog.Description>
      {loading && <p role="status" className="flex gap-2 items-center"><Loader2 className="w-5 h-5 animate-spin" />Cargando resumen…</p>}
      {summary && <>
        <dl className="text-sm space-y-2 rounded-xl border border-purple-900 bg-purple-950/30 p-4">
          {[
            ['Número', summary.shipment.shipment_number], ['Fecha', formatDate(summary.shipment.shipment_date)],
            ['Productos', summary.itemsCount], ['Cajas', `${summary.shipment.total_received_boxes} / ${summary.shipment.total_expected_boxes}`],
            ['Eventos de recepción', summary.eventsCount], ['Incidencias/observaciones', summary.incidentsCount],
          ].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2"><dt className="text-slate-300">{label}</dt><dd className="font-semibold break-all">{value}</dd></div>)}
        </dl>
        {(summary.shipment.total_received_boxes > 0 || summary.eventsCount > 0) && <p className="text-amber-200 text-sm">Este envío contiene movimientos reales de recepción.</p>}
        {summary.shipment.status === 'completed' && <p className="text-amber-200 text-sm">Este envío ya fue finalizado.</p>}
        <label className="block text-sm text-slate-300">Escribe exactamente <strong className="text-white break-all">{summary.shipment.shipment_number}</strong> para confirmar:<input className="import-input font-mono" autoComplete="off" spellCheck={false} value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} /></label>
      </>}
      {error && <p role="alert" className="rounded-xl border border-red-800 bg-red-950/30 p-3 text-red-200 text-sm">{error}</p>}
      <div className="flex flex-col sm:flex-row justify-end gap-2"><Dialog.Close className="btn-ghost" disabled={busy}>Cancelar</Dialog.Close>
        <button className="btn-primary bg-red-700 hover:bg-red-600" disabled={!canDelete} onClick={() => void remove()}>{busy ? 'Eliminando…' : 'ELIMINAR DEFINITIVAMENTE'}</button></div>
    </Dialog.Content>
  </Dialog.Portal>;
}
