import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { importErrorResponse, ImportHttpError, readImportUpload, requireImportAdmin } from '@/features/shipments/import/http';
import { suggestShipmentNumber, validShipmentDate } from '@/features/shipments/import/format';
import { IMPORT_DESTINATION } from '@/features/shipments/import/config';
import type { ImportResult } from '@/features/shipments/import/types';
import type { Json } from '@/types/database';

export async function POST(request: Request) {
  try {
    const supabase = await requireImportAdmin(request);
    const { form, preview } = await readImportUpload(request);
    if (form.get('confirmed') !== 'true' || form.get('fingerprint') !== preview.fingerprint) {
      throw new ImportHttpError('Vuelve a revisar la vista previa antes de confirmar.');
    }
    if (preview.errors.length) throw new ImportHttpError('Corrige los errores del archivo antes de importar.');
    const destination = IMPORT_DESTINATION;
    const date = String(form.get('shipmentDate') ?? '');
    const number = suggestShipmentNumber(destination, date);
    const requestId = String(form.get('requestId') ?? '');
    if (!destination || destination.length > 120 || !validShipmentDate(date) || !number || number.length > 120
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId)) {
      throw new ImportHttpError('Revisa el destino, la fecha y el número del envío.');
    }
    // Reparse the original file. Never trust quantities/items sent from the browser.
    const { data, error } = await supabase.rpc('import_shipment_excel', {
      p_destination: destination, p_shipment_date: date, p_shipment_number: number,
      p_source_file_name: preview.fileName, p_source_file_sha256: preview.fileHash,
      p_import_rows: preview.rowsDetected, p_warnings: preview.warnings as unknown as Json,
      p_items: preview.items as unknown as Json, p_request_id: requestId,
    });
    if (error) {
      const missing = error.code === 'PGRST202' || error.code === '42883';
      throw new ImportHttpError(missing ? 'La importación aún no está habilitada. Aplica la migración import_shipments_excel en Supabase.' : error.message,
        missing ? 503 : error.code === '42501' ? 403 : 400);
    }
    const result = data as unknown as ImportResult;
    if (!result?.shipment_id) throw new ImportHttpError('No se pudo confirmar el resultado. Reintenta con la misma vista previa.', 500);
    revalidatePath('/admin/envios');
    revalidatePath('/recepcion');
    return NextResponse.json({ result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return importErrorResponse(error); }
}
