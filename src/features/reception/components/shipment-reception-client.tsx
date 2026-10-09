'use client';
// ============================================================
// CITY RECEPCIÓN - Cliente principal de recepción de envío
// Maneja búsqueda, filtros y lista de items
// ============================================================
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Search, X, Zap } from 'lucide-react';
import { searchItems } from '@/lib/search/search';
import ItemCard from './item-card';
import CameraScanner from './camera-scanner';
import ShipmentHeader from './shipment-header';
import { receptionStats } from '@/lib/reception';
import type { Shipment, ShipmentItem, SearchFilter, ItemStatus } from '@/types';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface ShipmentReceptionClientProps {
  shipment: Shipment;
  initialItems: ShipmentItem[];
  isAdmin?: boolean;
}

const FILTERS: { value: SearchFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'missing', label: 'Solo faltantes' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'partial', label: 'Parciales' },
  { value: 'complete', label: 'Completos' },
  { value: 'excess', label: 'Excesos' },
];

const DEBOUNCE_MS = 150; // 150ms debounce - rápido para almacén

export default function ShipmentReceptionClient({
  shipment,
  initialItems,
  isAdmin,
}: ShipmentReceptionClientProps) {
  const [items, setItems] = useState<ShipmentItem[]>(initialItems);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<SearchFilter>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce de búsqueda
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  // Actualizar item localmente (feedback inmediato sin recargar página)
  const handleItemUpdate = useCallback(
    (updatedFields: Partial<ShipmentItem> & { id: string }) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === updatedFields.id ? { ...item, ...updatedFields } : item
        )
      );
    },
    []
  );

  // Filtrar por status primero, luego buscar
  const filteredByStatus = useMemo(() => {
    if (activeFilter === 'all') return items;
    if (activeFilter === 'missing') return items.filter(item => item.expected_boxes - item.received_boxes > 0);
    return items.filter((item) => item.status === (activeFilter as ItemStatus));
  }, [items, activeFilter]);

  // Aplicar búsqueda
  const displayedItems = useMemo(() => {
    return searchItems(filteredByStatus, debouncedQuery);
  }, [filteredByStatus, debouncedQuery]);

  function clearSearch() {
    setQuery('');
    searchInputRef.current?.focus();
  }

  // Contador por status para badges en filtros
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length, missing: items.filter(i => i.expected_boxes > i.received_boxes).length };
    for (const item of items) {
      counts[item.status] = (counts[item.status] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  return (
    <div className="space-y-4">
      <ShipmentHeader shipment={shipment} stats={receptionStats(items)} isAdmin={isAdmin} />
      {/* Buscador principal */}
      <div className="card-base p-4 space-y-3">
        <div className="relative">
          <label htmlFor="search-input" className="sr-only">
            Buscar código, producto o proveedor
          </label>
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"
            aria-hidden="true"
          />
          <input
            ref={searchInputRef}
            id="search-input"
            type="search"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar código, producto o proveedor..."
            className="input-search pl-12 pr-12"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={clearSearch}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 transition-colors rounded"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Filtros por status */}
        <div
          className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none"
          role="group"
          aria-label="Filtros por estado"
        >
          {FILTERS.map((filter) => {
            const count = statusCounts[filter.value] ?? 0;
            return (
              <button
                key={filter.value}
                id={`btn-filter-${filter.value}`}
                onClick={() => setActiveFilter(filter.value)}
                className={cn(
                  'flex-shrink-0 flex items-center gap-1.5 px-3 py-3 min-h-12 rounded-lg text-sm font-medium transition-all duration-150',
                  activeFilter === filter.value
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/30'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 border border-slate-700'
                )}
                aria-pressed={activeFilter === filter.value}
              >
                {filter.label}
                {count > 0 && (
                  <span
                    className={cn(
                      'text-xs px-1.5 py-0.5 rounded-full tabular-nums',
                      activeFilter === filter.value
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-700 text-slate-400'
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Botón modo recepción rápida */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href={`/recepcion/${shipment.id}/rapida`}
          id="btn-quick-reception"
          className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 text-amber-300 hover:bg-slate-800 hover:border-amber-400/70 transition-all text-sm font-semibold shadow-sm"
        >
          <Zap className="w-4 h-4 text-amber-400 fill-amber-400" aria-hidden="true" />
          MODO RECEPCIÓN RÁPIDA
        </Link>
        <CameraScanner shipmentId={shipment.id} items={items} onUpdate={handleItemUpdate} onSelect={setSelectedId} />
      </div>

      {selectedId && items.some(i => i.id === selectedId) && <section className="space-y-2" aria-label="Producto escaneado">
        <div className="flex justify-between items-center"><h2 className="text-fuchsia-200 font-semibold">Producto escaneado</h2><button className="btn-ghost p-2" onClick={() => setSelectedId(null)} aria-label="Cerrar producto escaneado"><X className="w-4 h-4" /></button></div>
        <ItemCard item={items.find(i => i.id === selectedId)!} shipmentId={shipment.id} onUpdate={handleItemUpdate} />
      </section>}
      {/* Resultados */}
      <div>
        {/* Contador de resultados */}
        <div className="flex items-center justify-between mb-3 px-1">
          <p className="text-sm text-slate-400">
            {debouncedQuery ? (
              <>
                <span className="text-white font-medium">{displayedItems.length}</span>{' '}
                resultado{displayedItems.length !== 1 ? 's' : ''} para{' '}
                <span className="text-blue-300 font-mono">&quot;{debouncedQuery}&quot;</span>
              </>
            ) : (
              <>
                Mostrando{' '}
                <span className="text-white font-medium">{displayedItems.length}</span>{' '}
                producto{displayedItems.length !== 1 ? 's' : ''}
              </>
            )}
          </p>
        </div>

        {/* Lista */}
        {displayedItems.length === 0 ? (
          <div className="card-base p-10 text-center fade-in">
            <Search
              className="w-10 h-10 text-slate-700 mx-auto mb-3"
              aria-hidden="true"
            />
            <p className="text-slate-400 font-medium">Sin resultados</p>
            <p className="text-slate-600 text-sm mt-1">
              {debouncedQuery
                ? `No se encontró "${debouncedQuery}". Prueba con código, producto o proveedor.`
                : 'No hay productos en este estado.'}
            </p>
            {debouncedQuery && (
              <button
                onClick={clearSearch}
                className="mt-3 text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                Limpiar búsqueda
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
            {displayedItems.filter(item => item.id !== selectedId).map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                shipmentId={shipment.id}
                onUpdate={handleItemUpdate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
