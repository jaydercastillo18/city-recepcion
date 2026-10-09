'use client';

import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ScanLine, X } from 'lucide-react';
import type { IScannerControls } from '@zxing/browser';
import type { ShipmentItem } from '@/types';
import { findCodeMatches } from '@/lib/reception';
import { registerBoxReception } from '@/features/reception/actions';

interface Props {
  shipmentId: string;
  items: ShipmentItem[];
  onUpdate: (item: Partial<ShipmentItem> & { id: string }) => void;
  onSelect: (id: string) => void;
}

export default function CameraScanner(props: Props) {
  const [open, setOpen] = useState(false);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger className="btn-primary flex-1"><ScanLine className="w-5 h-5" /> Escanear caja</Dialog.Trigger>
    {open && <ScannerSession {...props} />}
  </Dialog.Root>;
}

function ScannerSession({ shipmentId, items, onUpdate, onSelect }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const armed = useRef(true);
  const busy = useRef(false);
  const alive = useRef(true);
  const controls = useRef<IScannerControls | null>(null);
  const auto = useRef(false);
  const latest = useRef({ items, onUpdate, onSelect });
  useEffect(() => { latest.current = { items, onUpdate, onSelect }; }, [items, onUpdate, onSelect]);
  const [automatic, setAutomatic] = useState(false);
  const [manual, setManual] = useState('');
  const [message, setMessage] = useState('Apunta al código de barras de la caja.');
  const [cameraError, setCameraError] = useState('');
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [paused, setPaused] = useState(false);
  const [matchedId, setMatchedId] = useState<string | null>(null);
  const [candidateIds, setCandidateIds] = useState<string[]>([]);
  const selected = items.find(i => i.id === matchedId);

  async function addBox(item: ShipmentItem) {
    if (busy.current) return;
    if (item.received_boxes >= item.expected_boxes && !window.confirm(`¿Confirmas registrar una caja en exceso para ${item.code_original}?`)) return;
    busy.current = true;
    setPending(true);
    try {
      const result = await registerBoxReception(item.id, 'receive', 1, shipmentId, 'Escaneo de caja');
      if (result.success) {
        latest.current.onUpdate({ id: item.id, received_boxes: result.new_quantity!, status: result.status! });
        if (alive.current) setMessage(`+1 registrado: ${result.new_quantity} de ${item.expected_boxes} cajas.`);
      } else if (alive.current) setMessage(result.error || 'No se pudo registrar. Intenta nuevamente.');
    } catch {
      if (alive.current) setMessage('No se pudo confirmar el registro. Revisa la cantidad antes de reintentar.');
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }

  const accept = useRef<(code: string, allowAuto?: boolean) => void>(() => {});
  useEffect(() => {
    accept.current = (code, allowAuto = true) => {
      if (!armed.current || busy.current) return;
      armed.current = false;
      setPaused(true);
      setMatchedId(null);
      const matches = findCodeMatches(latest.current.items, code);
      setCandidateIds(matches.length > 1 ? matches.map(i => i.id) : []);
      if (!matches.length) { setMessage('Código no encontrado en este envío'); return; }
      if (matches.length > 1) { setMessage('Código repetido: selecciona el producto correcto.'); return; }
      const item = matches[0];
      setMatchedId(item.id);
      latest.current.onSelect(item.id);
      setMessage(`Código leído: ${code}`);
      if (auto.current && allowAuto) void addBox(item);
    };
  });

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    const element = video.current;
    function stop() {
      controls.current?.stop();
      const stream = element?.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach(track => track.stop());
    }
    async function start() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('La cámara necesita HTTPS (o localhost). Puedes ingresar el código manualmente.');
        return;
      }
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled || !element) return;
        const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 350 });
        const scannerControls = await reader.decodeFromConstraints({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } }, element,
          result => { if (!cancelled && result) accept.current(result.getText()); });
        if (cancelled) { scannerControls.stop(); stop(); return; }
        controls.current = scannerControls;
        setReady(true);
      } catch (error) {
        stop();
        if (!cancelled) setCameraError(error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Permiso de cámara denegado. Habilítalo en el navegador o ingresa el código manualmente.'
          : 'No se pudo abrir la cámara. Revisa que esté disponible o ingresa el código manualmente.');
      }
    }
    void start();
    const onVisibility = () => { if (document.hidden) { armed.current = false; setPaused(true); } };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { cancelled = true; alive.current = false; stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  async function readText() {
    if (busy.current || !video.current?.videoWidth) return;
    armed.current = false;
    setPaused(true);
    setMatchedId(null);
    setCandidateIds([]);
    busy.current = true;
    setPending(true);
    setMessage('Leyendo texto de la etiqueta… La primera lectura puede tardar.');
    let worker: Awaited<ReturnType<typeof import('tesseract.js').createWorker>> | undefined;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.current.videoWidth;
      canvas.height = video.current.videoHeight;
      canvas.getContext('2d')!.drawImage(video.current, 0, 0);
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker('eng');
      const { data } = await worker.recognize(canvas);
      if (!alive.current) return;
      const codes = [...data.text.split(/\r?\n/), ...data.text.split(/\s+/)];
      const matches = latest.current.items.filter(i => codes.some(code => findCodeMatches([i], code).length));
      // OCR always needs explicit confirmation, even with automatic barcode mode.
      if (matches.length === 1) {
        setMatchedId(matches[0].id);
        latest.current.onSelect(matches[0].id);
        setMessage('Texto reconocido. Verifica el producto y pulsa +1 caja.');
      } else {
        setCandidateIds(matches.map(i => i.id));
        setMessage(matches.length ? 'Se reconocieron varios productos. Selecciona uno.' : 'Código no encontrado en este envío');
      }
    } catch {
      if (alive.current) setMessage('No se pudo leer el texto. Acerca la etiqueta o ingresa el código manualmente.');
    } finally {
      await worker?.terminate();
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }

  return <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/75" />
    <Dialog.Content onEscapeKeyDown={event => { if (busy.current) event.preventDefault(); }}
      onPointerDownOutside={event => { if (busy.current) event.preventDefault(); }}
      className="fixed z-50 inset-x-2 top-[3dvh] mx-auto max-w-lg max-h-[94dvh] overflow-y-auto card-base p-4 space-y-3 shadow-2xl">
      <div className="flex justify-between items-center"><Dialog.Title className="text-lg font-bold">Escanear mercadería</Dialog.Title>
        <Dialog.Close className="btn-ghost p-2" aria-label="Cerrar escáner" disabled={pending}><X className="w-5 h-5" /></Dialog.Close></div>
      <Dialog.Description className="text-sm text-slate-300">Usa el código existente de la caja. No necesitas crear un QR.</Dialog.Description>
      <video ref={video} autoPlay muted playsInline className="w-full aspect-video rounded-xl bg-black object-cover" />
      {cameraError && <p role="alert" className="text-amber-300 text-sm">{cameraError}</p>}
      <p role="status" aria-live="polite" className="text-sm text-fuchsia-200">{message}</p>
      <label className="flex gap-3 items-center min-h-12"><input type="checkbox" checked={automatic} disabled={pending} onChange={e => { setAutomatic(e.target.checked); auto.current = e.target.checked; }} className="w-5 h-5" />Auto registrar +1 por lectura de barras</label>
      {selected && <div className="rounded-xl border border-fuchsia-500/40 p-3 space-y-2">
        <p className="font-mono text-fuchsia-200">{selected.code_original}</p><p className="font-bold">{selected.product_name}</p>
        <p className="text-sm text-slate-300">{selected.supplier} · {selected.received_boxes} / {selected.expected_boxes} cajas</p>
        <button disabled={pending} className="btn-success w-full" onClick={() => void addBox(selected)}>{pending ? 'Registrando…' : '+1 caja'}</button>
      </div>}
      {candidateIds.map(id => { const item = items.find(i => i.id === id)!; return <button key={id} disabled={pending} className="btn-ghost w-full text-left" onClick={() => { setMatchedId(id); setCandidateIds([]); onSelect(id); }}>{item.code_original} · {item.product_name} · {item.supplier}</button>; })}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary flex-1" disabled={pending || !paused} onClick={() => { setMatchedId(null); setCandidateIds([]); armed.current = true; setPaused(false); setMessage('Apunta a la siguiente caja.'); }}>Escanear siguiente caja</button>
        <button className="btn-ghost" disabled={!ready || pending} onClick={() => void readText()}>Leer texto de etiqueta</button>
      </div>
      <form className="space-y-2 border-t border-slate-700 pt-3" onSubmit={e => { e.preventDefault(); armed.current = true; accept.current(manual, false); }}>
        <label htmlFor="scan-manual" className="text-sm">Si no reconoce: ingresa el código</label>
        <input id="scan-manual" className="input-search" value={manual} onChange={e => setManual(e.target.value)} autoComplete="off" />
        <button className="btn-ghost w-full" disabled={pending || !manual.trim()}>Buscar en este envío</button>
      </form>
    </Dialog.Content>
  </Dialog.Portal>;
}
