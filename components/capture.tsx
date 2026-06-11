// Marco 9:16 para grabar clips verticales de Instagram/TikTok. Cubre la pantalla
// completa (sobre el header/footer del layout) con fondo propio. Centra un lienzo
// vertical con números gigantes, pensado para capturar con la grabadora.

export function CaptureFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink p-4">
      <div className="relative flex aspect-[9/16] h-full max-h-[100vh] w-auto max-w-full flex-col overflow-hidden border border-line bg-panel">
        {/* franja superior tipo broadcast */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <span className="uptick text-xs font-bold text-acid">IA · MUNDIAL 2026</span>
          <span className="flex items-center gap-2 uptick text-[10px] text-muted">
            <span className="inline-block h-2 w-2 animate-pulse bg-warn" /> LIVE MODEL
          </span>
        </div>
        <div className="flex flex-1 flex-col justify-center gap-6 px-6">{children}</div>
        <div className="border-t border-line px-5 py-3 text-center uptick text-[9px] text-muted">
          Análisis estadístico · No es asesoría de apuestas
        </div>
      </div>
    </div>
  );
}

export function CaptureStat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <div className={`tnum text-6xl font-bold leading-none ${accent ? "text-acid" : "text-chalk"}`}>{value}</div>
      <div className="mt-2 uptick text-[11px] text-muted">{label}</div>
    </div>
  );
}
