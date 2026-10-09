import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSameOriginRequest } from '@/lib/security/request-origin';
import { MAX_FILE_BYTES, parseShipmentFile } from './parser';

export class ImportHttpError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function requireImportAdmin(request: Request) {
  if (!isSameOriginRequest(request)) throw new ImportHttpError('Origen de solicitud no permitido.', 403);
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new ImportHttpError('Inicia sesión para importar.', 401);
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') throw new ImportHttpError('Solo los administradores pueden importar envíos.', 403);
  return supabase;
}

export async function readImportUpload(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data;')) throw new ImportHttpError('Selecciona un archivo de envío.');
  const limit = MAX_FILE_BYTES + 256 * 1024;
  if (Number(request.headers.get('content-length')) > limit) throw new ImportHttpError('El archivo supera 5 MB.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ImportHttpError('No se recibió el archivo.');
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel(); throw new ImportHttpError('El archivo supera 5 MB.', 413); }
    chunks.push(value);
  }
  let form: FormData;
  try { form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': contentType } }).formData(); }
  catch { throw new ImportHttpError('No se pudo leer la carga del archivo.'); }
  const file = form.get('file');
  if (!(file instanceof File)) throw new ImportHttpError('Selecciona un archivo .xlsx, .xls o .csv.');
  const sheet = form.get('sheetName');
  const preview = parseShipmentFile(new Uint8Array(await file.arrayBuffer()), file.name, typeof sheet === 'string' ? sheet : undefined);
  return { form, preview };
}

export function importErrorResponse(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo procesar la importación.' },
    { status: error instanceof ImportHttpError ? error.status : 400, headers: { 'Cache-Control': 'no-store' } });
}
