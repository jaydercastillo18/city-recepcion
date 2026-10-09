import { Truck, PackageCheck, Boxes, ArrowRight } from 'lucide-react';

export default function WarehouseHero() {
  return <section className="warehouse-hero rounded-2xl p-5 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 overflow-hidden">
    <div className="max-w-sm">
      <p className="text-fuchsia-200 text-xs font-semibold tracking-widest mb-2">CITY OFERTAS · CHIMBOTE</p>
      <h2 className="text-white text-2xl sm:text-3xl font-bold leading-tight">Cada caja cuenta.</h2>
      <p className="text-purple-100 text-sm mt-2">Escanea, recibe y controla tu mercadería en un solo lugar.</p>
    </div>
    <div className="flex items-center gap-3 sm:gap-5 text-white" role="img" aria-label="Camión de mercadería, cajas y recepción de productos">
      <div className="rounded-2xl bg-white/10 border border-white/20 p-4"><Truck className="w-16 h-16 sm:w-24 sm:h-24" strokeWidth={1.3} /></div>
      <ArrowRight className="w-5 h-5 text-fuchsia-200" />
      <div className="space-y-3"><Boxes className="w-10 h-10 text-fuchsia-200" /><PackageCheck className="w-10 h-10 text-white" /></div>
    </div>
  </section>;
}
