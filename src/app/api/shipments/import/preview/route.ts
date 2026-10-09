import { NextResponse } from 'next/server';
import { importErrorResponse, readImportUpload, requireImportAdmin } from '@/features/shipments/import/http';

export async function POST(request: Request) {
  try {
    await requireImportAdmin(request);
    const { preview } = await readImportUpload(request);
    // Read only: no file storage or database writes before explicit confirmation.
    return NextResponse.json({ preview }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return importErrorResponse(error); }
}
