import { getTournamentOdds } from "@/lib/db/queries";
import { CaptureFrame } from "@/components/capture";
import { pct } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function CaptureTournament() {
  const odds = getTournamentOdds();
  if (!odds) return <CaptureFrame><div className="text-center text-muted">Sin proyección.</div></CaptureFrame>;

  const champ = odds[0]!;
  const top8 = odds.slice(0, 8);

  return (
    <CaptureFrame>
      <div className="text-center">
        <div className="uptick text-[10px] text-muted">Favorito al título</div>
        <div className="mt-1 text-4xl font-bold text-acid">{champ.name}</div>
        <div className="tnum mt-2 text-7xl font-bold text-chalk">{pct(champ.champion)}</div>
        <div className="uptick text-[10px] text-muted">de ser campeón · 10.000 sims</div>
      </div>

      <div className="space-y-2">
        {top8.map((o, i) => (
          <div key={o.name} className="flex items-center gap-3">
            <span className="tnum w-6 text-muted">{String(i + 1).padStart(2, "0")}</span>
            <span className="flex-1 text-chalk">{o.name}</span>
            <div className="h-2 w-24 bg-line">
              <div className="h-full bg-acid" style={{ width: `${(o.champion / champ.champion) * 100}%` }} />
            </div>
            <span className="tnum w-14 text-right text-sm text-chalk">{pct(o.champion)}</span>
          </div>
        ))}
      </div>
    </CaptureFrame>
  );
}
