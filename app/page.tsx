import Link from "next/link";
import { getTournamentOdds, getGoldenBoot, getGroupLetters } from "@/lib/db/queries";
import { Panel, ProbBar, BigStat, pct } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function Home() {
  const odds = getTournamentOdds();
  const boot = getGoldenBoot(8);
  const groups = getGroupLetters();

  if (!odds) {
    return (
      <div className="text-muted">
        No hay proyección todavía. Corre <code className="text-acid">pnpm cron:run</code> para generarla.
      </div>
    );
  }

  const champ = odds[0];
  const top12 = odds.slice(0, 12);

  return (
    <div className="space-y-8">
      {/* Hero: favorito al título */}
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-6">
        <div>
          <div className="uptick text-[10px] text-muted">Favorito al título · 10.000 simulaciones</div>
          <div className="mt-1 text-5xl font-bold text-chalk md:text-6xl">{champ?.name}</div>
          <Link href="/captura/torneo" className="mt-2 inline-block uptick text-[10px] text-acid hover:underline">
            Modo captura ↗
          </Link>
        </div>
        <div className="flex gap-8">
          <BigStat value={pct(champ?.champion ?? 0)} label="Campeón" accent />
          <BigStat value={pct(champ?.finalist ?? 0)} label="Llega a la final" />
          <BigStat value={pct(champ?.semifinal ?? 0)} label="Semifinal" />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Probabilidad de campeón · Top 12" accent>
          <div className="space-y-2">
            {top12.map((o) => (
              <ProbBar key={o.name} label={o.name} value={o.champion} />
            ))}
          </div>
        </Panel>

        <Panel title="Carrera por la Bota de Oro (goles proy.)">
          <div className="space-y-3">
            {boot.map((b, i) => (
              <div key={b.name} className="flex items-center justify-between border-b border-line/50 pb-2">
                <span className="flex items-center gap-3">
                  <span className="tnum w-6 text-muted">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-chalk">{b.name}</span>
                </span>
                <span className="tnum text-acid">{b.avgGoals.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Grupos">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {groups.map((g) => (
            <Link
              key={g}
              href={`/grupo/${g}`}
              className="border border-line py-3 text-center text-lg font-bold text-chalk transition-colors hover:border-acid hover:text-acid"
            >
              {g}
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}
