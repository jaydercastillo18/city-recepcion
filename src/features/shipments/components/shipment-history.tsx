'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Truck, ChevronRight, CheckCircle2, Clock, XCircle, Edit, AlertTriangle } from 'lucide-react';
import DeleteShipmentDialog from './delete-shipment-dialog';
import ShipmentReportButtons from '@/features/reception/components/shipment-report-buttons';
import { formatDate, calcProgress, formatPercent, getShipmentStatusLabel, cn } from '@/lib/utils';
import { normalizeHeader } from '../import/format';
import type { Shipment, ShipmentStatus } from '@/types';

const statusIcons: Record<ShipmentStatus, React.ReactNode> = {
  draft: <Edit className="w-4 h-4 text-slate-400" aria-hidden="true" />,
  receiving: <Clock className="w-4 h-4 text-blue-400" aria-hidden="true" />,
  completed: <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />,
  cancelled: <XCircle className="w-4 h-4 text-red-400" aria-hidden="true" />,
};

const statusClasses: Record<ShipmentStatus, string> = {
  draft: 'bg-slate-800 text-slate-300 border-slate-700',
  receiving: 'bg-blue-900/60 text-blue-300 border-blue-700/50',
  completed: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/50',
  cancelled: 'bg-red-900/60 text-red-300 border-red-700/50',
};

function ShipmentRow({ shipment }: { shipment: Shipment }) {
  const progress = calcProgress(
    shipment.total_received_boxes,
    shipment.total_expected_boxes
  );
  const status = shipment.status as ShipmentStatus;
  const closedWithShortage = status === 'completed' && shipment.finalized_with_shortage;

  return (
    <div className="card-base p-4 hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
      <Link
        href={`/recepcion/${shipment.id}`}
        className="flex flex-wrap sm:flex-nowrap items-center gap-4 flex-1 min-w-0 group"
      >
        {/* Status icon */}
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center">
          {closedWithShortage ? <AlertTriangle className="w-4 h-4 text-amber-300" /> : statusIcons[status]}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2 mb-0.5">
            <span className="font-mono text-xs text-slate-400 break-all">
              {shipment.shipment_number}
            </span>
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full border font-medium',
                closedWithShortage ? 'bg-amber-950/60 text-amber-200 border-amber-700/50' : statusClasses[status]
              )}
            >
              {closedWithShortage ? `Cerrado con ${shipment.missing_boxes_at_finalization ?? 0} faltantes` : getShipmentStatusLabel(status)}
            </span>
          </div>
          <p className="font-semibold text-white truncate group-hover:text-blue-300 transition-colors">
            {shipment.destination}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {formatDate(shipment.shipment_date)}
            {shipment.source_file_name && <span className="block break-all mt-1">Archivo: {shipment.source_file_name}</span>}
          </p>
        </div>

        {/* Progress */}
        <div className="w-full sm:w-auto flex-shrink-0 text-left sm:text-right pl-14 sm:pl-0">
          <p className="text-sm font-bold text-white tabular-nums">
            {shipment.total_received_boxes} / {shipment.total_expected_boxes} cajas
          </p>
          <p
            className={cn(
              'text-xs font-medium tabular-nums',
              progress >= 100 ? 'text-emerald-400' : 'text-slate-400'
            )}
          >
            {formatPercent(progress)}
          </p>
          {/* Mini barra */}
          <div className="progress-bar mt-1 w-20" style={{ height: '4px' }}>
            <div
              className="progress-bar-fill"
              style={{ width: `${Math.min(progress, 100)}%`, height: '4px' }}
            />
          </div>
        </div>
      </Link>

      {/* Acciones para el envío (PDF, Excel, Finalizar) */}
      <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800 flex-shrink-0">
        <ShipmentReportButtons
          shipmentId={shipment.id}
          shipmentNumber={shipment.shipment_number}
          destination={shipment.destination}
          status={shipment.status}
          isAdmin={true}
          variant="compact"
        />
        <DeleteShipmentDialog shipmentId={shipment.id} />

        <Link
          href={`/recepcion/${shipment.id}`}
          className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
          title="Ver recepción"
          aria-label={`Abrir recepción de ${shipment.shipment_number}`}
        >
          <ChevronRight className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

export default function ShipmentHistory({ shipments }: { shipments: Shipment[] }) {
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('');
  const [destination, setDestination] = useState('');
  const destinations = useMemo(() => [...new Set(shipments.map(shipment => shipment.destination))].sort((a, b) => a.localeCompare(b, 'es')), [shipments]);
  const filtered = useMemo(() => shipments.filter(shipment => {
    const [year, month, day] = shipment.shipment_date.split('-');
    const search = normalizeHeader([shipment.shipment_number, shipment.destination, shipment.shipment_date, formatDate(shipment.shipment_date), day + '/' + month + '/' + year].join(' '));
    return (status === 'all' || shipment.status === status) && (!date || shipment.shipment_date === date)
      && (!destination || shipment.destination === destination) && search.includes(normalizeHeader(query));
  }), [shipments, status, query, date, destination]);
  const months = useMemo(() => {
    const groups = new Map<string, Shipment[]>();
    for (const shipment of filtered) {
      const month = shipment.shipment_date.slice(0, 7);
      groups.set(month, [...(groups.get(month) ?? []), shipment]);
    }
    return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);
  return <div className="space-y-5">
    <section className="card-base p-4 space-y-3" aria-label="Filtros del histórico">
      <label className="block text-sm text-slate-300">Buscar envío<input className="import-input" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Número, destino o fecha" /></label>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Estado del envío">
        {[['all', 'Todos'], ['receiving', 'En recepción'], ['completed', 'Completados'], ['draft', 'Borradores'], ['cancelled', 'Cancelados']].map(([value, label]) => <button key={value} className={status === value ? 'btn-primary px-3 text-sm' : 'btn-ghost px-3 text-sm'} aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>)}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm text-slate-300">Por fecha<input className="import-input" type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
        <label className="text-sm text-slate-300">Por destino<select className="import-input" value={destination} onChange={event => setDestination(event.target.value)}><option value="">Todos los destinos</option>{destinations.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
      </div>
      <div className="flex items-center justify-between gap-2"><p role="status" className="text-sm text-slate-400">{filtered.length} de {shipments.length} envíos</p><button className="btn-ghost text-sm px-3" onClick={() => { setStatus('all'); setQuery(''); setDate(''); setDestination(''); }}>Limpiar filtros</button></div>
    </section>
    {months.length ? months.map(([month, shipmentsInMonth]) => <section key={month} className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wider text-fuchsia-200">{new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'America/Lima' }).format(new Date(month + '-01T12:00:00Z'))}</h2>
      {shipmentsInMonth.map(shipment => <ShipmentRow key={shipment.id} shipment={shipment} />)}
    </section>) : <div className="card-base p-8 text-center"><Truck className="w-10 h-10 mx-auto text-purple-400 mb-3" /><p className="text-slate-300">No hay envíos para estos filtros.</p></div>}
  </div>;
}
