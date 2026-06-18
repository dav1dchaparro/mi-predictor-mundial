import Link from "next/link";
import { notFound } from "next/navigation";
import { getFixtureSummary, getMatchPrediction, getFixtures } from "@/lib/db/queries";
import { Panel, ProbBar, BigStat, pct } from "@/components/ui";
import { STRATEGY_LABELS, type ScorelineStrategy } from "@/lib/model";

// Una línea por estrategia: descripción corta para el menú comparativo.
const STRATEGY_HINT: Record<ScorelineStrategy, string> = {
  "mas-probable": "el más probable de la matriz — óptimo para clavar el exacto (13.7% backtest)",
  "ev-optimo": "maximiza puntos de polla — tiende a 1-0",
  "goles-esperados": "redondea los goles esperados — realista pero clava menos",
  "condicional-1x2": "resultado 1X2 más probable + su marcador modal",
};

// Export estático: pre-genera una página por partido y no admite otros params.
export const dynamicParams = false;
export function generateStaticParams() {
  return getFixtures().map((f) => ({ id: String(f.id) }));
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fixtureId = Number(id);
  const fx = getFixtureSummary(fixtureId);
  const pred = getMatchPrediction(fixtureId);
  if (!fx || !pred) notFound();

  const m = pred.markets;
  // El marcador lo decide el modelo; Betano es input (anclaje) y referencia.
  const rec = pred.recommended;
  const ref = pred.betanoReference;
  const srcLabel: Record<string, string> = {
    "market-anchored": "Modelo, anclado al consenso de Betano + Pinnacle",
    "model": "Modelo (sin cuotas todavía)",
  };

  return (
    <div className="space-y-8">
      {/* Cabecera del partido */}
      <div className="border-b border-line pb-6">
        <div className="uptick text-[10px] text-muted">
          {fx.venue ? `${fx.venue} · ` : ""}Grupo {fx.groupLetter}
        </div>
        <div className="mt-2 flex items-center justify-center gap-6 text-center">
          <div className="flex-1 text-right text-2xl font-bold text-chalk md:text-3xl">{pred.homeName}</div>
          <div className="tnum text-acid text-lg">
            {pred.lambdaHome.toFixed(2)} · {pred.lambdaAway.toFixed(2)}
          </div>
          <div className="flex-1 text-left text-2xl font-bold text-chalk md:text-3xl">{pred.awayName}</div>
        </div>
        <div className="mt-1 text-center uptick text-[10px] text-muted">Goles esperados (xG modelo)</div>
        {pred.marketUsed && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-[10px] uptick text-muted">
            <span className="text-acid">● Consenso Betano + Pinnacle</span>
            <span>1X2: {pred.marketUsed.home} / {pred.marketUsed.draw} / {pred.marketUsed.away}</span>
            {pred.marketUsed.ouOver && (
              <span>Más/Menos 2.5: {pred.marketUsed.ouOver} / {pred.marketUsed.ouUnder}</span>
            )}
          </div>
        )}
      </div>

      {/* 1X2 grande */}
      <div className="grid grid-cols-3 gap-px bg-line">
        <div className="bg-panel p-5 text-center">
          <BigStat value={pct(m.result.home)} label={`Gana ${pred.homeName}`} accent={m.result.home >= m.result.away} />
        </div>
        <div className="bg-panel p-5 text-center">
          <BigStat value={pct(m.result.draw)} label="Empate" />
        </div>
        <div className="bg-panel p-5 text-center">
          <BigStat value={pct(m.result.away)} label={`Gana ${pred.awayName}`} accent={m.result.away > m.result.home} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Marcador a jugar en el prode */}
        <Panel title="Marcador para tu prode" accent>
          <div className="flex items-end justify-between">
            <BigStat value={`${rec.home}-${rec.away}`} label="Marcador a jugar" accent />
            {rec.prob != null && (
              <div className="text-right">
                <div className="tnum text-2xl text-chalk">{pct(rec.prob)}</div>
                <div className="uptick text-[10px] text-muted">Probabilidad</div>
              </div>
            )}
          </div>
          <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-muted">
            Estrategia <span className="text-acid">{STRATEGY_LABELS[pred.scorelineStrategy]}</span>:
            {" "}{STRATEGY_HINT[pred.scorelineStrategy]}. {srcLabel[rec.source]}.
          </p>
          {ref && (
            <div className="mt-2 flex items-center justify-between border-t border-line pt-3 text-xs">
              <span className="uptick text-[10px] text-muted">Referencia Betano</span>
              <span className={ref.agrees ? "text-acid" : "text-chalk"}>
                {ref.home}-{ref.away} {ref.agrees ? "· coincide ✓" : "· difiere"}
              </span>
            </div>
          )}
        </Panel>

        {/* Menú comparativo: qué marcador da cada estrategia */}
        <Panel title="Marcador según la estrategia">
          <div className="space-y-2">
            {(Object.keys(pred.scorelineOptions) as ScorelineStrategy[]).map((key) => {
              const s = pred.scorelineOptions[key];
              const active = key === pred.scorelineStrategy;
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between border px-3 py-2 ${active ? "border-acid" : "border-line"}`}
                >
                  <span className="min-w-0">
                    <span className={`text-sm ${active ? "text-acid" : "text-chalk"}`}>
                      {STRATEGY_LABELS[key]}{active ? " ·" : ""}
                    </span>
                    <span className="block uptick text-[10px] text-muted">{STRATEGY_HINT[key]}</span>
                  </span>
                  <span className="flex items-center gap-3 pl-3">
                    <span className={`tnum text-lg ${active ? "text-acid" : "text-chalk"}`}>{s.home}-{s.away}</span>
                    <span className="tnum w-12 text-right text-[10px] text-muted">{pct(s.prob)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Top 5 marcadores exactos */}
        <Panel title="Marcadores exactos más probables">
          <div className="space-y-2">
            {m.topScores.map((s) => (
              <ProbBar key={`${s.home}-${s.away}`} label={`${s.home} - ${s.away}`} value={s.prob} />
            ))}
          </div>
        </Panel>

        {/* Goles */}
        <Panel title="Goles · Over / Under">
          <div className="space-y-2">
            {m.overUnder.map((ou) => (
              <ProbBar key={ou.line} label={`Over ${ou.line}`} value={ou.over} />
            ))}
            <div className="pt-2">
              <ProbBar label="Ambos marcan" value={m.bttsYes} />
            </div>
          </div>
        </Panel>

        {/* Doble oportunidad + portería a cero */}
        <Panel title="Doble oportunidad y portería a cero">
          <div className="space-y-2">
            <ProbBar label="1X" value={m.doubleChance.homeOrDraw} />
            <ProbBar label="12" value={m.doubleChance.homeOrAway} />
            <ProbBar label="X2" value={m.doubleChance.drawOrAway} />
            <div className="pt-2 space-y-2">
              <ProbBar label="Cero local" value={m.cleanSheet.home} />
              <ProbBar label="Cero visita" value={m.cleanSheet.away} />
            </div>
          </div>
        </Panel>
      </div>

      <div className="flex items-center justify-between">
        <Link href={`/grupo/${fx.groupLetter}`} className="uptick text-xs text-muted hover:text-acid">
          ← Grupo {fx.groupLetter}
        </Link>
        <Link href={`/captura/partido/${fx.id}`} className="uptick text-xs text-acid hover:underline">
          Modo captura ↗
        </Link>
      </div>
    </div>
  );
}
