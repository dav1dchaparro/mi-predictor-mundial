import { notFound } from "next/navigation";
import { getFixtureSummary, getMatchPrediction, getFixtures } from "@/lib/db/queries";
import { CaptureFrame, CaptureStat } from "@/components/capture";
import { pct } from "@/components/ui";

// Export estático: pre-genera una página por partido y no admite otros params.
export const dynamicParams = false;
export function generateStaticParams() {
  return getFixtures().map((f) => ({ id: String(f.id) }));
}

export default async function CaptureMatch({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fx = getFixtureSummary(Number(id));
  const pred = getMatchPrediction(Number(id));
  if (!fx || !pred) notFound();

  const m = pred.markets;
  const rec = pred.recommended;

  return (
    <CaptureFrame>
      {/* enfrentamiento */}
      <div className="text-center">
        <div className="text-3xl font-bold leading-tight text-chalk">{pred.homeName}</div>
        <div className="my-2 uptick text-xs text-muted">vs</div>
        <div className="text-3xl font-bold leading-tight text-chalk">{pred.awayName}</div>
        <div className="mt-3 uptick text-[10px] text-muted">{fx.venue ? `${fx.venue} · ` : ""}Grupo {fx.groupLetter}</div>
      </div>

      {/* 1X2 */}
      <div className="grid grid-cols-3 gap-px bg-line">
        <div className="bg-panel py-4"><CaptureStat value={pct(m.result.home)} label="Local" accent={m.result.home >= m.result.away} /></div>
        <div className="bg-panel py-4"><CaptureStat value={pct(m.result.draw)} label="Empate" /></div>
        <div className="bg-panel py-4"><CaptureStat value={pct(m.result.away)} label="Visita" accent={m.result.away > m.result.home} /></div>
      </div>

      {/* marcador a jugar en el prode */}
      <div className="border border-acid p-5 text-center">
        <div className="tnum text-7xl font-bold text-acid">{rec.home}-{rec.away}</div>
        <div className="mt-2 uptick text-[11px] text-muted">
          Marcador a jugar{rec.prob != null ? ` · ${pct(rec.prob)} probable` : ""}
          {pred.marketAnchored ? " · Betano" : ""}
        </div>
      </div>
    </CaptureFrame>
  );
}
