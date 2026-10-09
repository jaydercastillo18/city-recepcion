export default function Loading() {
  return (
    <div role="status" aria-label="Cargando asistencia" className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div className="attendance-panel h-32 animate-pulse" key={i} />
        ))}
      </div>
      <div className="attendance-panel h-72 animate-pulse" />
      <span className="sr-only">Cargando datos…</span>
    </div>
  );
}
