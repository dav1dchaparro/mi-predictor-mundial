import Link from "next/link";
import { notFound } from "next/navigation";
import { getGroupProjection, getFixtures, getGroupLetters } from "@/lib/db/queries";
import { Panel, pct } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function GroupPage({ params }: { params: Promise<{ letter: string }> }) {
  const { letter } = await params;
  const L = letter.toUpperCase();
  if (!getGroupLetters().includes(L)) notFound();

  const standings = getGroupProjection(L);
  const matches = getFixtures().filter((f) => f.groupLetter === L);

  return (
    <div className="space-y-8">
      <div className="flex items-baseline gap-3">
        <span className="uptick text-xs text-muted">Grupo</span>
        <h1 className="text-5xl font-bold text-acid">{L}</h1>
      </div>

      <Panel title="Clasificación proyectada" accent>
        <table className="w-full text-sm">
          <thead>
            <tr className="uptick text-[10px] text-muted">
              <th className="py-2 text-left font-normal">#</th>
              <th className="py-2 text-left font-normal">Equipo</th>
              <th className="py-2 text-right font-normal">Gana grupo</th>
              <th className="py-2 text-right font-normal">Avanza</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
              <tr key={s.name} className="border-t border-line/50">
                <td className="tnum py-3 text-muted">{i + 1}</td>
                <td className="py-3 text-chalk">{s.name}</td>
                <td className="tnum py-3 text-right text-chalk">{pct(s.groupWinner)}</td>
                <td className={`tnum py-3 text-right ${i < 2 ? "text-acid" : "text-muted"}`}>{pct(s.roundOf32)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Partidos del grupo">
        <div className="grid gap-2">
          {matches.map((m) => (
            <Link
              key={m.id}
              href={`/partido/${m.id}`}
              className="flex items-center justify-between border border-line px-4 py-3 transition-colors hover:border-acid"
            >
              <span className="text-chalk">
                {m.homeName} <span className="text-muted">vs</span> {m.awayName}
              </span>
              <span className="uptick text-[10px] text-muted">{m.venue}</span>
            </Link>
          ))}
        </div>
      </Panel>

      <Link href="/" className="inline-block uptick text-xs text-muted hover:text-acid">
        ← Volver al torneo
      </Link>
    </div>
  );
}
