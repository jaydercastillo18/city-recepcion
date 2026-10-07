// ============================================================
// CITY RECEPCIÓN - Endpoint API: Descarga de Reporte PDF
// GET /api/reports/[shipmentId]/pdf
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { fetchReportData } from '@/lib/reports/fetch-report-data';
import { generateShipmentPdf } from '@/lib/reports/pdf-generator';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shipmentId: string }> }
) {
  try {
    const { shipmentId } = await params;

    const reportResult = await fetchReportData(shipmentId);
    if (!reportResult.success) {
      return new NextResponse(reportResult.error, {
        status: reportResult.status,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const { shipment } = reportResult.data;
    const pdfBytes = generateShipmentPdf(reportResult.data);

    // Sanitizar nombre de archivo
    const safeNumber = shipment.shipment_number.replace(/[^a-zA-Z0-9-_]/g, '_');
    const isCompleted = shipment.status === 'completed';
    const filename = `Reporte_${isCompleted ? 'Final' : 'Parcial'}_${safeNumber}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('[API PDF Report Error]:', error);
    return new NextResponse('Error interno al generar el reporte PDF.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
