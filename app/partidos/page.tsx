import Link from "next/link";
import { getFixtures } from "@/lib/db/queries";
import { Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function FixturesIndex() {
  const fixtures = getFixtures();

  // agrupar por fecha (día) para una lista tipo programación de broadcast
  const byDay = new Map<string, typeof fixtures>();
  for (const f of fixtures) {
    const day = f.kickoff.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(f);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-chalk">Partidos</h1>
      {[...byDay.entries()].map(([day, list]) => (
        <Panel key={day} title={day}>
          <div className="grid gap-2">
            {list.map((m) => (
              <Link
                key={m.id}
                href={`/partido/${m.id}`}
                className="flex items-center justify-between border border-line px-4 py-3 transition-colors hover:border-acid"
              >
                <span className="text-chalk">
                  {m.homeName} <span className="text-muted">vs</span> {m.awayName}
                </span>
                <span className="uptick text-[10px] text-muted">
                  GRP {m.groupLetter}{m.venue ? ` · ${m.venue}` : ""}
                </span>
              </Link>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}
