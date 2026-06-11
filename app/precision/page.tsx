import Link from "next/link";
import { getValidationSummary } from "@/lib/backtest/summary";
import { Panel, BigStat, ProbBar, pct } from "@/components/ui";


export default function PrecisionPage() {
  const v = getValidationSummary();

  return (
    <div className="space-y-8">
      <div className="border-b border-line pb-6">
        <div className="uptick text-[10px] text-muted">Validación del modelo · backtest sobre torneos reales</div>
        <h1 className="mt-1 text-4xl font-bold text-chalk">Precisión</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          El modelo se corre sobre la fase de grupos de tres torneos ya jugados y
          se compara contra el resultado real. Sin trampas: mismos parámetros que
          usa el predictor en vivo.
        </p>
      </div>

      {/* Números protagonistas */}
      <div className="flex flex-wrap gap-10 border-b border-line pb-6">
        <BigStat value={pct(v.rate1X2)} label={`Acierto 1X2 · ${v.total} partidos`} accent />
        <BigStat value={`± ${(v.se1X2 * 100).toFixed(1)}%`} label="Margen (IC95 binomial)" />
        <BigStat value={pct(v.rateExact)} label="Marcador exacto" />
        <BigStat value={pct(v.decisiveHit / v.decisiveTotal)} label="Acierto en partidos decisivos" accent />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Acierto 1X2 por torneo" accent>
          <div className="space-y-3">
            {v.tournaments.map((t) => (
              <ProbBar key={t.name} label={`${t.name} (${t.matches})`} value={t.rate1X2} />
            ))}
          </div>
        </Panel>

        <Panel title="De dónde sale (y se topa) la precisión">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-line/50 pb-2">
              <span className="text-muted">Partidos decisivos</span>
              <span className="tnum text-acid">{v.decisiveHit}/{v.decisiveTotal} · {pct(v.decisiveHit / v.decisiveTotal)}</span>
            </div>
            <div className="flex justify-between border-b border-line/50 pb-2">
              <span className="text-muted">Empates (techo del modelo)</span>
              <span className="tnum text-warn">{v.drawTotal} · {pct(v.drawTotal / v.total)}</span>
            </div>
            <p className="pt-1 text-xs leading-relaxed text-muted">
              En partidos con ganador el modelo acierta ~{pct(v.decisiveHit / v.decisiveTotal)}.
              El límite lo ponen los empates: ningún modelo de máxima probabilidad
              los elige, porque el empate casi nunca supera al favorito en probabilidad.
            </p>
          </div>
        </Panel>
      </div>

      <Panel title="Marcador exacto y puntos de polla por torneo">
        <table className="w-full text-sm">
          <thead>
            <tr className="uptick text-[10px] text-muted">
              <th className="py-2 text-left font-normal">Torneo</th>
              <th className="py-2 text-right font-normal">1X2</th>
              <th className="py-2 text-right font-normal">Exacto</th>
              <th className="py-2 text-right font-normal">Puntos polla</th>
            </tr>
          </thead>
          <tbody>
            {v.tournaments.map((t) => (
              <tr key={t.name} className="border-t border-line/50">
                <td className="py-3 text-chalk">{t.name}</td>
                <td className="tnum py-3 text-right text-chalk">{pct(t.rate1X2)}</td>
                <td className="tnum py-3 text-right text-chalk">{pct(t.rateExact)}</td>
                <td className="tnum py-3 text-right text-muted">{t.pollaPoints}/{t.pollaMax}</td>
              </tr>
            ))}
            <tr className="border-t border-line">
              <td className="py-3 font-bold text-acid">Agregado</td>
              <td className="tnum py-3 text-right font-bold text-acid">{pct(v.rate1X2)}</td>
              <td className="tnum py-3 text-right font-bold text-acid">{pct(v.rateExact)}</td>
              <td className="tnum py-3 text-right text-chalk">{v.pollaPoints}/{v.pollaMax}</td>
            </tr>
          </tbody>
        </table>
      </Panel>

      <Link href="/" className="inline-block uptick text-xs text-muted hover:text-acid">← Volver al torneo</Link>
    </div>
  );
}
