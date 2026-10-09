'use client';
// ============================================================
// CITY RECEPCIÓN - useScannerSession
// Hook compartido con toda la lógica del escáner de cajas:
//   ZXing (código de barras), OCR (Tesseract), addBox RPC,
//   cooldown anti-doble-lectura, pausa, estado de cámara,
//   historial de sesión y feedback sonoro/háptico.
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import type { IScannerControls } from '@zxing/browser';
import type { ShipmentItem } from '@/types';
import { findCodeMatches } from '@/lib/reception';
import { registerBoxReception } from '@/features/reception/actions';

/** Entrada de historial de sesión (en memoria durante la sesión activa). */
export interface ScanHistoryItem {
  id: string;
  time: string;   // HH:MM:SS
  code: string;
  productName: string;
  supplier: string | null;
  delta: number;  // +1
  newQty: number;
  expectedQty: number;
}

/** Resultado y estado de escaneo para feedback visual gigante. */
export type ScanFeedback =
  | { kind: 'registered'; item: ShipmentItem; newQty: number }
  | { kind: 'preview'; item: ShipmentItem }
  | { kind: 'excess_pending'; item: ShipmentItem }
  | { kind: 'not_found'; code: string }
  | { kind: 'ambiguous'; candidates: ShipmentItem[]; code: string }
  | { kind: 'ocr_match'; item: ShipmentItem }
  | { kind: 'ocr_ambiguous'; candidates: ShipmentItem[] }
  | { kind: 'ocr_none' }
  | { kind: 'error'; message: string }
  | null;

export interface UseScannerSessionOptions {
  shipmentId: string;
  items: ShipmentItem[];
  onUpdate: (fields: Partial<ShipmentItem> & { id: string }) => void;
  onSelect?: (id: string) => void;
  defaultAutomatic?: boolean;
  cooldownMs?: number;
}

export function useScannerSession({
  shipmentId,
  items,
  onUpdate,
  onSelect,
  defaultAutomatic = true,
  cooldownMs = 1500,
}: UseScannerSessionOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Estados reactivos
  const [cameraError, setCameraError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pending, setPending] = useState(false);
  const [automatic, setAutomatic] = useState(defaultAutomatic);
  const [feedback, setFeedback] = useState<ScanFeedback>(null);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);

  // Refs para closures estables
  const armed = useRef(true);
  const busy = useRef(false);
  const alive = useRef(true);
  const auto = useRef(defaultAutomatic);
  const lastCode = useRef('');
  const lastCodeAt = useRef(0);
  const controls = useRef<IScannerControls | null>(null);
  const rearmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const latestItems = useRef(items);
  const latestOnUpdate = useRef(onUpdate);
  const latestOnSelect = useRef(onSelect);

  useEffect(() => { latestItems.current = items; }, [items]);
  useEffect(() => { latestOnUpdate.current = onUpdate; }, [onUpdate]);
  useEffect(() => { latestOnSelect.current = onSelect; }, [onSelect]);

  // Audio & Vibración
  const vibrate = useCallback((pattern: number | number[]) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    } catch {
      // Ignorar fallos de permisos o soporte
    }
  }, []);

  const beep = useCallback((type: 'success' | 'error' | 'warning') => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.18);
      } else if (type === 'warning') {
        osc.frequency.setValueAtTime(580, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.22);
      } else {
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        osc.frequency.setValueAtTime(240, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.28);
      }
    } catch {
      // Ignorar restricciones de audio del navegador
    }
  }, []);

  const pushHistory = useCallback((item: ShipmentItem, newQty: number) => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const entry: ScanHistoryItem = {
      id: `${item.id}-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      time,
      code: item.code_original,
      productName: item.product_name,
      supplier: item.supplier ?? null,
      delta: 1,
      newQty,
      expectedQty: item.expected_boxes,
    };
    setHistory(prev => [entry, ...prev].slice(0, 30));
  }, []);

  // Armar (reactivar escáner para la siguiente caja)
  const arm = useCallback(() => {
    if (rearmTimer.current) {
      clearTimeout(rearmTimer.current);
      rearmTimer.current = null;
    }
    armed.current = true;
    setPaused(false);
    setFeedback(null);
  }, []);

  // Pausar
  const pause = useCallback(() => {
    if (rearmTimer.current) {
      clearTimeout(rearmTimer.current);
      rearmTimer.current = null;
    }
    armed.current = false;
    setPaused(true);
  }, []);

  // Toggle de modo automático
  const setAutoMode = useCallback((val: boolean) => {
    setAutomatic(val);
    auto.current = val;
  }, []);

  // Registrar +1 caja mediante Server Action / RPC
  const addBox = useCallback(async (item: ShipmentItem, confirmExcess = false): Promise<void> => {
    if (busy.current) return;

    // Verificar si es exceso
    if (item.received_boxes >= item.expected_boxes && !confirmExcess) {
      if (alive.current) {
        armed.current = false;
        setPaused(true);
        setFeedback({ kind: 'excess_pending', item });
      }
      beep('warning');
      vibrate([100, 50, 100]);
      return;
    }

    busy.current = true;
    setPending(true);

    try {
      const result = await registerBoxReception(item.id, 'receive', 1, shipmentId, 'Escaneo de caja rápida');
      if (!alive.current) return;

      if (result.success && result.new_quantity !== undefined && result.status) {
        const updatedItem = {
          id: item.id,
          received_boxes: result.new_quantity,
          status: result.status,
        };
        latestOnUpdate.current(updatedItem);
        setFeedback({
          kind: 'registered',
          item: { ...item, received_boxes: result.new_quantity, status: result.status },
          newQty: result.new_quantity,
        });
        pushHistory(item, result.new_quantity);
        beep('success');
        vibrate(60);

        // Si está en modo automático y no hubo error, reactivar escáner tras pausa breve
        if (auto.current) {
          if (rearmTimer.current) clearTimeout(rearmTimer.current);
          rearmTimer.current = setTimeout(() => {
            if (alive.current && auto.current) {
              arm();
            }
          }, 1400);
        }
      } else {
        setFeedback({ kind: 'error', message: result.error || 'No se pudo registrar la caja. Intenta nuevamente.' });
        beep('error');
        vibrate([100, 50, 100]);
      }
    } catch {
      if (alive.current) {
        setFeedback({ kind: 'error', message: 'Error de red o comunicación. Verifica las cantidades antes de reintentar.' });
      }
      beep('error');
      vibrate([100, 50, 100]);
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }, [shipmentId, arm, beep, vibrate, pushHistory]);

  // Procesar código recibido de cámara o pistola USB
  const acceptCode = useCallback((code: string, isManual = false) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    if (!armed.current && !isManual) return;
    if (busy.current) return;

    // Cooldown anti-doble lectura para escaneo automático de cámara
    const now = Date.now();
    if (!isManual && trimmed === lastCode.current && (now - lastCodeAt.current) < cooldownMs) {
      return;
    }
    lastCode.current = trimmed;
    lastCodeAt.current = now;

    if (rearmTimer.current) {
      clearTimeout(rearmTimer.current);
      rearmTimer.current = null;
    }

    armed.current = false;
    setPaused(true);
    setFeedback(null);

    const matches = findCodeMatches(latestItems.current, trimmed);

    if (matches.length === 0) {
      setFeedback({ kind: 'not_found', code: trimmed });
      beep('error');
      vibrate([100, 50, 100]);
      return;
    }

    if (matches.length > 1) {
      setFeedback({ kind: 'ambiguous', candidates: matches, code: trimmed });
      latestOnSelect.current?.(matches[0].id);
      beep('warning');
      vibrate([100, 50]);
      return;
    }

    const matchedItem = matches[0];
    latestOnSelect.current?.(matchedItem.id);

    if (auto.current && !isManual) {
      void addBox(matchedItem, false);
    } else {
      setFeedback({ kind: 'preview', item: matchedItem });
      beep('success');
      vibrate(40);
    }
  }, [cooldownMs, beep, vibrate, addBox]);

  // Selección manual de candidato ambiguo
  const selectCandidate = useCallback((candidate: ShipmentItem) => {
    latestOnSelect.current?.(candidate.id);
    if (auto.current) {
      void addBox(candidate, false);
    } else {
      setFeedback({ kind: 'preview', item: candidate });
    }
  }, [addBox]);

  // Entrada manual o pistola de código
  const acceptManual = useCallback((code: string) => {
    armed.current = true;
    acceptCode(code, true);
  }, [acceptCode]);

  // Iniciar ZXing sobre videoRef
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    const element = videoRef.current;

    function stopCamera() {
      controls.current?.stop();
      controls.current = null;
      const stream = element?.srcObject;
      if (stream instanceof MediaStream) {
        stream.getTracks().forEach(t => t.stop());
      }
      if (element) {
        element.srcObject = null;
      }
    }

    async function startCamera() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('La cámara requiere HTTPS (o localhost). Puedes usar la entrada manual o pistola.');
        return;
      }

      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled || !element) return;

        const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 300 });
        const sc = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          element,
          result => {
            if (!cancelled && result) {
              acceptCode(result.getText(), false);
            }
          }
        );

        if (cancelled) {
          sc.stop();
          stopCamera();
          return;
        }

        controls.current = sc;
        setCameraReady(true);
        setCameraError('');
      } catch (error) {
        stopCamera();
        if (!cancelled) {
          setCameraReady(false);
          setCameraError(
            error instanceof DOMException && error.name === 'NotAllowedError'
              ? 'Permiso de cámara denegado. Concede permiso en el navegador o ingresa códigos manualmente.'
              : 'No se pudo acceder a la cámara. Revisa que no esté en uso por otra app.'
          );
        }
      }
    }

    void startCamera();

    const onVisibility = () => {
      if (document.hidden) {
        armed.current = false;
        setPaused(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      alive.current = false;
      if (rearmTimer.current) clearTimeout(rearmTimer.current);
      stopCamera();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [acceptCode]);

  // OCR Fallback con Tesseract
  const readTextOCR = useCallback(async (): Promise<void> => {
    if (busy.current || !videoRef.current?.videoWidth) return;

    if (rearmTimer.current) {
      clearTimeout(rearmTimer.current);
      rearmTimer.current = null;
    }

    armed.current = false;
    setPaused(true);
    setFeedback(null);
    busy.current = true;
    setPending(true);

    let worker: Awaited<ReturnType<typeof import('tesseract.js').createWorker>> | undefined;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas 2d context');
      ctx.drawImage(videoRef.current, 0, 0);

      const { createWorker } = await import('tesseract.js');
      worker = await createWorker('eng');
      const { data } = await worker.recognize(canvas);

      if (!alive.current) return;

      const tokens = [
        ...data.text.split(/\r?\n/),
        ...data.text.split(/\s+/),
      ].map(t => t.trim()).filter(Boolean);

      const matches = latestItems.current.filter(item =>
        tokens.some(token => findCodeMatches([item], token).length > 0)
      );

      if (matches.length === 1) {
        latestOnSelect.current?.(matches[0].id);
        setFeedback({ kind: 'ocr_match', item: matches[0] });
        beep('success');
      } else if (matches.length > 1) {
        setFeedback({ kind: 'ocr_ambiguous', candidates: matches });
        beep('warning');
      } else {
        setFeedback({ kind: 'ocr_none' });
        beep('error');
      }
    } catch {
      if (alive.current) {
        setFeedback({ kind: 'error', message: 'No se pudo procesar la imagen con OCR. Intenta enfocar la etiqueta o ingresar el código manual.' });
      }
      beep('error');
    } finally {
      await worker?.terminate();
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }, [beep]);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return {
    videoRef,
    cameraError,
    cameraReady,
    paused,
    pending,
    automatic,
    feedback,
    history,
    arm,
    pause,
    addBox,
    acceptManual,
    selectCandidate,
    setAutoMode,
    readTextOCR,
    clearHistory,
  };
}
