// Componentes visuales del look "terminal de datos". Server components puros.

export const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Color por nivel de probabilidad: acento para alto, atenuado para bajo. */
function heat(p: number): string {
  if (p >= 0.55) return "bg-acid";
  if (p >= 0.33) return "bg-acid/60";
  if (p >= 0.18) return "bg-muted";
  return "bg-line";
}

/** Barra horizontal de probabilidad con valor a la derecha. */
export function ProbBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-xs uptick text-muted">{label}</span>
      <div className="h-2 flex-1 bg-line/60">
        <div className={`h-full ${heat(value)}`} style={{ width: `${Math.max(value * 100, 1)}%` }} />
      </div>
      <span className="tnum w-14 text-right text-sm text-chalk">{pct(value)}</span>
    </div>
  );
}

/** Panel con título tipo encabezado de broadcast. */
export function Panel({ title, children, accent }: { title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <section className="border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <h2 className={`uptick text-xs ${accent ? "text-acid" : "text-muted"}`}>{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Número grande protagonista con etiqueta. */
export function BigStat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div>
      <div className={`tnum text-4xl font-bold leading-none ${accent ? "text-acid" : "text-chalk"}`}>{value}</div>
      <div className="mt-1 uptick text-[10px] text-muted">{label}</div>
    </div>
  );
}
