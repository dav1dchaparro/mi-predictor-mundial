import Link from "next/link";
import { getFixtures } from "@/lib/db/queries";
import { Panel } from "@/components/ui";

// Los kickoff se guardan en UTC; el calendario oficial usa hora del Este (ET),
// así que agrupamos y mostramos en America/New_York para que el día y la hora
// coincidan con la referencia oficial (y no se corran según la zona del navegador).
const TZ = "America/New_York";
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ,
}); // -> YYYY-MM-DD en ET, sirve de clave de agrupado
const dayLabelFmt = new Intl.DateTimeFormat("es", {
  weekday: "long", day: "numeric", month: "long", timeZone: TZ,
});
const timeFmt = new Intl.DateTimeFormat("es", {
  hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ,
});
const labelDay = (dayKey: string) => {
  // dayKey es YYYY-MM-DD (en ET); a mediodía UTC para que el formateo ET no lo corra de día.
  const s = dayLabelFmt.format(new Date(`${dayKey}T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const labelTime = (kickoff: string) => timeFmt.format(new Date(kickoff));

export default function FixturesIndex() {
  const fixtures = getFixtures();

  // agrupar por día ET para una lista tipo programación de broadcast.
  // getFixtures() ya viene ordenado por kickoff, así que el Map preserva el
  // orden cronológico de los días y de los partidos dentro de cada día.
  const byDay = new Map<string, typeof fixtures>();
  for (const f of fixtures) {
    const day = dayKeyFmt.format(new Date(f.kickoff));
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(f);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-chalk">Partidos</h1>
      {[...byDay.entries()].map(([day, list]) => (
        <Panel key={day} title={labelDay(day)}>
          <div className="grid gap-2">
            {list.map((m) => (
              <Link
                key={m.id}
                href={`/partido/${m.id}`}
                className="flex items-center justify-between border border-line px-4 py-3 transition-colors hover:border-acid"
              >
                <span className="flex items-center gap-3">
                  <span className="tnum text-[11px] text-muted">{labelTime(m.kickoff)}</span>
                  <span className="text-chalk">
                    {m.homeName} <span className="text-muted">vs</span> {m.awayName}
                  </span>
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
