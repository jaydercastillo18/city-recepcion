'use client';
import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getShipmentFinalizeSummary, finalizeShipmentAction, type FinalizeSummary } from '@/features/shipments/actions';

interface Props {
  shipmentId: string; shipmentNumber: string; destination: string;
  isOpen: boolean; onClose: () => void; onSuccess?: () => void;
}
export default function FinalizeShipmentModal(props: Props) {
  return <Dialog.Root open={props.isOpen} onOpenChange={open => { if (!open) props.onClose(); }}>
    {props.isOpen && <FinalizeContent {...props} />}
  </Dialog.Root>;
}
function FinalizeContent({ shipmentId, shipmentNumber, destination, onClose, onSuccess }: Props) {
  const router = useRouter();
  const [summary, setSummary] = useState<FinalizeSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [notes, setNotes] = useState('');
  const locked = useRef(false);
  const hasShortage = Boolean(summary && summary.missingBoxes > 0);
  useEffect(() => {
    let active = true;
    getShipmentFinalizeSummary(shipmentId).then(result => {
      if (!active) return;
      if (result.error) setError(result.error);
      else if (result.summary) setSummary(result.summary);
    }).catch(() => { if (active) setError('No se pudo cargar el resumen del envío.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [shipmentId]);
  async function finalize() {
    if (!summary?.canFinalize || (hasShortage && !accepted) || locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const result = await finalizeShipmentAction(shipmentId, hasShortage && accepted, notes);
      if (!result.success) {
        setError(result.error || 'No se pudo finalizar.');
        // Re-read after a failure; never confirm newly detected shortages silently.
        const fresh = await getShipmentFinalizeSummary(shipmentId);
        if (fresh.summary) setSummary(fresh.summary);
        setAccepted(false); return;
      }
      router.refresh(); onSuccess?.(); onClose();
    } catch { setError('No se pudo confirmar el cierre. Puedes reintentar.'); }
    finally { locked.current = false; setBusy(false); }
  }
  return <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80" />
    <Dialog.Content className="fixed inset-x-2 sm:inset-x-4 top-[3dvh] z-50 mx-auto max-w-lg max-h-[94dvh] overflow-y-auto card-base p-5 space-y-4 shadow-2xl"
      onEscapeKeyDown={event => { if (locked.current) event.preventDefault(); }}
      onPointerDownOutside={event => { if (locked.current) event.preventDefault(); }}>
      <div className="flex justify-between gap-3 items-start"><div><Dialog.Title className="text-xl font-bold">Finalizar recepción</Dialog.Title>
        <Dialog.Description className="text-sm text-slate-300 break-all">{shipmentNumber} · {destination}</Dialog.Description></div>
        <Dialog.Close disabled={busy} className="btn-ghost p-2" aria-label="Cerrar modal"><X className="w-5 h-5" /></Dialog.Close></div>
      {loading && <p role="status" className="flex items-center gap-2 text-slate-300"><Loader2 className="w-5 h-5 animate-spin" />Cargando resumen…</p>}
      {summary && <>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {[
            ['Cajas esperadas', summary.expectedBoxes], ['Cajas recibidas', summary.receivedBoxes],
            ['Cajas faltantes', summary.missingBoxes], ['Productos pendientes', summary.pendingCount],
            ['Productos parciales', summary.partialCount], ['Incidencias/observaciones', summary.incidentsCount],
            ['Productos completos', summary.completeCount], ['Cajas extras', summary.extraBoxes],
          ].map(([label, value]) => <div key={label} className="rounded-xl bg-purple-950/30 border border-purple-900 p-3"><dt className="text-slate-300">{label}</dt><dd className="text-xl font-bold tabular-nums">{value}</dd></div>)}
        </dl>
        {hasShortage ? <div className="rounded-xl border border-amber-700 bg-amber-950/40 p-4 space-y-3">
          <h3 className="font-bold text-amber-200 flex items-center gap-2"><AlertTriangle className="w-5 h-5" />FINALIZAR CON FALTANTES</h3>
          <p className="text-sm text-amber-100">Si finalizas ahora, estas diferencias quedarán registradas en el reporte final. Las cantidades se conservarán: {summary.receivedBoxes} / {summary.expectedBoxes} cajas.</p>
          <label className="flex items-start gap-3 text-sm text-amber-100 min-h-11 cursor-pointer"><input type="checkbox" className="w-5 h-5 mt-1 accent-fuchsia-500" checked={accepted} disabled={busy} onChange={event => setAccepted(event.target.checked)} />
            <span>Entiendo que existen cajas faltantes y quiero cerrar el envío.</span></label>
        </div> : <p className="rounded-xl border border-emerald-700 bg-emerald-950/30 p-4 text-emerald-200 flex items-center gap-2"><CheckCircle2 className="w-5 h-5" />Recepción completa</p>}
        <label className="block text-sm text-slate-300">Motivo del cierre (opcional{hasShortage ? ', recomendado' : ''})<textarea className="import-input min-h-24" value={notes} maxLength={2000} disabled={busy} onChange={event => setNotes(event.target.value)} placeholder="Ej. Mercadería no enviada por Lima; diferencia autorizada por jefe; cierre administrativo" /></label>
        {!summary.canFinalize && <p role="alert" className="text-red-300">El envío no contiene productos para finalizar.</p>}
      </>}
      {error && <p role="alert" className="rounded-xl border border-red-800 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}
      <div className="flex flex-col sm:flex-row justify-end gap-2"><Dialog.Close className="btn-ghost" disabled={busy}>Cancelar</Dialog.Close>
        <button className="btn-primary" disabled={loading || busy || !summary?.canFinalize || (hasShortage && !accepted)} onClick={() => void finalize()}>{busy ? 'Finalizando…' : hasShortage ? 'FINALIZAR CON FALTANTES' : 'Confirmar y finalizar'}</button></div>
    </Dialog.Content>
  </Dialog.Portal>;
}
